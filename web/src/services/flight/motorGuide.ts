import type { EngineWarning, FlightResult, MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';
import type { CatalogMotor } from '../motors/motorDb';
import { keyOf } from '../motors/motorKey';
import { parseDelays } from '../motors/motorPicker';
import type { FlightConfig } from './flightConfigs';
import { seriesAtEvent, summaryFigures } from './flightEvents';
import type { SimInputs } from './simulations';

// A candidate is up to two flights (see probeDelay), so this caps a guide at sixteen flights.
export const MAX_GUIDE_MOTORS = 8;

const GUIDE_DEFAULT_DELAY = 3;

/** SI. */
export interface GuideRow {
  key: string;
  motor: CatalogMotor;
  spec: MotorSpec;
  /** s; {@link PLUGGED_DELAY} for plugged. */
  delay: number;
  apogee: number;
  maxVelocity: number;
  maxAcceleration: number;
  maxMach: number;
  timeToApogee: number;
  railExit: number;
  /** Calibers. */
  railMargin: number | null;
  railTwr: number | null;
  deployVelocity: number | null;
  landingVelocity: number | null;
  optimumDelay: number | null;
  warnings: EngineWarning[];
  deployEvents: FlightResult['events'];
}

export interface GuideFailure {
  key: string;
  motor: CatalogMotor;
  reason: string;
}

export interface MotorGuide {
  simId: string;
  mountId: string;
  tree: RocketTree;
  inputs: SimInputs;
  key: string;
  asked: number;
  partial: boolean;
  rows: GuideRow[];
  failed: GuideFailure[];
}

export function guideConfig(config: FlightConfig, mountId: string, spec: MotorSpec): FlightConfig {
  return { ...config, motors: { ...config.motors, [mountId]: { ...config.motors[mountId], spec } } };
}

// The kernel's optimum delay does not depend on the delay flown, but the deployment speed does.
function probeDelay(m: CatalogMotor): number {
  const { delays, plugged } = parseDelays(m.delays);
  if (delays.length) return delays[Math.floor(delays.length / 2)]!;
  return plugged ? PLUGGED_DELAY : GUIDE_DEFAULT_DELAY;
}

// Ties go to the shorter delay: a chute out early while climbing slowly is a gentler miss.
export function nearestDelay(m: CatalogMotor, optimum: number | null): number | null {
  if (optimum == null || !Number.isFinite(optimum)) return null;
  const { delays } = parseDelays(m.delays);
  if (!delays.length) return null;
  let best = delays[0]!;
  for (const d of delays) if (Math.abs(d - optimum) < Math.abs(best - optimum)) best = d;
  return best;
}

export interface GuideBatch<R> {
  rows: R[];
  failed: GuideFailure[];
  partial: boolean;
}

/**
 * Flies each motor at its probe delay, then, when `refly` holds, again at the nearest listed delay.
 * Canceled flights are dropped, not failed; rows and failures come back in the order asked.
 */
export async function flyGuideBatch<F extends { optimumDelay: number | null }, R extends { key: string }>(
  motors: readonly CatalogMotor[],
  opts: {
    fly: (motor: CatalogMotor, delay: number) => Promise<F>;
    refly: boolean;
    row: (motor: CatalogMotor, key: string, flown: F, nearest: number | null) => R;
    signal: AbortSignal;
    /** Once per motor, flown or not. */
    onSettled: () => void;
    reason: (e: unknown) => string;
  },
): Promise<GuideBatch<R>> {
  const { fly, refly, row, signal, onSettled, reason } = opts;
  const rows: R[] = [];
  const failed: GuideFailure[] = [];
  await Promise.all(
    motors.map(async (motor) => {
      const key = keyOf(motor);
      try {
        const probe = probeDelay(motor);
        const first = await fly(motor, probe);
        const nearest = nearestDelay(motor, first.optimumDelay);
        const again = refly && nearest != null && nearest !== probe;
        rows.push(row(motor, key, again ? await fly(motor, nearest) : first, nearest));
      } catch (e) {
        if (!signal.aborted) failed.push({ key, motor, reason: reason(e) });
      } finally {
        onSettled();
      }
    }),
  );
  const order = new Map(motors.map((m, i) => [keyOf(m), i]));
  const byAsked = (a: { key: string }, b: { key: string }) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0);
  return { rows: rows.sort(byAsked), failed: failed.sort(byAsked), partial: signal.aborted };
}

export function guideRow(motor: CatalogMotor, key: string, spec: MotorSpec, result: FlightResult): GuideRow {
  return {
    key,
    motor,
    spec,
    delay: spec.ejectionDelay,
    ...summaryFigures(result),
    railMargin: seriesAtEvent(result, 'LAUNCHROD', 'stability'),
    railTwr: seriesAtEvent(result, 'LAUNCHROD', 'Twr'),
    warnings: result.warnings ?? [],
    deployEvents: result.events.filter((e) => e.type === 'RECOVERY_DEVICE_DEPLOYMENT'),
  };
}
