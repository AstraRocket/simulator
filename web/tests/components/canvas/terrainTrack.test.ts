import { describe, it, expect } from 'vitest';
import { rowsOnTerrain } from '../../../src/components/canvas/terrainTrack';
import type { TrackRow } from '../../../src/components/canvas/flightTrack';

// Up to 100 m at 5 s, then down at 5 m/s while drifting east at 2 m/s, to land on level ground at 25 s.
function flight(): TrackRow[] {
  const rows: TrackRow[] = [];
  for (let t = 0; t <= 25; t += 0.5) {
    const a = t <= 5 ? 20 * t : 100 - 5 * (t - 5);
    rows.push({ t, a, v: 5, east: 2 * t, north: 0, nose: null, rollRate: 0 });
  }
  return rows;
}

const lastOf = (rows: readonly TrackRow[]): TrackRow => {
  const end = rows.at(-1);
  if (!end) throw new Error('no rows');
  return end;
};

describe('rowsOnTerrain', () => {
  it('leaves level ground as the engine flew it', () => {
    const rows = flight();
    const out = rowsOnTerrain(rows, () => 0, true);
    expect(out.rows).toEqual(rows);
    expect(out.estimatedFromT).toBe(Infinity);
  });

  it('cuts the descent where it meets higher ground, with nothing estimated', () => {
    const out = rowsOnTerrain(flight(), () => 20, true);
    const end = lastOf(out.rows);
    // 100 - 5 (t - 5) = 20 at t = 21.
    expect(end.t).toBeCloseTo(21);
    expect(end.a).toBeCloseTo(20);
    expect(end.east).toBeCloseTo(42);
    expect(out.estimatedFromT).toBe(Infinity);
  });

  it('does not cut the climb, which starts on the pad below the ground ahead', () => {
    const out = rowsOnTerrain(flight(), (east) => (east < 5 ? 0 : 1), true);
    expect(lastOf(out.rows).t).toBeGreaterThan(20);
  });

  it('carries the descent on to lower ground, estimated from the last sample', () => {
    const out = rowsOnTerrain(flight(), () => -30, true);
    const end = lastOf(out.rows);
    expect(out.estimatedFromT).toBe(25);
    // 30 m more at 5 m/s is 6 s, drifting 2 m/s east.
    expect(end.a).toBeCloseTo(-30);
    expect(end.t).toBeCloseTo(31);
    expect(end.east).toBeCloseTo(62);
  });

  it('carries nothing on for a flight the engine did not end at the ground', () => {
    const out = rowsOnTerrain(flight(), () => -30, false);
    expect(lastOf(out.rows).t).toBe(25);
    expect(out.estimatedFromT).toBe(Infinity);
  });
});
