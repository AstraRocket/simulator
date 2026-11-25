import type { FlightSeries } from '../../engine/openRocketEngine';
import { seriesAt } from './flightEvents';

/** Below this a wind (m/s) has no direction to report: the recorded angle of a zero vector is not one. */
export const CALM_MS = 0.05;

export interface Wind {
  /** m/s. */
  speed: number;
  /** Where it blows from, radians clockwise from north. */
  from: number;
  /** Where it blows to, m/s. */
  east: number;
  north: number;
}

/** The wind the flight met at `t`, or null where the run recorded none. */
export function windAt(series: FlightSeries, t: number): Wind | null {
  const speed = seriesAt(series, 'Vw', t);
  if (speed == null) return null;
  const from = nearestAngle(series, t);
  if (from == null) return null;
  return { speed, from, east: -speed * Math.sin(from), north: -speed * Math.cos(from) };
}

// Not interpolated: between 359° and 1° that passes through south.
function nearestAngle({ time, θw }: FlightSeries, t: number): number | null {
  if (!θw) return null;
  let lo = 0;
  let hi = time.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (time[mid]! <= t) lo = mid;
    else hi = mid - 1;
  }
  return θw[lo] ?? null;
}
