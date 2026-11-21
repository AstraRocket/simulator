import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  __setEngineForTests,
  OpenRocketDesign,
  type MotorSpec,
  type RocketTree,
  type SimulationOptions,
} from '../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

// Desktop's custom aerodynamic data: a simulation's CSV tables replace that half of Barrowman
// (upstream LookupTableDragCalculator / LookupTableStabilityCalculator).
vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  __setEngineForTests(await import('../../src/engine/vendor/openrocket-engine.mjs'));
});

const TREE = {
  components: [
    {
      id: 'stage1',
      type: 'stage',
      children: [
        { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
        {
          id: 'tube',
          type: 'bodytube',
          length: 0.6,
          outerRadius: 0.013,
          thickness: 0.0005,
          motorMount: true,
          children: [
            {
              id: 'fins',
              type: 'trapezoidfinset',
              finCount: 3,
              rootChord: 0.06,
              tipChord: 0.03,
              sweep: 0.03,
              height: 0.05,
              thickness: 0.003,
            },
          ],
        },
      ],
    },
  ],
} as unknown as RocketTree;

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

const RUN: SimulationOptions = { launchRodLength: 1, randomSeed: 1, maxTime: 30 };

function apogee(opts: Partial<SimulationOptions> = {}): number {
  const d = OpenRocketDesign.buildTree(TREE);
  d.setMotorById('tube', C6);
  return d.simulate({ ...RUN, ...opts }).summary.maxAltitude;
}

const dragTable = (cd: number, sep = ',') => [`Mach${sep}CD`, `0${sep}${cd}`, `1${sep}${cd}`];

describe('a drag lookup table', () => {
  it('replaces Barrowman drag: less drag flies higher', () => {
    const low = apogee({ dragLookup: dragTable(0.3) });
    const high = apogee({ dragLookup: dragTable(0.9) });
    expect(low).toBeGreaterThan(high);
    expect(apogee()).not.toBe(low);
  });

  it('reads a semicolon or tab separated table as the comma one', () => {
    const comma = apogee({ dragLookup: dragTable(0.5) });
    expect(apogee({ dragLookup: dragTable(0.5, ';') })).toBe(comma);
    expect(apogee({ dragLookup: dragTable(0.5, '\t') })).toBe(comma);
  });

  it('refuses a table without its required column, naming it', () => {
    expect(() => apogee({ dragLookup: ['mach,cn', '0,0.5'] })).toThrow(/dragLookup.*cd/);
  });
});

describe('a stability lookup table', () => {
  it('flies in place of Barrowman stability', () => {
    const rows = ['mach,aoa,cn,cm,cp', '0,0,0,0,0.5', '0,10,1.8,34.6,0.5', '1,0,0,0,0.5', '1,10,1.8,34.6,0.5'];
    const tabled = apogee({ stabilityLookup: rows });
    expect(Number.isFinite(tabled)).toBe(true);
    expect(tabled).toBeGreaterThan(0);
  });
});
