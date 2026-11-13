import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, configOf, selectConfig, selectOutdated } from '../../state/store';
import type { ResultFlight } from '../../services/flight/simulations';
import { configLabel } from '../../services/flight/flightConfigs';
import { launchDocs, type LaunchDevice, type LaunchDocs } from '../../services/flight/launchDocs';
import type { ChargeRow } from '../../services/flight/recoveryCharges';
import { designNameOf } from '../../services/app/appInfo';
import { motorFullName } from '../../services/motors/motorName';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import type { Units } from '../../prefs/useUnits';
import { fmtNum, partLabel, stageLabel, stagePrefixed, withFixedUnit } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { DialogButton } from '../common/DialogButton';
import { useSettings } from '../../state/useSettings';
import { highestLevel, orgLabel, type Flyer } from '../../services/storage/flyer';

type T = (key: string, opts?: Record<string, unknown>) => string;

const PRINTING = 'print-flight-card';

// Prints a copy portaled outside every scrolling pane, so a long card runs onto a second sheet.
export function FlightCard({ flight }: { flight: ResultFlight }) {
  const { t } = useTranslation();
  const u = useUnits();
  const { settings } = useSettings();
  const tree = useWorkspaceStore((s) => s.tree);
  const loadedMeta = useWorkspaceStore((s) => s.loadedMeta);
  const sim = useWorkspaceStore((s) => s.sims.find((x) => x.id === flight.id));
  const configs = useWorkspaceStore((s) => s.configs);
  const builtConfigId = useWorkspaceStore((s) => selectConfig(s).id);
  const info = useWorkspaceStore((s) => s.info);
  const outdated = useWorkspaceStore((s) => (sim ? selectOutdated(s, sim) : false));

  const docs = useMemo(() => {
    if (!sim) return null;
    const config = configOf(configs, sim);
    return launchDocs({
      designName: designNameOf(tree, loadedMeta),
      simName: sim.name,
      configName: configLabel(tree, config),
      outdated,
      tree,
      config,
      // The live build is only valid for its own configuration.
      info: config.id === builtConfigId ? info : null,
      flight: flight.result.summary,
      launch: flight.launch,
    });
  }, [sim, configs, tree, loadedMeta, outdated, builtConfigId, info, flight]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add(PRINTING);
    return () => html.classList.remove(PRINTING);
  }, []);

  if (!docs) return null;
  return (
    <div className="h-full overflow-auto p-3">
      <div className="mx-auto max-w-3xl rounded-xl bg-surface p-4 ring-1 ring-line/10">
        <div className="mb-3 flex justify-end">
          <DialogButton onClick={() => window.print()}>{t('launchDocs.print')}</DialogButton>
        </div>
        <CardBody docs={docs} flyer={settings.flyer} t={t} u={u} />
      </div>
      {createPortal(
        <div className="flight-card-print">
          <CardBody docs={docs} flyer={settings.flyer} t={t} u={u} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function deploysText(t: T, u: Units, d: LaunchDevice): string {
  const event = t(`deployEvent.${d.deployEvent}`);
  if (d.deployEvent === 'altitude')
    return t('launchDocs.deployAt', { event, altitude: u.fmtSym('distance', d.deployAltitudeM, 0) });
  if (d.deployDelayS > 0) return t('launchDocs.deployAfter', { event, delay: fmtNum(d.deployDelayS, 1) });
  return event;
}

const bayName = (t: T, c: ChargeRow): string =>
  stagePrefixed(
    t,
    c.stageName,
    t('bays.title', { role: t(`charges.role_${c.role}`), tube: c.tubeName || t('ejectionBay.unnamedTube') }),
  );

// eslint-disable-next-line complexity -- one card's conditional rows; a split would only move them
function CardBody({ docs, flyer, t, u }: { docs: LaunchDocs; flyer: Flyer; t: T; u: Units }) {
  const { info, flight } = docs;
  const held = highestLevel(flyer);
  const sec = (s: number | null | undefined) => (s == null ? NO_VALUE : withFixedUnit(s, t('units.second')));
  const grams = (kg: number | null) => (kg == null ? NO_VALUE : u.fmtSym('mass', kg, 2));
  return (
    <article className="flight-card space-y-4 text-sm text-ink">
      <header>
        <h2 className="text-lg font-semibold text-ink-strong">{t('launchDocs.cardTitle')}</h2>
        <p className="text-xs text-ink-muted">
          {t('launchDocs.subtitle', { design: docs.designName, sim: docs.simName, config: docs.configName })}
        </p>
        {docs.outdated && <p className="mt-1 text-xs italic text-warn-300">{t('report.outdatedFlight')}</p>}
      </header>

      <FlyerBlock flyer={flyer} t={t} />

      <Section title={t('launchDocs.rocket')}>
        {!info && <p className="mb-1 text-xs italic text-ink-muted">{t('launchDocs.otherConfig')}</p>}
        {held != null && docs.motors.length > 0 && held < docs.certLevel && (
          <p role="note" className="mb-1 text-xs font-semibold text-warn-300">
            ⚠{' '}
            {t('launchDocs.underCert', {
              held: t(`launchDocs.cert_${held}`),
              needed: t(`launchDocs.cert_${docs.certLevel}`),
            })}
          </p>
        )}
        <Pairs
          rows={[
            info && [t('report.length'), u.fmtSym('length', info.length)],
            info && [t('report.maxDiameter'), u.fmtSym('length', info.refDiameter)],
            info && [t('report.massLoaded'), u.fmtSym('mass', info.mass)],
            info && [t('report.cgLoaded'), u.fmtSym('length', info.cg)],
            info && [t('report.cp'), Number.isFinite(info.cp) && info.cp > 0 ? u.fmtSym('length', info.cp) : NO_VALUE],
            info && [
              t('report.stabilityCal'),
              Number.isFinite(info.stabilityCalibers)
                ? `${fmtNum(info.stabilityCalibers, 2)} ${t('stability.caliber')}`
                : NO_VALUE,
            ],
            [
              t('launchDocs.certNeeded'),
              docs.motors.length
                ? t('launchDocs.certNote', {
                    level: t(`launchDocs.cert_${docs.certLevel}`),
                    cls: docs.installedClass,
                    impulse: withFixedUnit(docs.installedImpulseNs, 'N·s', 0),
                  })
                : NO_VALUE,
            ],
          ]}
        />
      </Section>

      {docs.motors.length > 0 && (
        <Section title={t('launchDocs.motors')}>
          <Table
            head={[
              t('launchDocs.stage'),
              t('launchDocs.mount'),
              t('report.motor'),
              t('launchDocs.count'),
              t('launchDocs.impulseClass'),
              t('launchDocs.delay'),
            ]}
            right={[3, 4, 5]}
            rows={docs.motors.map((m) => [
              stageLabel(t, m.stageIndex, m.stageName),
              partLabel(t, { name: m.mount.name, type: m.mount.type }),
              motorFullName(m.spec),
              String(m.count),
              m.impulseClass,
              m.delayS == null ? t('launchDocs.plugged') : withFixedUnit(m.delayS, t('units.second'), 0),
            ])}
          />
        </Section>
      )}

      <Section title={t('launchDocs.flight')}>
        <Pairs
          rows={[
            [t('report.altitude'), flight ? u.fmtSym('distance', flight.maxAltitude, 0) : NO_VALUE],
            [t('report.timeToApogee'), sec(flight?.timeToApogee)],
            [t('report.maxVel'), flight ? u.fmtSym('velocity', flight.maxVelocity, 0) : NO_VALUE],
            [t('launchDocs.maxMach'), flight ? fmtNum(flight.maxMachNumber, 2) : NO_VALUE],
            [t('report.velOffRod'), flight ? u.fmtSym('velocity', flight.launchRodVelocity) : NO_VALUE],
            [
              t('launchDocs.railLength'),
              docs.launch.launchRodLengthM != null ? u.fmtSym('length', docs.launch.launchRodLengthM, 2) : NO_VALUE,
            ],
            [
              t('launchDocs.railAngle'),
              docs.launch.launchRodAngleDeg != null ? fmtDegrees(u, docs.launch.launchRodAngleDeg, 1) : NO_VALUE,
            ],
            [
              t('launchDocs.wind'),
              docs.launch.windAverage != null ? u.fmtSym('windspeed', docs.launch.windAverage) : NO_VALUE,
            ],
            [t('launchDocs.optimumDelay'), sec(flight?.optimumDelay)],
            [
              t('report.velDeploy'),
              flight?.deploymentVelocity != null ? u.fmtSym('velocity', flight.deploymentVelocity) : NO_VALUE,
            ],
            [t('report.landingVel'), flight ? u.fmtSym('velocity', flight.groundHitVelocity) : NO_VALUE],
            [t('report.flightTime'), sec(flight?.flightTime)],
          ]}
        />
      </Section>

      {docs.devices.length > 0 && (
        <Section title={t('launchDocs.recovery')}>
          <Table
            head={[
              t('launchDocs.stage'),
              t('launchDocs.device'),
              t('launchDocs.role'),
              t('launchDocs.deploys'),
              t('launchDocs.diameter'),
            ]}
            right={[4]}
            rows={docs.devices.map((d) => [
              stageLabel(t, d.stageIndex, d.stageName),
              partLabel(t, d.node),
              t(`charges.role_${d.role}`),
              deploysText(t, u, d),
              d.diameterM != null ? u.fmtSym('length', d.diameterM) : NO_VALUE,
            ])}
          />
        </Section>
      )}

      {docs.charges.length > 0 && (
        <Section title={t('charges.title')}>
          <Table
            head={[t('charges.bay'), t('charges.primary'), t('charges.backup')]}
            right={[1, 2]}
            rows={docs.charges.map((c) => [bayName(t, c), grams(c.primaryKg), grams(c.backupKg)])}
          />
        </Section>
      )}

      <Blanks labels={[t('launchDocs.pad'), t('launchDocs.rso')]} />
      <section
        aria-label={t('sim.safetyTitle')}
        className="border-t border-line/15 pt-2 text-xs leading-snug text-ink-soft"
      >
        <h3 className="mb-1 font-semibold uppercase tracking-wide text-ink">
          <span aria-hidden>⚠ </span>
          {t('sim.safetyTitle')}
        </h3>
        <ul className="list-disc space-y-1 pl-4">
          <li>{t('sim.safetyVerify')}</li>
          <li>
            <span className="font-semibold italic">{t('sim.safetyGaps')}: </span>
            <span className="italic">{t('sim.safetyGapsDetail')}</span>
          </li>
          <li>{t('sim.safetyCode')}</li>
        </ul>
        <p className="mt-1 text-[11px]">{t('sim.safetyDisclaimer')}</p>
      </section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-line/15 pb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Pairs({ rows }: { rows: ([string, string] | null)[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
      {rows
        .filter((r): r is [string, string] => r != null)
        .map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line/5 py-0.5">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="text-right tabular-nums text-ink-strong">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Table({ head, rows, right }: { head: string[]; rows: string[][]; right: number[] }) {
  const align = (i: number) => (right.includes(i) ? 'text-right' : 'text-left');
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-ink-muted">
          {head.map((h, i) => (
            <th key={h} scope="col" className={`py-1 font-medium ${align(i)}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-t border-line/5">
            {r.map((c, i) => (
              <td key={i} className={`py-1 tabular-nums ${align(i)}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FlyerBlock({ flyer, t }: { flyer: Flyer; t: T }) {
  const name = flyer.name.trim();
  const blanks = [
    ...(name ? [] : [t('launchDocs.flyer')]),
    ...(flyer.memberships.length ? [] : [t('launchDocs.certHeld')]),
  ];
  return (
    <div className="space-y-2">
      {(name || flyer.memberships.length > 0) && (
        <Pairs
          rows={[
            name ? [t('launchDocs.flyer'), name] : null,
            ...flyer.memberships.map((m): [string, string] => [
              orgLabel(m) || t('settings.orgOther'),
              [m.number.trim(), t(`launchDocs.cert_${m.level}`)].filter(Boolean).join(' · '),
            ]),
          ]}
        />
      )}
      <Blanks labels={[...blanks, t('launchDocs.date')]} />
      {(!name || !flyer.memberships.length) && (
        <p className="text-[11px] text-ink-faint print:hidden">{t('launchDocs.setFlyer')}</p>
      )}
    </div>
  );
}

function Blanks({ labels }: { labels: string[] }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {labels.map((l) => (
        <div key={l} className="flex items-end gap-2">
          <span className="shrink-0 text-xs font-semibold text-ink-soft">{l}</span>
          <span className="h-4 flex-1 border-b border-line/40" />
        </div>
      ))}
    </div>
  );
}
