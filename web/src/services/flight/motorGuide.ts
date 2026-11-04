import type { EngineWarning, FlightResult, MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';
import type { CatalogMotor } from '../motors/motorDb';
import { parseDelays } from '../motors/motorPicker';
import type { FlightConfig } from './flightConfigs';
import { seriesAt } from './flightEvents';
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
export function probeDelay(m: CatalogMotor): number {
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

const finite = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

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
