import type { TrackRow } from './flightTrack';

/** Meters above the pad at a point east and north of it. */
export type HeightAt = (east: number, north: number) => number;

export interface TerrainRows {
  rows: TrackRow[];
  /** When the drawn path stops being the engine's and becomes an estimate; Infinity when it never does. */
  estimatedFromT: number;
}

// Meters of drop per step carried on past the engine's last sample.
const STEP_M = 1;
const MAX_STEPS = 20_000;
// Seconds of descent the carried-on velocity is taken over: under a canopy it is steady.
const RATE_WINDOW_S = 1;
const MIN_RATE_MS = 0.1;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

function between(a: TrackRow, b: TrackRow, f: number): TrackRow {
  return {
    t: lerp(a.t, b.t, f),
    a: lerp(a.a, b.a, f),
    v: lerp(a.v, b.v, f),
    east: lerp(a.east, b.east, f),
    north: lerp(a.north, b.north, f),
    nose: f < 0.5 ? a.nose : b.nose,
    rollRate: lerp(a.rollRate, b.rollRate, f),
  };
}

/**
 * The engine flies over level ground at the pad's height. Over real ground the descent is cut where it first meets
 * higher ground, which is exact; or, where the engine landed above lower ground, carried on at its last descent
 * rate and drift until it meets it, which is an estimate. Only after apogee: on the way up the track starts on the pad.
 * `landed` is whether the engine ended the flight at the ground, rather than in the air.
 */
export function rowsOnTerrain(rows: readonly TrackRow[], heightAt: HeightAt, landed: boolean): TerrainRows {
  const kept = { rows: [...rows], estimatedFromT: Infinity };
  if (rows.length < 2) return kept;
  let top = 0;
  rows.forEach((r, i) => {
    if (r.a > rows[top]!.a) top = i;
  });
  const above = (r: TrackRow) => r.a - heightAt(r.east, r.north);

  for (let i = top + 1; i < rows.length; i++) {
    const now = above(rows[i]!);
    if (now > 0) continue;
    const before = above(rows[i - 1]!);
    const f = before > now ? Math.min(1, Math.max(0, before / (before - now))) : 0;
    return { rows: [...rows.slice(0, i), between(rows[i - 1]!, rows[i]!, f)], estimatedFromT: Infinity };
  }

  const end = rows[rows.length - 1]!;
  if (!landed || above(end) <= 0) return kept;
  let k = rows.length - 2;
  while (k > top && end.t - rows[k]!.t < RATE_WINDOW_S) k--;
  const from = rows[k]!;
  const dt = end.t - from.t;
  if (!(dt > 0)) return kept;
  const rate = (from.a - end.a) / dt;
  if (!(rate > MIN_RATE_MS)) return kept;
  const east = (end.east - from.east) / dt;
  const north = (end.north - from.north) / dt;

  const out = [...rows];
  const step = STEP_M / rate;
  let prev = end;
  for (let n = 1; n <= MAX_STEPS; n++) {
    const next: TrackRow = {
      t: end.t + n * step,
      a: end.a - n * STEP_M,
      v: end.v,
      east: end.east + east * n * step,
      north: end.north + north * n * step,
      nose: end.nose,
      rollRate: 0,
    };
    const now = above(next);
    if (now <= 0) {
      const before = above(prev);
      out.push(between(prev, next, before > now ? before / (before - now) : 1));
      return { rows: out, estimatedFromT: end.t };
    }
    out.push(next);
    prev = next;
  }
  return { rows: out, estimatedFromT: end.t };
}
