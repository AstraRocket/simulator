import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import { unitScope } from '../../prefs/units';
import { NO_VALUE } from '../../i18n/noValue';
import { fmtNum, withUnit } from '../../i18n/format';
import { Notice } from '../common/Notice';
import { ToolResultCard } from './ToolLayout';
import { MAIN_BAND } from '../../services/flight/recoverySizing';
import {
  SIMPLE_MACH_CAUTION,
  SIMPLE_NOSE_CALIBERS,
  SIMPLE_STABILITY_MIN,
  simpleBodyLength,
  simpleFins,
  simpleIssues,
  type SimpleIssue,
} from '../../services/flight/simpleRocket';
import type { SimpleRocket } from './useSimpleRocket';

export function SimpleProblem({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { u, lengthUnit, problem, inputs } = rocket;
  // Always mounted, swapping its text: a live region created with its text is not announced.
  if (!problem || !inputs) return <p role="status" aria-live="polite" className="sr-only" />;
  return (
    <Notice tone="warn" role="status">
      {problem === 'tooShort'
        ? t('simpleTool.tooShort', {
            nose: SIMPLE_NOSE_CALIBERS,
            length: lengthUnit('simpleLength').fmtSym(inputs.diameterM * SIMPLE_NOSE_CALIBERS),
          })
        : problem === 'finsTooLong'
          ? t('simpleTool.finsTooLong', {
              fin: lengthUnit('simpleFinRoot').fmtSym(simpleFins(inputs).rootChordM),
              body: lengthUnit('simpleLength').fmtSym(simpleBodyLength(inputs)),
            })
          : problem === 'cgOutside'
            ? t('simpleTool.cgOutside', { length: lengthUnit('simpleLength').fmtSym(inputs.lengthM) })
            : t('simpleTool.mountTooWide', {
                mount: u.at(unitScope('launch', 'simpleMount'), 'motorDimensions').fmtSym(inputs.mountDiameterM),
                body: u.at(unitScope('launch', 'simpleDiameter'), 'length').fmtSym(inputs.diameterM),
              })}
    </Notice>
  );
}

export function SimpleResultCard({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { u, err, flown, key } = rocket;
  const seconds = (v: number | null) => (v == null ? null : withUnit(fmtNum(v, 1), t('units.second')));
  const fig = flown?.figures;
  const issues = fig
    ? simpleIssues(fig, {
        railExitMin: settings.simulation.railExitVelocityMin,
        deployWarn: settings.simulation.deploymentSpeedWarn,
      })
    : new Set<SimpleIssue>();
  return (
    <ToolResultCard label={t('simpleTool.result')}>
      {err && (
        <Notice tone="danger" role="alert" className="mb-3">
          {err}
        </Notice>
      )}
      {!fig ? (
        <p className="text-xs text-ink-muted">{t('simpleTool.empty')}</p>
      ) : (
        <div className="space-y-4">
          {flown.key !== key && <p className="text-xs text-warn-400">{t('simpleTool.stale')}</p>}
          <Figures title={t('simpleTool.solid')}>
            <Figure
              label={t('simpleTool.railExit')}
              value={u.fmtSym('velocity', fig.railExit)}
              warn={
                issues.has('slowExit')
                  ? t('simpleTool.slowExit', {
                      speed: u.fmtSym('velocity', settings.simulation.railExitVelocityMin),
                    })
                  : null
              }
            />
            <Figure label={t('simpleTool.railTwr')} value={fig.railTwr == null ? null : fmtNum(fig.railTwr, 1)} />
            <Figure label={t('sim.maxAccel')} value={u.fmtSym('acceleration', fig.maxAcceleration)} />
            <Figure label={t('simpleTool.burnout')} value={seconds(fig.burnoutTime)} />
          </Figures>
          <Figures title={t('simpleTool.estimate')} note={t('simpleTool.estimateNote')}>
            <Figure label={t('sim.apogee')} value={u.fmtSym('distance', fig.apogee)} />
            <Figure
              label={t('simpleTool.burnoutAltitude')}
              value={fig.burnoutAltitude == null ? null : u.fmtSym('distance', fig.burnoutAltitude)}
            />
            <Figure label={t('sim.maxSpeed')} value={u.fmtSym('velocity', fig.maxVelocity)} />
            <Figure
              label={t('sim.maxMach')}
              value={fmtNum(fig.maxMach, 2)}
              warn={issues.has('mach') ? t('simpleTool.machNote', { mach: SIMPLE_MACH_CAUTION }) : null}
            />
            <Figure label={t('simpleTool.toApogee')} value={seconds(fig.timeToApogee)} />
            <Figure label={t('simpleTool.optimumDelay')} value={seconds(fig.optimumDelay)} />
            {flown.nearest != null && <Figure label={t('simpleTool.nearestDelay')} value={seconds(flown.nearest)} />}
            {fig.railStability != null && (
              <Figure
                label={t('simpleTool.railStability')}
                value={t('simpleTool.calibers', { value: fmtNum(fig.railStability, 2) })}
                warn={issues.has('stability') ? t('simpleTool.lowStability', { min: SIMPLE_STABILITY_MIN }) : null}
              />
            )}
          </Figures>
          {fig.landingVelocity != null && (
            <Figures title={t('simpleTool.underChute')}>
              <Figure
                label={t('sim.deployVelocity')}
                value={fig.deployVelocity == null ? null : u.fmtSym('velocity', fig.deployVelocity)}
                warn={
                  issues.has('deployFast')
                    ? t('simpleTool.deployFast', {
                        speed: u.fmtSym('velocity', settings.simulation.deploymentSpeedWarn),
                      })
                    : null
                }
              />
              <Figure
                label={t('simpleTool.landingSpeed')}
                value={u.fmtSym('velocity', fig.landingVelocity)}
                warn={
                  issues.has('hardLanding')
                    ? t('simpleTool.landsHard', { speed: u.fmtSym('velocity', MAIN_BAND.max) })
                    : null
                }
              />
              <Figure label={t('sim.flightTime')} value={seconds(fig.flightTime)} />
            </Figures>
          )}
          <p className="text-xs text-ink-muted">{t('simpleTool.stabilityNote')}</p>
        </div>
      )}
    </ToolResultCard>
  );
}

function Figures({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-ink-muted">{note}</p>}
      <dl className="mt-2 space-y-1">{children}</dl>
    </div>
  );
}

function Figure({ label, value, warn }: { label: string; value: string | null; warn?: string | null }) {
  return (
    // A dl item holds only its dt and dd, so the warning is a second dd on its own line.
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`text-sm tabular-nums ${warn ? 'text-warn-400' : 'text-ink'}`}>{value ?? NO_VALUE}</dd>
      {warn && <dd className="w-full text-xs text-warn-400">{warn}</dd>}
    </div>
  );
}
