import { describe, it, expect } from 'vitest';
import {
  boostWindows,
  buildFlightScene,
  eventPills,
  type PhaseColors,
} from '../../../src/components/canvas/flightScene';
import type { FlightResult } from '../../../src/engine/openRocketEngine';

const phase: PhaseColors = { boost: '#ff0000', coast: '#00ff00', descent: '#0000ff' };
const RED = 0,
  GREEN = 1,
  BLUE = 2;
const chan = (c: [number, number, number]) => c.indexOf(Math.max(...c));

const result = (over: {
  time?: number[];
  altitude?: number[];
  events?: { type: string; time: number }[];
  timeToApogee?: number;
}): FlightResult =>
  ({
    summary: { timeToApogee: over.timeToApogee },
    events: over.events ?? [],
    series: {
      time: over.time ?? [],
      altitude: over.altitude ?? [],
      velocity: (over.time ?? []).map(() => 10),
      Px: (over.time ?? []).map(() => 0),
      Py: (over.time ?? []).map(() => 0),
    },
  }) as unknown as FlightResult;

const arc = () => {
  const time = Array.from({ length: 11 }, (_, i) => i);
  const altitude = time.map((t) => 300 - 12 * (t - 5) ** 2);
  return { time, altitude };
};

describe('apogee time fallback', () => {
  it('uses the APOGEE event when there is one', () => {
    const s = buildFlightScene(result({ ...arc(), events: [{ type: 'APOGEE', time: 5 }] }), phase);
    expect(chan(s.colors[4]!)).toBe(GREEN);
    expect(chan(s.colors[6]!)).toBe(BLUE);
  });

  it('falls back to the last sample time, not the peak altitude', () => {
    const s = buildFlightScene(result({ ...arc() }), phase);
    expect(s.deployT).toBe(10);
  });

  it('prefers the summary time to the last sample', () => {
    const s = buildFlightScene(result({ ...arc(), timeToApogee: 5 }), phase);
    expect(chan(s.colors[6]!)).toBe(BLUE);
  });

  it('colors the burn red up to BURNOUT', () => {
    const s = buildFlightScene(
      result({
        ...arc(),
        events: [
          { type: 'BURNOUT', time: 2 },
          { type: 'APOGEE', time: 5 },
        ],
      }),
      phase,
    );
    expect(chan(s.colors[1]!)).toBe(RED);
    expect(chan(s.colors[3]!)).toBe(GREEN);
  });
});

describe('the empty-path guard', () => {
  it('returns an empty scene instead of throwing when every sample is non-finite', () => {
    const s = buildFlightScene(
      result({
        time: [NaN, NaN, NaN],
        altitude: [NaN, NaN, NaN],
        events: [
          { type: 'BURNOUT', time: 1 },
          { type: 'APOGEE', time: 2 },
          { type: 'GROUND_HIT', time: 3 },
        ],
      }),
      phase,
    );
    expect(s.scenePts).toEqual([]);
    expect(eventPills(s, [{ time: 2, branch: 0, text: 'Apogee' }])).toEqual([]);
  });

  it('survives a result with no samples at all', () => {
    expect(() => buildFlightScene(result({}), phase)).not.toThrow();
    expect(buildFlightScene(result({}), phase).scenePts).toEqual([]);
  });

  it('drops only the non-finite samples when some are good', () => {
    const s = buildFlightScene(result({ time: [0, NaN, 2], altitude: [0, 100, 50] }), phase);
    expect(s.times).toEqual([0, 2]);
    expect(s.alts).toEqual([0, 50]);
  });
});

describe('eventPills', () => {
  const s = buildFlightScene(result({ ...arc(), events: [{ type: 'APOGEE', time: 5 }] }), phase);

  it('anchors each event to its nearest sample', () => {
    const pills = eventPills(s, [
      { time: 2.1, branch: 0, text: 'Burnout' },
      { time: 5, branch: 0, text: 'Apogee' },
      { time: 10, branch: 0, text: 'Landing' },
    ]);
    expect(pills.map((p) => p.parts.map((part) => part.text))).toEqual([['Burnout'], ['Apogee'], ['Landing']]);
    expect(pills[1]!.pos).toEqual(s.scenePts[5]);
  });

  it('shares a label between events at one place, each named once', () => {
    const pills = eventPills(s, [
      { time: 5, branch: 0, text: 'Deploy' },
      { time: 5, branch: 0, text: 'Apogee' },
      { time: 5, branch: 0, text: 'Deploy' },
    ]);
    expect(pills).toHaveLength(1);
    expect(pills[0]!.parts.map((p) => p.text)).toEqual(['Deploy', 'Apogee']);
  });

  it('keeps a second event of one name at the same spot, as two landings by the pad', () => {
    const pills = eventPills(s, [
      { time: 0, branch: 0, text: 'Landing' },
      { time: 0.2, branch: 0, text: 'Landing' },
    ]);
    expect(pills[0]!.parts.map((p) => p.time)).toEqual([0, 0.2]);
  });

  it('falls back to the main track for a branch the scene lacks', () => {
    expect(eventPills(s, [{ time: 5, branch: 3, text: 'Apogee' }])[0]!.pos).toEqual(s.scenePts[5]);
  });
});

describe('an ejection charge with no deployment', () => {
  const s = buildFlightScene(
    result({
      ...arc(),
      events: [
        { type: 'EJECTION_CHARGE', time: 2 },
        { type: 'APOGEE', time: 5 },
      ],
    }),
    phase,
  );

  it('turns the model over at apogee, not at the charge', () => {
    expect(s.deployT).toBe(5);
  });
});

describe('scaling', () => {
  it('normalizes peak altitude to 24 scene units', () => {
    const s = buildFlightScene(result({ ...arc() }), phase);
    expect(s.scenePts[s.apogeeIdx]!.y).toBeCloseTo(24, 6);
    expect(s.apogeeIdx).toBe(5);
  });

  it('does not blow up on a very long flight', () => {
    // 200k samples: Math.max(...rows) would exceed the call-argument limit.
    const time = Array.from({ length: 200_000 }, (_, i) => i * 0.001);
    const altitude = time.map((t) => t * 10);
    expect(() => buildFlightScene(result({ time, altitude }), phase)).not.toThrow();
  });
});

describe('boost windows', () => {
  it('pairs each ignition with the burnout that ends it', () => {
    expect(
      boostWindows([
        { type: 'IGNITION', time: 0 },
        { type: 'BURNOUT', time: 1.5 },
        { type: 'STAGE_SEPARATION', time: 1.6 },
        { type: 'IGNITION', time: 2 },
        { type: 'BURNOUT', time: 4 },
        { type: 'APOGEE', time: 9 },
      ]),
    ).toEqual([
      [0, 1.5],
      [2, 4],
    ]);
  });

  it('holds a cluster burning out at different times in one window', () => {
    expect(
      boostWindows([
        { type: 'IGNITION', time: 0 },
        { type: 'IGNITION', time: 0 },
        { type: 'BURNOUT', time: 1.8 },
        { type: 'BURNOUT', time: 2.1 },
      ]),
    ).toEqual([[0, 2.1]]);
  });

  it('colors the sustainer burn as boost and the coast before it as coast', () => {
    const time = Array.from({ length: 11 }, (_, i) => i);
    const altitude = time.map((t) => 300 - 3 * (t - 10) ** 2);
    const s = buildFlightScene(
      result({
        time,
        altitude,
        events: [
          { type: 'IGNITION', time: 0 },
          { type: 'BURNOUT', time: 2 },
          { type: 'IGNITION', time: 4 },
          { type: 'BURNOUT', time: 6 },
          { type: 'APOGEE', time: 10 },
        ],
      }),
      phase,
    );
    expect(chan(s.colors[1]!)).toBe(RED);
    expect(chan(s.colors[3]!)).toBe(GREEN);
    expect(chan(s.colors[5]!)).toBe(RED);
    expect(chan(s.colors[8]!)).toBe(GREEN);
  });
});

describe('a sample the run left with no ground position', () => {
  it('is left out of the 3D path, as the ground track leaves it out, rather than drawn at the pad', () => {
    const gapped = {
      summary: { timeToApogee: 2 },
      events: [],
      series: {
        time: [0, 1, 2, 3, 4],
        altitude: [0, 60, 100, 60, 0],
        velocity: [0, 40, 0, 20, 10],
        Px: [0, 50, null, 150, 200],
        Py: [0, 100, 200, 300, 400],
      },
    } as unknown as FlightResult;
    expect(buildFlightScene(gapped, phase).times).toEqual([0, 1, 3, 4]);
  });

  it('still flies a run that records no ground position up the axis', () => {
    const { time, altitude } = arc();
    const flat = { summary: {}, events: [], series: { time, altitude } } as unknown as FlightResult;
    expect(buildFlightScene(flat, phase).times).toEqual(time);
  });
});
