import { describe, it, expect, vi, afterEach } from 'vitest';
import { samplesToMotorSpec, catalogMotorSpec } from '../../../src/services/motors/motorSpec';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';

// samplesToMotorSpec's metadata param is module-internal; build a shaped literal.
const motor = (over: Record<string, unknown> = {}) =>
  ({
    designation: 'C6',
    manufacturerAbbrev: 'Estes',
    diameter: 18, // mm
    length: 70, // mm
    totalWeightG: 20,
    propWeightG: 10,
    ...over,
  }) as never;

describe('samplesToMotorSpec', () => {
  it('converts mm→m and sets cg at half length', () => {
    const spec = samplesToMotorSpec(
      motor(),
      [
        { time: 0, thrust: 10 },
        { time: 1, thrust: 10 },
      ],
      5,
    );
    expect(spec.diameter).toBeCloseTo(0.018, 9);
    expect(spec.length).toBeCloseTo(0.07, 9);
    expect(spec.cgX).toBeCloseTo(0.035, 9);
    expect(spec.ejectionDelay).toBe(5);
    expect(spec.manufacturer).toBe('Estes');
  });

  it('interpolates mass from loaded down to burnout proportional to cumulative impulse', () => {
    const spec = samplesToMotorSpec(
      motor(),
      [
        { time: 0, thrust: 10 },
        { time: 1, thrust: 10 },
      ],
      0,
    );
    expect(spec.masses[0]).toBeCloseTo(0.02, 9); // loaded mass
    expect(spec.masses[spec.masses.length - 1]).toBeCloseTo(0.01, 9); // loaded − prop
  });

  it('prepends a {0,0} sample when the curve does not start at t=0', () => {
    const spec = samplesToMotorSpec(
      motor(),
      [
        { time: 0.5, thrust: 10 },
        { time: 1, thrust: 10 },
      ],
      0,
    );
    expect(spec.times[0]).toBe(0);
    expect(spec.thrusts[0]).toBe(0);
    expect(spec.times).toHaveLength(3);
  });

  it('sorts unordered samples by time', () => {
    const spec = samplesToMotorSpec(
      motor(),
      [
        { time: 1, thrust: 10 },
        { time: 0, thrust: 0 },
      ],
      0,
    );
    expect(spec.times).toEqual([0, 1]);
  });

  it('keeps mass constant when total impulse is zero', () => {
    const spec = samplesToMotorSpec(
      motor(),
      [
        { time: 0, thrust: 0 },
        { time: 1, thrust: 0 },
      ],
      0,
    );
    expect(spec.masses.every((m) => Math.abs(m - 0.02) < 1e-12)).toBe(true);
  });

  it('throws with no samples', () => {
    expect(() => samplesToMotorSpec(motor(), [], 0)).toThrow(/no thrust samples/i);
  });

  it('throws on non-finite catalog weights (guards a TeaVM BigInt crash)', () => {
    expect(() =>
      samplesToMotorSpec(
        motor({ totalWeightG: NaN }),
        [
          { time: 0, thrust: 1 },
          { time: 1, thrust: 1 },
        ],
        0,
      ),
    ).toThrow(expect.objectContaining({ key: 'errors.thrustcurve.noWeight', values: { motor: 'C6' } }));
  });

  it.each([
    ['a negative propellant mass', { propWeightG: -5 }],
    ['a loaded mass of zero', { totalWeightG: 0, propWeightG: 0 }],
  ])('throws on %s, which would fly a mass that rises or is nothing', (_label, over) => {
    expect(() =>
      samplesToMotorSpec(
        motor(over),
        [
          { time: 0, thrust: 1 },
          { time: 1, thrust: 1 },
        ],
        0,
      ),
    ).toThrow(expect.objectContaining({ key: 'errors.thrustcurve.badWeight', values: { motor: 'C6' } }));
  });

  it('throws when propellant exceeds loaded mass (negative burnout mass)', () => {
    expect(() =>
      samplesToMotorSpec(
        motor({ totalWeightG: 10, propWeightG: 20 }),
        [
          { time: 0, thrust: 1 },
          { time: 1, thrust: 1 },
        ],
        0,
      ),
    ).toThrow(/more propellant/i);
  });
});

describe('samplesToMotorSpec refuses what ThrustCurveMotor.Builder.build() refuses', () => {
  it('a negative thrust sample', () => {
    expect(() =>
      samplesToMotorSpec(
        motor(),
        [
          { time: 0, thrust: 0 },
          { time: 0.5, thrust: -3 },
          { time: 1, thrust: 0 },
        ],
        0,
      ),
    ).toThrow(expect.objectContaining({ key: 'errors.thrustcurve.negativeThrust', values: { motor: 'C6' } }));
  });

  it('a launch CG outside [0, length]', () => {
    const samples = [
      { time: 0, thrust: 1 },
      { time: 1, thrust: 1 },
    ];
    for (const cg of [-0.001, 0.071]) {
      expect(() => samplesToMotorSpec(motor(), samples, 0, [[0, cg]])).toThrow(
        expect.objectContaining({ key: 'errors.thrustcurve.badCg', values: { motor: 'C6', length: 70 } }),
      );
    }
    expect(samplesToMotorSpec(motor(), samples, 0, [[0, 0.07]]).cgX).toBe(0.07);
  });
});

describe('catalogMotorSpec: bundled catalog motor', () => {
  const bundled = {
    designation: 'C6',
    manufacturer: 'Estes',
    class: 'C',
    diameter: 18,
    impulse: 8.8,
    burn: 1,
    mass: 24,
    length: 70,
    propWeightG: 10,
    curves: [
      {
        src: 'Certified · RASP',
        samples: [
          [0, 0],
          [0.5, 20],
          [1, 0],
        ],
      },
    ],
  } as unknown as CatalogMotor;

  it('builds a MotorSpec entirely from bundled data: no thrustcurve.org fetch', async () => {
    const spec = await catalogMotorSpec(bundled, 5);
    expect(spec.designation).toBe('C6');
    expect(spec.diameter).toBeCloseTo(0.018, 9); // mm → m
    expect(spec.length).toBeCloseTo(0.07, 9);
    expect(spec.ejectionDelay).toBe(5);
    expect(spec.times[0]).toBe(0);
    expect(spec.thrusts).toContain(20);
    expect(spec.curveSrc).toBe('Certified · RASP');
  });

  it('carries the full designation for display, keeping the common name the kernel and .ork match on', async () => {
    const spec = await catalogMotorSpec({ ...bundled, designation: 'F67', code: 'F67W' } as CatalogMotor, 9);
    expect(spec.designation).toBe('F67');
    expect(spec.code).toBe('F67W');
  });

  it('adds no full designation that only repeats the common name', async () => {
    const spec = await catalogMotorSpec({ ...bundled, code: 'C6' } as CatalogMotor, 5);
    expect(spec.code).toBeUndefined();
  });

  it('builds from the selected curve index and records its source', async () => {
    const multi = {
      designation: 'X',
      manufacturer: 'Y',
      class: 'C',
      diameter: 18,
      impulse: 10,
      burn: 1,
      mass: 20,
      length: 70,
      propWeightG: 10,
      curves: [
        {
          src: 'Certified · RASP',
          samples: [
            [0, 0],
            [1, 10],
          ],
        },
        {
          src: 'User · RockSim',
          samples: [
            [0, 0],
            [0.5, 40],
            [1, 0],
          ],
        },
      ],
    } as unknown as CatalogMotor;

    const first = await catalogMotorSpec(multi, 0, 0);
    expect(first.curveSrc).toBe('Certified · RASP');
    expect(first.thrusts).toContain(10);

    const second = await catalogMotorSpec(multi, 0, 1);
    expect(second.curveSrc).toBe('User · RockSim');
    expect(second.thrusts).toContain(40);
  });
});

/**
 * The sync asks thrustcurve.org for every motor's curve files, and the pick-time
 * lookup asked the same endpoint the same question, so a motor the sync found
 * no curve for has none to fetch. It is refused, and nothing reaches the network.
 */
describe('catalogMotorSpec: catalog motor with no bundled curve', () => {
  afterEach(() => vi.unstubAllGlobals());

  const curveless = {
    designation: 'D12',
    manufacturer: 'Jambol',
    class: 'D',
    diameter: 24,
    impulse: 17,
    burn: 1.6,
    mass: 44,
    noCurve: true,
  } as unknown as CatalogMotor;

  it('is refused with the keyed no-curve error, without a network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(catalogMotorSpec(curveless, 5)).rejects.toMatchObject({
      key: 'errors.thrustcurve.noCurve',
      values: { motor: 'D12' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
