import { useMemo } from 'react';
import { useLauncherT } from '../common/useLauncher';
import { fmtNum } from '../../i18n/format';
import { useScopedUnit } from '../common/UnitChip';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import { NO_VALUE } from '../../i18n/noValue';
import { degToRad, unitScope } from '../../prefs/units';
import type { FlightResult } from '../../engine/api';
import { forwardFlightEnd, maxQ, maxQAlpha, maxRollRate, seriesAt } from '../../services/flight/flightEvents';
import { distanceFromPad, landingPoint } from '../../services/flight/groundTrack';
import { railVerdictKey, stabilityTone } from '../../services/flight/simReport';
import { useSettings } from '../../state/SettingsProvider';
import { confirm } from '../../state/confirmStore';
import { useHelpStore } from '../../state/helpStore';
import { Stat } from '../common/Stat';
import { WARNING_TONE } from './warningTone';
import { deploymentVerdict, lastDeployment } from './speedWarnings';
import { sharedDeviceNames } from '../../services/flight/recoveryFlown';
import { selectShownSim, useWorkspaceStore } from '../../state/store';
import { effectivePrefs, type SimPrefs } from '../../services/flight/simulations';
import { WEATHERCOCK_LIMIT_DEG, maxWindMs } from '../../services/flight/weathercock';

const BULLET = 'flex gap-2';

function SafetyCard() {
  const t = useLauncherT();
  const openHelp = useHelpStore((s) => s.openHelp);
  const { settings, update } = useSettings();
  const open = settings.showSafetyCard;
  const toggle = async () => {
    if (!open) {
      update({ showSafetyCard: true });
      return;
    }
    const ok = await confirm({
      title: t('sim.safetyAckTitle'),
      message: t('sim.safetyAckBody'),
      confirmLabel: t('sim.safetyAckConfirm'),
    });
    if (ok) update({ showSafetyCard: false });
  };
  return (
    <section aria-label={t('sim.safetyTitle')} className={`rounded-xl p-3 ring-1 ${WARNING_TONE.NORMAL}`}>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className={`flex w-full items-center gap-1.5 text-left text-[10px] font-semibold uppercase tracking-wide ${open ? 'mb-2' : ''}`}
      >
        <span aria-hidden>⚠</span>
        {t('sim.safetyTitle')}
        <span aria-hidden className={`ml-auto transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {!open ? null : (
        <>
          <p className="text-xs font-semibold leading-snug">{t('sim.safetyLead')}</p>
          {/* Spelled out, not mapped, so keys.test.ts sees each literal key. */}
          <ul className="mt-2 space-y-1.5 text-xs leading-snug">
            <li className={BULLET}>
              <span aria-hidden>·</span>
              <span className="min-w-0">{t('sim.safetyVerify')}</span>
            </li>
            <li className={BULLET}>
              <span aria-hidden>·</span>
              <span className="min-w-0">
                <span className="font-semibold italic">{t('sim.safetyGaps')}</span>
                <span className="block italic">{t('sim.safetyGapsDetail')}</span>
              </span>
            </li>
            <li className={BULLET}>
              <span aria-hidden>·</span>
              <span className="min-w-0">{t('sim.safetyCode')}</span>
            </li>
          </ul>
          {/* Restates the license's no-warranty and no-liability clauses. */}
          <p className="mt-2 text-[11px] leading-snug">{t('sim.safetyDisclaimer')}</p>
          <button
            onClick={() => openHelp('safety')}
            className="mt-2 inline-block whitespace-nowrap text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            {t('sim.safetyLink')} <span aria-hidden>→</span>
          </button>
        </>
      )}
    </section>
  );
}

export function SimSummary({ sim }: { sim: FlightResult | null }) {
  const t = useLauncherT();
  const u = useUnits();
  const rodExit = useScopedUnit(unitScope('sim', 'rodExit'), 'velocity');
  const railCpUnit = useScopedUnit(unitScope('sim', 'railCp'), 'length');
  const apogee = useScopedUnit(unitScope('sim', 'apogee'), 'distance');
  const deployVel = useScopedUnit(unitScope('sim', 'deployVelocity'), 'velocity');
  const landingVel = useScopedUnit(unitScope('sim', 'landing'), 'velocity');
  const downrangeUnit = useScopedUnit(unitScope('sim', 'downrange'), 'distance');
  const maxAccel = useScopedUnit(unitScope('sim', 'maxAccel'), 'acceleration');
  const maxQUnit = useScopedUnit(unitScope('sim', 'maxQ'), 'pressure');
  const maxSpeed = useScopedUnit(unitScope('sim', 'maxSpeed'), 'velocity');
  const maxRollUnit = useScopedUnit(unitScope('sim', 'maxRoll'), 'rollRate');
  const railNeededUnit = useScopedUnit(unitScope('sim', 'railNeeded'), 'length');
  const maxWindUnit = useScopedUnit(unitScope('sim', 'maxWind'), 'windspeed');
  const { settings } = useSettings();
  const { railExitVelocityMin } = settings.simulation;
  const ownPrefs = useWorkspaceStore((st): Partial<SimPrefs> | undefined => {
    const shown = selectShownSim(st);
    return shown.result === sim ? shown.prefs : undefined;
  });
  const { deploymentSpeedWarn } = effectivePrefs(settings.simulation, ownPrefs);
  const rodLengthM = useWorkspaceStore((st): number | null => {
    const shown = selectShownSim(st);
    return shown.result === sim ? shown.launch.launchRodLengthM : null;
  });
  const tree = useWorkspaceStore((st) => st.tree);
  const sharedNames = useMemo(() => sharedDeviceNames(tree.components), [tree]);
  const s = sim?.summary;
  const deployVerdict =
    s?.deploymentVelocity != null
      ? deploymentVerdict(
          s.deploymentVelocity,
          sim?.warnings,
          deploymentSpeedWarn,
          lastDeployment(sim?.events),
          sharedNames,
        )
      : null;
  const goodTone = 'text-ok-400',
    warnTone = 'text-warn-400';
  // At rail exit, unlike the on-pad Stability tile (Mach 0.3, fully loaded).
  const rodTime = sim?.events.find((e) => e.type === 'LAUNCHROD')?.time;
  const railMargin = sim && rodTime != null ? seriesAt(sim.series, 'stability', rodTime) : null;
  const railCp = sim && rodTime != null ? seriesAt(sim.series, 'cpLocation', rodTime) : null;
  const railTwr = sim && rodTime != null ? seriesAt(sim.series, 'Twr', rodTime) : null;
  const railAoa = sim && rodTime != null ? seriesAt(sim.series, 'aoa', rodTime) : null;
  const landing = sim ? landingPoint(sim.series) : null;
  const downrange = landing ? distanceFromPad(landing) : null;
  // The kernel does not record Max-Q, so it is derived here.
  const peakQ = sim ? maxQ(sim.series) : null;
  const peakQAlpha = sim ? maxQAlpha(sim.series, forwardFlightEnd(sim)) : null;
  const peakRoll = sim ? maxRollRate(sim.series) : null;
  if (!s) return null;
  return (
    <div className="space-y-3">
      <SafetyCard />
      <section aria-label={t('sims.summary')} className="grid grid-cols-2 gap-2">
        <Stat
          card
          label={t('sim.rodExit')}
          value={rodExit.fmt(s.launchRodVelocity)}
          sub={rodExit.chip(t('sim.rodExit'))}
          // Compared in SI, like the stored threshold.
          tone={s.launchRodVelocity >= railExitVelocityMin ? goodTone : warnTone}
          status={s.launchRodVelocity >= railExitVelocityMin ? undefined : t('limits.belowMin')}
        />
        {railMargin != null && (
          <Stat
            card
            label={t('sim.railMargin')}
            value={fmtNum(railMargin, 2)}
            sub={
              railCp != null ? (
                <>
                  {t('stability.caliber')} · {t('flight.cp')} {railCpUnit.fmt(railCp)}{' '}
                  {railCpUnit.chip(t('sim.railMargin'))}
                </>
              ) : (
                t('stability.caliber')
              )
            }
            tone={stabilityTone(railMargin)}
            status={t(railVerdictKey(railMargin))}
          />
        )}
        {rodTime != null && <Stat card label={t('sim.exitTime')} value={fmtNum(rodTime, 2)} sub={t('units.second')} />}
        {railTwr != null && <Stat card label={t('sim.exitTwr')} value={fmtNum(railTwr, 1)} sub={t('sim.exitTwrSub')} />}
        {railAoa != null && (
          <Stat
            card
            label={t('sim.exitAoa')}
            value={u.fmt('angle', Math.abs(railAoa))}
            sub={u.sym('angle')}
            tone={Math.abs(railAoa) > degToRad(WEATHERCOCK_LIMIT_DEG) ? warnTone : goodTone}
            status={Math.abs(railAoa) > degToRad(WEATHERCOCK_LIMIT_DEG) ? t('limits.aboveMax') : undefined}
          />
        )}
        {/* Exit speed times tan 20°: the wind that keeps rail-exit AoA within 20°. */}
        <Stat
          card
          label={t('sim.maxWind', { angle: fmtDegrees(u, WEATHERCOCK_LIMIT_DEG) })}
          value={maxWindUnit.fmt(maxWindMs(s.launchRodVelocity))}
          sub={maxWindUnit.chip(t('sim.maxWind', { angle: fmtDegrees(u, WEATHERCOCK_LIMIT_DEG) }))}
        />
        {/* Undefined when not reported; null when no rod is long enough. */}
        {s.railLengthNeeded !== undefined && (
          <Stat
            card
            label={t('sim.railNeeded')}
            value={s.railLengthNeeded == null ? NO_VALUE : railNeededUnit.fmt(s.railLengthNeeded)}
            sub={
              <>
                {s.railLengthNeeded != null && <>{railNeededUnit.chip(t('sim.railNeeded'))} · </>}
                {t('sim.railNeededFor', { speed: rodExit.fmtSym(railExitVelocityMin) })}
              </>
            }
            tone={
              s.railLengthNeeded == null || (rodLengthM != null && s.railLengthNeeded > rodLengthM)
                ? warnTone
                : goodTone
            }
            status={
              s.railLengthNeeded == null
                ? t('sim.railNeverReaches')
                : rodLengthM != null && s.railLengthNeeded > rodLengthM
                  ? t('sim.railLonger')
                  : undefined
            }
          />
        )}
        {s.optimumDelay != null && (
          <Stat card label={t('sim.optDelay')} value={fmtNum(s.optimumDelay, 1)} sub={t('units.second')} />
        )}
        <Stat card label={t('sim.toApogee')} value={fmtNum(s.timeToApogee, 1)} sub={t('units.second')} />
        <Stat
          card
          label={t('sim.apogee')}
          value={apogee.fmt(s.maxAltitude)}
          sub={apogee.chip(t('sim.apogee'))}
          tone="text-accent-400"
        />
        {s.deploymentVelocity != null && (
          <Stat
            card
            label={t('sim.deployVelocity')}
            value={deployVel.fmt(s.deploymentVelocity)}
            sub={deployVel.chip(t('sim.deployVelocity'))}
            tone={deployVerdict ? warnTone : goodTone}
            status={
              deployVerdict === 'tooSlow'
                ? t('limits.tooSlow')
                : deployVerdict === 'tooFast'
                  ? t('limits.tooFast')
                  : undefined
            }
          />
        )}
        {Number.isFinite(s.groundHitVelocity) && (
          <Stat
            card
            label={t('sim.landing')}
            value={landingVel.fmt(s.groundHitVelocity)}
            sub={landingVel.chip(t('sim.landing'))}
          />
        )}
        <Stat card label={t('sim.flightTime')} value={fmtNum(s.flightTime, 1)} sub={t('units.second')} />
        {Number.isFinite(s.groundHitVelocity) && downrange != null && (
          <Stat
            card
            label={t('sim.downrange')}
            value={downrangeUnit.fmt(downrange)}
            sub={downrangeUnit.chip(t('sim.downrange'))}
          />
        )}
        <Stat
          card
          label={t('sim.maxAccel')}
          value={maxAccel.fmt(s.maxAcceleration)}
          sub={maxAccel.chip(t('sim.maxAccel'))}
        />
        <Stat
          card
          label={t('sim.maxSpeed')}
          value={maxSpeed.fmt(s.maxVelocity)}
          sub={maxSpeed.chip(t('sim.maxSpeed'))}
        />
        <Stat card label={t('sim.maxMach')} value={fmtNum(s.maxMachNumber, 2)} sub={t('flight.mach')} />
        {peakQ && <Stat card label={t('sim.maxQ')} value={maxQUnit.fmt(peakQ.q)} sub={maxQUnit.chip(t('sim.maxQ'))} />}
        {/* In Max q's pressure unit times the angle unit, so both read in the same pressure. */}
        {peakQAlpha && (
          <Stat
            card
            label={t('sim.maxQAlpha')}
            value={fmtNum(maxQUnit.toUi(peakQAlpha.value) * u.factor('angle'), 1)}
            sub={`${maxQUnit.sym}·${u.sym('angle')}`}
          />
        )}
        {peakRoll != null && (
          <Stat
            card
            label={t('sim.maxRollRate')}
            value={maxRollUnit.fmt(peakRoll)}
            sub={maxRollUnit.chip(t('sim.maxRollRate'))}
          />
        )}
      </section>
    </div>
  );
}
