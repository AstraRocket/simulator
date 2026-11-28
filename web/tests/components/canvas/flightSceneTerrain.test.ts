import { describe, it, expect } from 'vitest';
import { buildFlightScene, type PhaseColors } from '../../../src/components/canvas/flightScene';
import { floorY } from '../../../src/components/canvas/flightTrack';
import { landedOnTerrain } from '../../../src/components/canvas/useFlightTerrain';
import type { FlightResult } from '../../../src/engine/openRocketEngine';
import type { EventRow } from '../../../src/services/flight/flightEvents';

const phase: PhaseColors = { boost: '#ff0000', coast: '#00ff00', descent: '#0000ff' };

// Up to 100 m and straight back down at 5 m/s, the engine landing at 25 s.
function result(): FlightResult {
  const time = Array.from({ length: 51 }, (_, i) => i / 2);
  const altitude = time.map((t) => (t <= 5 ? 20 * t : 100 - 5 * (t - 5)));
  return {
    summary: {},
    events: [
      { type: 'APOGEE', time: 5 },
      { type: 'GROUND_HIT', time: 25 },
    ],
    series: {
      time,
      altitude,
      velocity: time.map(() => 5),
      Px: time.map(() => 0),
      Py: time.map(() => 0),
    },
  } as unknown as FlightResult;
}

describe('buildFlightScene on terrain', () => {
  it('stays level, with nothing estimated, without terrain', () => {
    const track = buildFlightScene(result(), phase).tracks[0];
    expect(track?.estimatedFromT).toBe(Infinity);
    expect(track?.landY).toBe(0);
  });

  it('lands in a valley later, estimated past the engine, at the same scale', () => {
    const level = buildFlightScene(result(), phase);
    const s = buildFlightScene(result(), phase, () => -20);
    const track = s.tracks[0];
    if (!track) throw new Error('no track');
    expect(s.unitsPerMeter).toBe(level.unitsPerMeter);
    expect(track.estimatedFromT).toBe(25);
    expect(track.times.at(-1)).toBeCloseTo(29);
    expect(track.landY).toBeCloseTo(-20 * s.unitsPerMeter);
    expect(s.duration).toBeGreaterThan(level.duration);
    // Down there on the way down, the pad on the way up.
    expect(floorY(track, 28)).toBeCloseTo(-20 * s.unitsPerMeter);
    expect(floorY(track, 1)).toBe(0);
  });

  it('moves the landing event to where the path ends', () => {
    const s = buildFlightScene(result(), phase, () => 40);
    const hit = { type: 'GROUND_HIT', time: 25, branch: 0 } as EventRow;
    const apogee = { type: 'APOGEE', time: 5, branch: 0 } as EventRow;
    const [a, h] = landedOnTerrain([apogee, hit], s);
    expect(a?.time).toBe(5);
    expect(h?.time).toBeCloseTo(17);
    expect(landedOnTerrain([hit], null)[0]?.time).toBe(25);
  });
});
