import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import {
  __setEngineForTests,
  OpenRocketDesign,
  setKernelRogersKbf,
  type ComponentNode,
  type MotorSpec,
  type RocketTree,
} from '../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

// Off, every number is upstream's. On, PATCH (RASAero) in FinSetCalc adds 80% fin friction drag to every fin
// set, and the Kbf body carryover only where upstream's NACA 1307 model is not active: that model already
// gives a trapezoidal fin set on a body tube its carryover, and Kbf stands down there so it is not counted twice.
vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  __setEngineForTests(await import('../../src/engine/vendor/openrocket-engine.mjs'));
});

afterEach(() => setKernelRogersKbf(false));

const TRAPEZOID = {
  id: 'fins',
  type: 'trapezoidfinset',
  finCount: 3,
  rootChord: 0.06,
  tipChord: 0.03,
  sweep: 0.03,
  height: 0.05,
  thickness: 0.003,
};
const ELLIPTICAL = {
  id: 'fins',
  type: 'ellipticalfinset',
  finCount: 3,
  rootChord: 0.06,
  height: 0.05,
  thickness: 0.003,
};

const tree = (fins: object) =>
  ({
    components: [
      {
        id: 'stage1',
        type: 'stage',
        children: [
          { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
          {
            id: 'tube',
            type: 'bodytube',
            length: 0.4,
            outerRadius: 0.013,
            thickness: 0.0005,
            motorMount: true,
            children: [fins as ComponentNode],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

const C6 = {
  designation: 'C6',
  diameter: 0.018,
  length: 0.07,
  cgX: 0.035,
  ejectionDelay: 5,
  times: [0, 0.5, 1.0, 1.5, 1.86],
  thrusts: [0, 12, 5, 4.5, 0],
  masses: [0.0242, 0.021, 0.017, 0.013, 0.0108],
} as unknown as MotorSpec;

const built = (fins: object = TRAPEZOID) => {
  const d = OpenRocketDesign.buildTree(tree(fins));
  d.setMotorById('tube', C6);
  return d;
};

const cd = (fins: object) => built(fins).aeroSweep({ machMin: 0.3, machMax: 0.3, machStep: 0.1 }).powerOff.total[0]!;

const apogee = (rogersKbf?: boolean) =>
  built().simulate({ launchRodLength: 1, randomSeed: 1, maxTime: 20, rogersKbf }).summary.maxAltitude;

/** Static figures and Mach 0.3 drag with the kernel default off, then on. */
function both(fins: object) {
  const off = { ...built(fins).staticInfo(), cd: cd(fins) };
  setKernelRogersKbf(true);
  const on = { ...built(fins).staticInfo(), cd: cd(fins) };
  setKernelRogersKbf(false);
  return { off, on };
}

describe('the Rogers Kbf setting', () => {
  it('raises every fin set’s drag', () => {
    for (const fins of [TRAPEZOID, ELLIPTICAL]) {
      const { off, on } = both(fins);
      expect(on.cd).toBeGreaterThan(off.cd);
      expect(on.mass).toBe(off.mass);
    }
  });

  it('leaves a trapezoidal fin set on a body tube’s CP to upstream’s own carryover', () => {
    const { off, on } = both(TRAPEZOID);
    expect(on.cp).toBe(off.cp);
    expect(on.cna).toBe(off.cna);
  });

  it('adds the carryover where upstream’s model does not reach: CP aft, CNa and margin up', () => {
    const { off, on } = both(ELLIPTICAL);
    expect(on.cp).toBeGreaterThan(off.cp);
    expect(on.cna).toBeGreaterThan(off.cna);
    expect(on.stabilityCalibers).toBeGreaterThan(off.stabilityCalibers);
  });

  it('a flight given the option flies it, whatever the kernel default', () => {
    const off = apogee(false);
    expect(apogee()).toBe(off);
    const on = apogee(true);
    expect(on).toBeLessThan(off);
    setKernelRogersKbf(true);
    expect(apogee()).toBe(on);
    expect(apogee(false)).toBe(off);
  });
});
