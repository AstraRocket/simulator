import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import { unitScope } from '../../prefs/units';
import { NO_VALUE } from '../../i18n/noValue';
import { fmtNum, withUnit } from '../../i18n/format';
import { ToolResultCard } from './ToolLayout';
import { MAIN_BAND } from '../../services/flight/recoverySizing';
import {
  SIMPLE_MACH_CAUTION,
  SIMPLE_NOSE_CALIBERS,
  SIMPLE_STABILITY_MIN,
  simpleBodyLength,
  simpleFins,
} from '../../services/flight/simpleRocket';
import type { SimpleRocket } from './useSimpleRocket';

const NOTICE = 'rounded-lg px-3 py-1.5 text-xs leading-snug ring-1';

export function SimpleProblem({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { u, lengthUnit, problem, inputs } = rocket;
  if (!problem || !inputs) return null;
  return (
    <p role="status" className={`${NOTICE} bg-warn-500/10 text-warn-300 ring-warn-400/30`}>
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
    </p>
  );
}

export function SimpleResultCard({ rocket }: { rocket: SimpleRocket }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { u, err, flown, key } = rocket;
  const seconds = (v: number | null) => (v == null ? null : withUnit(fmtNum(v, 1), t('units.second')));
  const fig = flown?.figures;
  return (
    <ToolResultCard label={t('simpleTool.result')}>
      {err && (
        <p role="alert" className={`${NOTICE} mb-3 bg-danger-500/10 text-danger-300 ring-danger-400/30`}>
          {err}
        </p>
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
                fig.railExit < settings.simulation.railExitVelocityMin
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
              warn={fig.maxMach > SIMPLE_MACH_CAUTION ? t('simpleTool.machNote', { mach: SIMPLE_MACH_CAUTION }) : null}
            />
            <Figure label={t('simpleTool.toApogee')} value={seconds(fig.timeToApogee)} />
            <Figure label={t('simpleTool.optimumDelay')} value={seconds(fig.optimumDelay)} />
            {flown.nearest != null && <Figure label={t('simpleTool.nearestDelay')} value={seconds(flown.nearest)} />}
            {fig.railStability != null && (
              <Figure
                label={t('simpleTool.railStability')}
                value={t('simpleTool.calibers', { value: fmtNum(fig.railStability, 2) })}
                warn={
                  fig.railStability < SIMPLE_STABILITY_MIN
                    ? t('simpleTool.lowStability', { min: SIMPLE_STABILITY_MIN })
                    : null
                }
              />
            )}
          </Figures>
          {fig.landingVelocity != null && (
            <Figures title={t('simpleTool.underChute')}>
              <Figure
                label={t('sim.deployVelocity')}
                value={fig.deployVelocity == null ? null : u.fmtSym('velocity', fig.deployVelocity)}
                warn={
                  fig.deployVelocity != null && fig.deployVelocity > settings.simulation.deploymentSpeedWarn
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
                  fig.landingVelocity > MAIN_BAND.max
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
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-xs text-ink-muted">{label}</dt>
        <dd className={`text-sm tabular-nums ${warn ? 'text-warn-400' : 'text-ink'}`}>{value ?? NO_VALUE}</dd>
      </div>
      {warn && <p className="text-xs text-warn-400">{warn}</p>}
    </div>
  );
}
