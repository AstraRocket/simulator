import type { EngineWarning, FlightResult, MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';
import type { CatalogMotor } from '../motors/motorDb';
import { parseDelays } from '../motors/motorPicker';
import type { FlightConfig } from './flightConfigs';
import { seriesAt } from './flightEvents';
import type { SimInputs } from './simulations';

/**
 * The motor guide: a set of candidate motors flown in one mount of one
 * simulation, so "which of these do I fly today" is one table rather than a
 * configuration built and flown by hand per motor. thrustcurve.org's Motor
 * Guide asks the same question with a one-dimensional model; this flies the
 * design itself, through the same kernel and the same worker pool a normal run
 * uses.
 *
 * Every candidate is a throwaway configuration: the simulation's own, with the
 * candidate in the chosen mount and every other mount, override and stage left
 * as it is. None of them reach the store, for the reason the drift sweep gives:
 * a few dozen flights answering a question about the row you are reading
 * should not become a few dozen rows to tidy up afterward. One row can be kept
 * on purpose (`promoteGuideRow` in the store).
 *
 * Nothing here judges a flight. A row carries the kernel's figures and the
 * kernel's warnings; what counts as too slow off the rail or too fast at
 * deployment is decided where the results tiles decide it (motorGuideIssues),
 * against the same settings.
 */

/**
 * The most motors one guide may fly. A candidate is up to two flights (see
 * {@link probeDelay}), so this is up to sixteen: a short wait, and a table read
 * at a glance. The dialog asks for a narrower filter above it rather than
 * flying the first few of an arbitrary order.
 */
export const MAX_GUIDE_MOTORS = 8;

/** The delay a motor with no delay data is flown at; the picker's own default. */
const GUIDE_DEFAULT_DELAY = 3;

/** One candidate as it flew. Figures are SI; null where the flight did not produce one. */
export interface GuideRow {
  /** `keyOf` the catalog row. */
  key: string;
  motor: CatalogMotor;
  /**
   * The motor as seated for the flight, delay included. Kept so the row can be
   * promoted to a real configuration without fetching the curve again.
   */
  spec: MotorSpec;
  /** The ejection delay this row was flown at, s; {@link PLUGGED_DELAY} for plugged. */
  delay: number;
  apogee: number;
  maxVelocity: number;
  maxAcceleration: number;
  maxMach: number;
  timeToApogee: number;
  /** Speed off the rod or rail. */
  railExit: number;
  /** Stability margin at rail exit, calibers. */
  railMargin: number | null;
  /** The kernel's thrust-to-weight at rail exit. */
  railTwr: number | null;
  deployVelocity: number | null;
  landingVelocity: number | null;
  /** The kernel's optimum ejection delay, s. */
  optimumDelay: number | null;
  /** The kernel's flight warnings, as a normal run lists them. */
  warnings: EngineWarning[];
  /** The deployment events, for judging the deployment speed the way the tiles do. */
  deployEvents: FlightResult['events'];
}

/** A candidate that produced no row, and why. */
export interface GuideFailure {
  key: string;
  motor: CatalogMotor;
  reason: string;
}

/** One finished guide. */
export interface MotorGuide {
  simId: string;
  mountId: string;
  /** What it was flown on, so an edit makes it stale (as a drift sweep goes stale). */
  tree: RocketTree;
  inputs: SimInputs;
  key: string;
  /** How many candidates were asked for. */
  asked: number;
  /** True when it was canceled part way: the rows are whole, the set is not. */
  partial: boolean;
  rows: GuideRow[];
  failed: GuideFailure[];
}

/** The configuration a candidate flies: `config` with `spec` in `mountId`, its ignition kept. */
export function guideConfig(config: FlightConfig, mountId: string, spec: MotorSpec): FlightConfig {
  return { ...config, motors: { ...config.motors, [mountId]: { ...config.motors[mountId], spec } } };
}

/**
 * The delay a candidate is first flown at: the middle of its own charges, or
 * plugged for a plugged-only motor, which is where the picker starts it.
 *
 * The first flight is for the optimum delay, which the kernel computes from a
 * probe with no deployment at all (`FlightSummary.optimumDelay`), so it does
 * not depend on the delay flown. Only the deployment speed does, which is why
 * a motor whose nearest charge differs is flown a second time at that charge.
 */
export function probeDelay(m: CatalogMotor): number {
  const { delays, plugged } = parseDelays(m.delays);
  if (delays.length) return delays[Math.floor(delays.length / 2)]!;
  return plugged ? PLUGGED_DELAY : GUIDE_DEFAULT_DELAY;
}

/**
 * The charge the motor offers that is nearest the optimum, the shorter of two
 * equally near: a chute out a moment early, still climbing slowly, is the
 * gentler miss than one out late and falling.
 *
 * Null when there is nothing to choose between: no numeric charges (plugged
 * only, or no delay data), or no optimum to aim at. The probe flight then
 * stands as the row.
 */
export function nearestDelay(m: CatalogMotor, optimum: number | null): number | null {
  if (optimum == null || !Number.isFinite(optimum)) return null;
  const { delays } = parseDelays(m.delays);
  if (!delays.length) return null;
  let best = delays[0]!;
  for (const d of delays) if (Math.abs(d - optimum) < Math.abs(best - optimum)) best = d;
  return best;
}

const finite = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

/** A flight's figures as a guide row. */
export function guideRow(motor: CatalogMotor, key: string, spec: MotorSpec, result: FlightResult): GuideRow {
  const s = result.summary;
  const rodTime = result.events.find((e) => e.type === 'LAUNCHROD')?.time;
  const at = (series: string) => (rodTime == null ? null : finite(seriesAt(result.series, series, rodTime)));
  return {
    key,
    motor,
    spec,
    delay: spec.ejectionDelay,
    apogee: s.maxAltitude,
    maxVelocity: s.maxVelocity,
    maxAcceleration: s.maxAcceleration,
    maxMach: s.maxMachNumber,
    timeToApogee: s.timeToApogee,
    railExit: s.launchRodVelocity,
    railMargin: at('stability'),
    railTwr: at('Twr'),
    deployVelocity: finite(s.deploymentVelocity),
    landingVelocity: finite(s.groundHitVelocity),
    optimumDelay: finite(s.optimumDelay),
    warnings: result.warnings ?? [],
    deployEvents: result.events.filter((e) => e.type === 'RECOVERY_DEVICE_DEPLOYMENT'),
  };
}
