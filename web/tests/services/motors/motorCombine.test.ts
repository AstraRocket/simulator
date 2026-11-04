import { NO_VALUE } from '../../../src/i18n/noValue';
import { describe, it, expect } from 'vitest';
import { finalizeSamples } from '../../../src/services/motors/curveFinalize';
import { thrustAt, impulse, combineCurves, impulseClass, type Sample } from '../../../src/services/motors/motorCombine';

const A: Sample[] = [
  [0, 0],
  [1, 10],
  [2, 0],
];
const B: Sample[] = [
  [0, 0],
  [0.5, 20],
  [1, 0],
];

describe('thrustAt', () => {
  it('interpolates linearly inside the curve', () => {
    expect(thrustAt(A, 0.5)).toBeCloseTo(5, 9);
    expect(thrustAt(A, 1.5)).toBeCloseTo(5, 9);
  });
  it('is zero before ignition and after burnout', () => {
    expect(thrustAt(A, -1)).toBe(0);
    expect(thrustAt(A, 5)).toBe(0);
  });
});

describe('impulse', () => {
  it('trapezoid-integrates a curve', () => {
    expect(impulse(A)).toBeCloseTo(10, 9);
    expect(impulse(B)).toBeCloseTo(10, 9);
  });
});

describe('combineCurves', () => {
  it('sums simultaneous curves and aggregates cluster stats', () => {
    const c = combineCurves([A, B]);
    expect(c.motorCount).toBe(2);
    expect(c.totalImpulse).toBeCloseTo(20, 6);
    expect(c.peakThrust).toBeCloseTo(25, 6);
  });
  it('returns a zeroed result for no usable curves', () => {
    expect(combineCurves([]).motorCount).toBe(0);
    expect(combineCurves([[[0, 0]]]).totalImpulse).toBe(0);
  });
});

describe('impulseClass', () => {
  it('maps N·s to the NAR/TRA class letter', () => {
    expect(impulseClass(2.5)).toBe('A');
    expect(impulseClass(2.51)).toBe('B');
    expect(impulseClass(5)).toBe('B');
    expect(impulseClass(10)).toBe('C');
    expect(impulseClass(20)).toBe('D');
    expect(impulseClass(320)).toBe('H');
    expect(impulseClass(1280)).toBe('J');
  });
  it('names the fractional classes below A', () => {
    // NAR boundaries: 1/8A <= 0.3125, 1/4A <= 0.625, 1/2A <= 1.25, A <= 2.5.
    expect(impulseClass(0.3125)).toBe('1/8A');
    expect(impulseClass(0.5)).toBe('1/4A');
    expect(impulseClass(0.625)).toBe('1/4A');
    expect(impulseClass(0.75)).toBe('1/2A');
    expect(impulseClass(1)).toBe('1/2A');
    expect(impulseClass(1.25)).toBe('1/2A');
    expect(impulseClass(1.26)).toBe('A');
    expect(impulseClass(2.5)).toBe('A');
  });

  it('is the no-value glyph only where there is no class left', () => {
    expect(impulseClass(0.1)).toBe(NO_VALUE);
    expect(impulseClass(0)).toBe(NO_VALUE);
    expect(impulseClass(-5)).toBe(NO_VALUE);
    expect(impulseClass(NaN)).toBe(NO_VALUE);
  });
});
describe('thrustAt at the end of a curve', () => {
  const abrupt: Sample[] = [
    [0, 0],
    [0.1, 10],
    [1.8, 5],
  ];

  it('reports the final sample thrust AT its time, and 0 after', () => {
    expect(thrustAt(abrupt, 1.8)).toBe(5);
    expect(thrustAt(abrupt, 1.80001)).toBe(0);
    expect(thrustAt(abrupt, 100)).toBe(0);
  });

  it('keeps the tail in the combined impulse', () => {
    expect(impulse(abrupt)).toBeCloseTo(13.25, 9);
    expect(combineCurves([abrupt]).totalImpulse).toBeCloseTo(13.25, 4);
  });

  it('agrees with the raw integral for a curve that ends at zero', () => {
    const clean: Sample[] = [
      [0, 0],
      [0.1, 10],
      [1.8, 5],
      [1.81, 0],
    ];
    expect(combineCurves([clean]).totalImpulse).toBeCloseTo(impulse(clean), 9);
  });

  it('sums two motors without losing either tail', () => {
    const a: Sample[] = [
      [0, 0],
      [1, 4],
    ];
    const b: Sample[] = [
      [0, 0],
      [2, 6],
    ];
    expect(combineCurves([a, b]).totalImpulse).toBeCloseTo(impulse(a) + impulse(b), 4);
  });
});

// A duplicated time is a vertical edge: `thrustAt` returns the last sample there.
describe('a curve with a step at a duplicated timestamp', () => {
  const stepUp: Sample[] = [
    [0, 0],
    [0, 100],
    [1, 100],
    [1, 0],
  ];

  it('reads the value AFTER the step, not before it', () => {
    expect(thrustAt(stepUp, 0)).toBe(100);
    expect(thrustAt(stepUp, 0.5)).toBe(100);
    expect(thrustAt(stepUp, 1)).toBe(0);
  });

  it('reports the true impulse', () => {
    expect(impulse(stepUp)).toBeCloseTo(100, 9);
    expect(combineCurves([stepUp]).totalImpulse).toBeCloseTo(100, 9);
  });

  it('reports the true peak', () => {
    expect(combineCurves([stepUp]).peakThrust).toBe(100);
  });
});
describe('every curve in the bundled catalog', () => {
  const load = async () => {
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(readFileSync('public/data/motors.generated.json', 'utf8')) as Record<string, unknown>;
    const motors = (Array.isArray(raw) ? raw : (Object.values(raw).find(Array.isArray) as unknown[])) as {
      designation?: string;
      curves?: { samples?: Sample[] }[];
    }[];
    const curves: { name: string; s: Sample[] }[] = [];
    for (const m of motors) {
      for (const c of m.curves ?? []) {
        const s = (c.samples ?? []) as Sample[];
        if (s.length >= 2) curves.push({ name: m.designation ?? '?', s });
      }
    }
    return curves;
  };
  const hasStep = (s: Sample[]) => new Set(s.map(([t]) => t)).size !== s.length;

  it('resamples to a curve whose own trapezoid matches the source impulse', async () => {
    const curves = (await load()).filter(({ s }) => !hasStep(s));
    const wrong: string[] = [];
    for (const { name, s } of curves) {
      const truth = impulse(finalizeSamples(s));
      const shown = impulse(combineCurves([s]).samples);
      // The terminator ramps a non-zero ending to 0 over 1e-6 s: about 5e-8 relative.
      if (Math.abs(truth - shown) / Math.max(truth, 1e-9) > 1e-4) {
        wrong.push(`${name}: ${truth.toFixed(3)} vs ${shown.toFixed(3)}`);
      }
    }
    expect(curves.length).toBeGreaterThan(1000);
    expect(wrong).toEqual([]);
  });

  it('reads the later sample at every duplicated timestamp', async () => {
    const curves = (await load()).filter(({ s }) => hasStep(s));
    const wrong: string[] = [];
    for (const { name, s } of curves) {
      const resampled = new Map(combineCurves([s]).samples);
      const flown = new Map(finalizeSamples(s));
      for (let i = 1; i < s.length; i++) {
        const [t, f] = s[i]!;
        if (s[i - 1]![0] !== t) continue;
        const last = s.filter(([tt]) => tt === t).at(-1)![1];
        if (thrustAt(s, t) !== last || resampled.get(t) !== flown.get(t)) {
          wrong.push(`${name} @ ${t}s: got ${thrustAt(s, t)} / ${resampled.get(t)}, want ${last} (not ${f})`);
        }
      }
    }
    expect(curves.length).toBeGreaterThan(30);
    expect(wrong).toEqual([]);
  });
});
