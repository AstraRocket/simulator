import { useMemo } from 'react';
import { useLauncherT } from '../common/useLauncher';
import { fmtNum } from '../../i18n/format';
import { useScopedUnit } from '../common/useScopedUnit';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import { NO_VALUE } from '../../i18n/noValue';
import { degToRad, unitScope } from '../../prefs/units';
import type { FlightResult } from '../../engine/api';
import { forwardFlightEnd, maxQ, maxQAlpha, maxRollRate, seriesAt } from '../../services/flight/flightEvents';
import { distanceFromPad, landingPoint } from '../../services/flight/groundTrack';
import { railVerdictKey, stabilityTone } from '../../services/flight/simReport';
import { useSettings } from '../../state/useSettings';
import { Stat } from '../common/Stat';
import { deploymentVerdict, lastDeployment } from './speedWarnings';
import { sharedDeviceNames } from '../../services/flight/recoveryFlown';
import { selectShownSim, useWorkspaceStore } from '../../state/store';
import { effectivePrefs, type SimPrefs } from '../../services/flight/simulations';
import { WEATHERCOCK_LIMIT_DEG, maxWindMs } from '../../services/flight/weathercock';
import { SafetyCard } from './SafetyCard';

const goodTone = 'text-ok-400';
const warnTone = 'text-warn-400';

function RailExitStats({ sim }: { sim: FlightResult }) {
  const t = useLauncherT();
  const u = useUnits();
  const rodExit = useScopedUnit(unitScope('sim', 'rodExit'), 'velocity');
  const railCpUnit = useScopedUnit(unitScope('sim', 'railCp'), 'length');
  const railNeededUnit = useScopedUnit(unitScope('sim', 'railNeeded'), 'length');
  const maxWindUnit = useScopedUnit(unitScope('sim', 'maxWind'), 'windspeed');
  const { settings } = useSettings();
  const { railExitVelocityMin } = settings.simulation;
  const rodLengthM = useWorkspaceStore((st): number | null => {
    const shown = selectShownSim(st);
    return shown.result === sim ? shown.launch.launchRodLengthM : null;
  });
  const s = sim.summary;
  // At rail exit, unlike the on-pad Stability tile (Mach 0.3, fully loaded).
  const rodTime = sim.events.find((e) => e.type === 'LAUNCHROD')?.time;
  const railMargin = rodTime != null ? seriesAt(sim.series, 'stability', rodTime) : null;
  const railCp = rodTime != null ? seriesAt(sim.series, 'cpLocation', rodTime) : null;
  const railTwr = rodTime != null ? seriesAt(sim.series, 'Twr', rodTime) : null;
  const railAoa = rodTime != null ? seriesAt(sim.series, 'aoa', rodTime) : null;
  return (
    <>
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
            s.railLengthNeeded == null || (rodLengthM != null && s.railLengthNeeded > rodLengthM) ? warnTone : goodTone
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
    </>
  );
}

function FlightStats({ sim }: { sim: FlightResult }) {
  const t = useLauncherT();
  const apogee = useScopedUnit(unitScope('sim', 'apogee'), 'distance');
  const deployVel = useScopedUnit(unitScope('sim', 'deployVelocity'), 'velocity');
  const landingVel = useScopedUnit(unitScope('sim', 'landing'), 'velocity');
  const downrangeUnit = useScopedUnit(unitScope('sim', 'downrange'), 'distance');
  const { settings } = useSettings();
  const ownPrefs = useWorkspaceStore((st): Partial<SimPrefs> | undefined => {
    const shown = selectShownSim(st);
    return shown.result === sim ? shown.prefs : undefined;
  });
  const { deploymentSpeedWarn } = effectivePrefs(settings.simulation, ownPrefs);
  const tree = useWorkspaceStore((st) => st.tree);
  const sharedNames = useMemo(() => sharedDeviceNames(tree.components), [tree]);
  const s = sim.summary;
  const deployVerdict =
    s?.deploymentVelocity != null
      ? deploymentVerdict(
          s.deploymentVelocity,
          sim.warnings,
          deploymentSpeedWarn,
          lastDeployment(sim.events),
          sharedNames,
        )
      : null;
  const landing = landingPoint(sim.series);
  const downrange = landing ? distanceFromPad(landing) : null;
  return (
    <>
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
    </>
  );
}

function PeakStats({ sim }: { sim: FlightResult }) {
  const t = useLauncherT();
  const u = useUnits();
  const maxAccel = useScopedUnit(unitScope('sim', 'maxAccel'), 'acceleration');
  const maxQUnit = useScopedUnit(unitScope('sim', 'maxQ'), 'pressure');
  const maxSpeed = useScopedUnit(unitScope('sim', 'maxSpeed'), 'velocity');
  const maxRollUnit = useScopedUnit(unitScope('sim', 'maxRoll'), 'rollRate');
  const s = sim.summary;
  // The kernel does not record Max-Q, so it is derived here.
  const peakQ = maxQ(sim.series);
  const peakQAlpha = maxQAlpha(sim.series, forwardFlightEnd(sim));
  const peakRoll = maxRollRate(sim.series);
  return (
    <>
      <Stat
        card
        label={t('sim.maxAccel')}
        value={maxAccel.fmt(s.maxAcceleration)}
        sub={maxAccel.chip(t('sim.maxAccel'))}
      />
      <Stat card label={t('sim.maxSpeed')} value={maxSpeed.fmt(s.maxVelocity)} sub={maxSpeed.chip(t('sim.maxSpeed'))} />
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
    </>
  );
}

export function SimSummary({ sim }: { sim: FlightResult | null }) {
  const t = useLauncherT();
  if (!sim?.summary) return null;
  return (
    <div className="space-y-3">
      <SafetyCard />
      <section aria-label={t('sims.summary')} className="grid grid-cols-2 gap-2">
        <RailExitStats sim={sim} />
        <FlightStats sim={sim} />
        <PeakStats sim={sim} />
      </section>
    </div>
  );
}
