import type { FlightSeries } from '../../engine/openRocketEngine';
import { radToDeg } from '../../prefs/units';
import { roundFixed, isFiniteNumber } from '../app/numbers';

/** Meters east (kernel `Px`) and north (`Py`) of the pad. */
export interface GroundPoint {
  east: number;
  north: number;
}

export interface GroundTrackLine {
  key: string;
  name: string;
  color: string;
  points: GroundPoint[];
  landing: GroundPoint | null;
  /** Meters. */
  distance: number;
  /** Degrees clockwise from north. */
  bearing: number;
}

// Drops half-valid samples rather than zeroing them: zero is the pad, so one null would draw a spike to it.
export function trackPoints(series: FlightSeries | undefined): GroundPoint[] {
  const east = series?.['Px'];
  const north = series?.['Py'];
  if (!east || !north) return [];
  const n = Math.min(east.length, north.length);
  const out: GroundPoint[] = [];
  for (let i = 0; i < n; i++) {
    const e = east[i];
    const nr = north[i];
    if (isFiniteNumber(e) && isFiniteNumber(nr)) out.push({ east: e, north: nr });
  }
  return out;
}

export const distanceFromPad = (p: GroundPoint): number => Math.hypot(p.east, p.north);

export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Degrees clockwise from north. */
export const bearingFromPad = (p: GroundPoint): number => norm360(radToDeg(Math.atan2(p.east, p.north)));

export function landingLatLon(series: FlightSeries | undefined): { lat: number; lon: number } | null {
  const lat = series?.['φ'];
  const lon = series?.['λ'];
  if (!lat || !lon) return null;
  for (let i = Math.min(lat.length, lon.length) - 1; i >= 0; i--) {
    const a = lat[i];
    const b = lon[i];
    if (isFiniteNumber(a) && isFiniteNumber(b)) return { lat: a, lon: b };
  }
  return null;
}

const lastPoint = (points: readonly GroundPoint[]): GroundPoint | null =>
  points.length ? points[points.length - 1]! : null;

export function landingPoint(series: FlightSeries | undefined): GroundPoint | null {
  return lastPoint(trackPoints(series));
}

export function groundTrackLine(
  key: string,
  name: string,
  color: string,
  series: FlightSeries | undefined,
): GroundTrackLine {
  const points = trackPoints(series);
  const landing = lastPoint(points);
  return {
    key,
    name,
    color,
    points,
    landing,
    distance: landing ? distanceFromPad(landing) : 0,
    bearing: landing ? bearingFromPad(landing) : 0,
  };
}

// Half-extent, m: a calm-day landing near the pad would otherwise zoom past what aerial imagery resolves.
export const MIN_EXTENT_M = 50;

export function trackExtent(lines: readonly GroundTrackLine[], extra: readonly GroundPoint[] = []): number {
  let m = 0;
  const reach = (p: GroundPoint) => {
    const d = Math.max(Math.abs(p.east), Math.abs(p.north));
    if (d > m) m = d;
  };
  for (const l of lines) for (const p of l.points) reach(p);
  for (const p of extra) reach(p);
  return Math.max(MIN_EXTENT_M, m * 1.1);
}

export function rangeRings(extent: number, count = 4): number[] {
  if (!(extent > 0)) return [];
  const rough = extent / count;
  const exp = Math.floor(Math.log10(rough));
  const mag = 10 ** exp;
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  // `i * step` gives 0.30000000000000004 for a 0.1 m step, and callers may print it unformatted.
  const dp = Math.max(0, -exp);
  const out: number[] = [];
  for (let i = 1; i * step <= extent + 1e-9; i++) out.push(roundFixed(i * step, dp));
  return out;
}
