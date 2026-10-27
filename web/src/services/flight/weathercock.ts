import { degToRad } from '../../prefs/units';

/** Steepest angle the usual rule accepts between the rocket and the airflow at launcher exit, degrees. */
export const WEATHERCOCK_LIMIT_DEG = 20;

/**
 * The steady crosswind, m/s, that turns the airflow `limitDeg` off the rocket's
 * axis as it leaves the launcher at `exitSpeedMs`: the exit speed times the
 * tangent of the angle. A display figure on the engine's own exit speed; the
 * flight itself is flown with the run's wind by the engine.
 */
export function maxWindMs(exitSpeedMs: number, limitDeg = WEATHERCOCK_LIMIT_DEG): number {
  return exitSpeedMs * Math.tan(degToRad(limitDeg));
}
