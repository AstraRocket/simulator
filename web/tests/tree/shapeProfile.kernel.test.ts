import { describe, it, expect } from 'vitest';
import { outerProfile, shapeRadius, shapeParamDefault } from '../../src/tree/shapeProfile';

// Transcribed from Transition.java, never derived from `shapeRadius`; keep them textually close to the Java.

const R = 0.05;
const L = 0.2;

const ellipsoidJava = (x: number, radius: number, length: number): number => {
  const u = (x * radius) / length;
  return Math.sqrt(2 * radius * u - u * u);
};

const powerJava = (x: number, radius: number, length: number, param: number): number =>
  radius * Math.pow(x / length, param);

const parabolicJava = (x: number, radius: number, length: number, param: number): number =>
  radius * ((2 * (x / length) - param * (x / length) ** 2) / (2 - param));

/** `HAACK.getRadius`, including its `param` term. */
const haackJava = (x: number, radius: number, length: number, param: number): number => {
  const theta = Math.acos(1 - (2 * x) / length);
  return radius * Math.sqrt((theta - Math.sin(2 * theta) / 2 + param * Math.sin(theta) ** 3) / Math.PI);
};

const ogiveJava = (x: number, radius: number, length: number, param: number): number => {
  const Rc = Math.sqrt(
    ((length ** 2 + radius ** 2) * ((2 - param) * length) ** 2 + (length ** 2 + radius ** 2) * (param * radius) ** 2) /
      (4 * (param * radius) ** 2),
  );
  const Lc = length / param;
  const y0 = Math.sqrt(Rc * Rc - Lc * Lc);
  return Math.sqrt(Rc * Rc - (Lc - x) * (Lc - x)) - y0;
};

const STATIONS = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9];

describe('every curve matches the kernel at interior points', () => {
  it.each([
    ['conical', (t: number) => R * t],
    ['ellipsoid', (t: number) => ellipsoidJava(t * L, R, L)],
    ['power', (t: number) => powerJava(t * L, R, L, shapeParamDefault('power'))],
    ['parabolic', (t: number) => parabolicJava(t * L, R, L, shapeParamDefault('parabolic'))],
    ['haack', (t: number) => haackJava(t * L, R, L, shapeParamDefault('haack'))],
    ['ogive', (t: number) => ogiveJava(t * L, R, L, shapeParamDefault('ogive'))],
  ] as const)('%s', (shape, expected) => {
    const param = shapeParamDefault(shape);
    for (const t of STATIONS) {
      // x in length units, not a fraction.
      expect(shapeRadius(shape, t * L, R, L, param), `${shape} at t=${t}`).toBeCloseTo(expected(t), 9);
    }
  });
});

describe('the curves are distinguishable from each other, and from a wrong one', () => {
  const sineArch = (t: number) => R * Math.sin((Math.PI / 2) * t);

  const mid = (shape: string, len = L) => shapeRadius(shape, 0.5 * len, R, len, shapeParamDefault(shape)) / R;

  it('pins each midpoint to the figure the Java gives, as a fraction of R', () => {
    // Literals on purpose, so a mistake copied into a formula and the code still fails.
    expect(mid('ellipsoid')).toBeCloseTo(0.8660254, 6);
    expect(mid('parabolic')).toBeCloseTo(0.75, 6);
    expect(mid('haack')).toBeCloseTo(0.7071068, 6);
    expect(mid('conical')).toBeCloseTo(0.5, 6);
    expect(mid('power')).toBeCloseTo(0.7071068, 6);
    // The ogive depends on L/R, not only x/L; this is its value at L/R 4.
    expect(mid('ogive')).toBeCloseTo(0.7613558, 6);
  });

  it('is the only shape whose profile depends on the length-to-radius ratio', () => {
    for (const shape of ['conical', 'ellipsoid', 'power', 'parabolic', 'haack'] as const) {
      expect(mid(shape, 0.1), shape).toBeCloseTo(mid(shape, 1), 6);
    }
    expect(Math.abs(mid('ogive', 0.1) - mid('ogive', 1))).toBeGreaterThan(0.03);
  });

  it('separates ellipsoid from a sine arch', () => {
    const ours = shapeRadius('ellipsoid', 0.5 * L, R, L, shapeParamDefault('ellipsoid'));
    expect(ours).toBeCloseTo(ellipsoidJava(0.5 * L, R, L), 9);
    expect(Math.abs(ours - sineArch(0.5)) / R).toBeGreaterThan(0.15);
  });

  it('admits that haack and power are NOT separated by their midpoint alone', () => {
    const haack = shapeRadius('haack', 0.5 * L, R, L, shapeParamDefault('haack'));
    const power = shapeRadius('power', 0.5 * L, R, L, shapeParamDefault('power'));
    expect(Math.abs(haack - power) / R).toBeLessThan(0.001);
    const t = 0.1;
    const haackT = shapeRadius('haack', t * L, R, L, shapeParamDefault('haack'));
    const powerT = shapeRadius('power', t * L, R, L, shapeParamDefault('power'));
    expect(Math.abs(haackT - powerT) / R).toBeGreaterThan(0.05);
  });

  it('gives every pair of curves a station where they differ', () => {
    const shapes = ['conical', 'ellipsoid', 'power', 'parabolic', 'haack', 'ogive'] as const;
    const curve = (s: string) => STATIONS.map((t) => shapeRadius(s, t * L, R, L, shapeParamDefault(s)));
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = curve(shapes[i]!);
        const b = curve(shapes[j]!);
        const apart = Math.max(...a.map((v, k) => Math.abs(v - b[k]!)));
        expect(apart / R, `${shapes[i]} vs ${shapes[j]}`).toBeGreaterThan(0.005);
      }
    }
  });
});

describe('the shape parameter is the one the kernel defaults to', () => {
  it.each([
    ['ogive', 1.0],
    ['power', 0.5],
    ['parabolic', 1.0],
    // `HAACK` defaults to `0.0` (Transition.java:1312), Von Karman, not its max of 1/3.
    ['haack', 0.0],
    ['conical', 0.0],
    ['ellipsoid', 0.0],
  ] as const)('%s defaults to %s', (shape, expected) => {
    expect(shapeParamDefault(shape)).toBeCloseTo(expected, 9);
  });
});

const profileAt = (
  shape: string,
  param: number,
  length: number,
  foreR: number,
  aftR: number,
  x: number,
  clipped?: boolean,
): number => {
  const pts = outerProfile(shape, param, length, foreR, aftR, 4, [x], clipped);
  return pts.find(([px]) => Math.abs(px - x) < 1e-12)![1];
};

describe('non-default shape parameters match the kernel at interior points', () => {
  it.each([
    ['power', 0.3, (x: number) => powerJava(x, R, L, 0.3)],
    ['power', 0.8, (x: number) => powerJava(x, R, L, 0.8)],
    ['parabolic', 0.5, (x: number) => parabolicJava(x, R, L, 0.5)],
    ['parabolic', 0.75, (x: number) => parabolicJava(x, R, L, 0.75)],
    ['haack', 1 / 3, (x: number) => haackJava(x, R, L, 1 / 3)],
    ['haack', 0.15, (x: number) => haackJava(x, R, L, 0.15)],
    ['ogive', 0.5, (x: number) => ogiveJava(x, R, L, 0.5)],
    ['ogive', 0.2, (x: number) => ogiveJava(x, R, L, 0.2)],
  ] as const)('%s at parameter %s', (shape, param, expected) => {
    for (const t of STATIONS) {
      expect(shapeRadius(shape, t * L, R, L, param), `${shape} at t=${t}`).toBeCloseTo(expected(t * L), 9);
      expect(profileAt(shape, param, L, 0, R, t * L), `${shape} profile at t=${t}`).toBeCloseTo(expected(t * L), 9);
    }
  });
});

// `OGIVE.getRadius` for `length < radius`: `x = x * radius / length; length = radius`.
describe('a short ogive is rescaled as the kernel rescales it', () => {
  const shortL = 0.03;
  it.each([1.0, 0.5])('at parameter %s', (param) => {
    for (const t of STATIONS) {
      const x = t * shortL;
      const want = ogiveJava((x * R) / shortL, R, R, param);
      expect(shapeRadius('ogive', x, R, shortL, param), `t=${t}`).toBeCloseTo(want, 9);
    }
  });
  it('is not the arc evaluated at the short length', () => {
    const x = 0.5 * shortL;
    expect(Math.abs(shapeRadius('ogive', x, R, shortL, 1) - ogiveJava(x, R, shortL, 1))).toBeGreaterThan(0.001);
  });
});

// `Transition.getRadius`: ends swapped and x mirrored when the fore end is larger.
describe('an unclipped transition matches the kernel at interior points', () => {
  const r1 = 0.02;
  const r2 = 0.05;
  it.each([
    ['ellipsoid', 0, (x: number) => r1 + ellipsoidJava(x, r2 - r1, L)],
    ['power', 0.5, (x: number) => r1 + powerJava(x, r2 - r1, L, 0.5)],
    ['power', 0.3, (x: number) => r1 + powerJava(x, r2 - r1, L, 0.3)],
    ['haack', 1 / 3, (x: number) => r1 + haackJava(x, r2 - r1, L, 1 / 3)],
  ] as const)('%s at parameter %s, small end forward', (shape, param, expected) => {
    for (const t of STATIONS) {
      expect(profileAt(shape, param, L, r1, r2, t * L, false), `t=${t}`).toBeCloseTo(expected(t * L), 9);
    }
  });
  it.each([
    ['ellipsoid', 0, (x: number) => r1 + ellipsoidJava(x, r2 - r1, L)],
    ['haack', 0.2, (x: number) => r1 + haackJava(x, r2 - r1, L, 0.2)],
  ] as const)('%s at parameter %s, large end forward', (shape, param, expected) => {
    for (const t of STATIONS) {
      expect(profileAt(shape, param, L, r2, r1, t * L, false), `t=${t}`).toBeCloseTo(expected((1 - t) * L), 9);
    }
  });
  it('differs from the clipped profile, so the flag is read', () => {
    const x = 0.25 * L;
    expect(
      Math.abs(profileAt('ellipsoid', 0, L, r1, r2, x, false) - profileAt('ellipsoid', 0, L, r1, r2, x)),
    ).toBeGreaterThan(0.001);
  });
});
