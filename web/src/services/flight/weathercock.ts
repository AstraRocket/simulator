import { degToRad } from '../../prefs/units';

// Degrees.
export const WEATHERCOCK_LIMIT_DEG = 20;

// m/s. A display figure only; the engine flies the run's own wind.
export function maxWindMs(exitSpeedMs: number, limitDeg = WEATHERCOCK_LIMIT_DEG): number {
  return exitSpeedMs * Math.tan(degToRad(limitDeg));
}
