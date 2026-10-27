import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  __setEngineForTests,
  OpenRocketDesign,
  type ComponentNode,
  type MotorSpec,
  type RocketTree,
  type SimulationOptions,
} from '../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

/**
 * How long a launcher a design needs to leave it at a minimum speed, as the
 * engine reports it: the bridge flies a probe of the same rocket on a very long
 * rod and stops it at that speed (`api/RailSpeedProbe.java`).
 *
 * The standing check is the round trip: fly the design again on a rod exactly
 * that long and it leaves at the minimum speed. That holds whether the answer
 * is inside the real rod's length or past it, and with guide-aware clearance,
 * where the answer is a rod length rather than the distance the rocket moved.
 *
 * Flies the real kernel; see `testing/kernelTimeout.ts`.
 */
vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

type Engine = typeof import('../../src/engine/vendor/openrocket-engine.mjs');
let engine: Engine;

beforeAll(async () => {
  engine = await import('../../src/engine/vendor/openrocket-engine.mjs');
  __setEngineForTests(engine);
});

/** A small rocket, with a launch lug when one is asked for. */
const design = (guide: ComponentNode | null = null): RocketTree =>
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
              ...(guide ? [guide] : []),
            ],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

/** At the tube's front, so guide-aware clearance ends well before the rod's end. */
const LUG = {
  id: 'lug',
  type: 'launchlug',
  length: 0.04,
  outerRadius: 0.005,
  thickness: 0.001,
  position: { method: 'top', offset: 0 },
  overrideMass: 0,
  overrideCD: 0,
} as unknown as ComponentNode;

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

/** A 1 ms step, so the round trip resolves the speed to a few cm/s. */
const RUN: SimulationOptions = { launchRodLength: 1, randomSeed: 1, timeStep: 0.001, maxTime: 0.6 };

function fly(tree: RocketTree, opts: Partial<SimulationOptions>) {
  const d = OpenRocketDesign.buildTree(tree);
  d.setMotorById('tube', C6);
  return d.simulate({ ...RUN, ...opts }).summary;
}

describe('rail length needed', () => {
  it('is not reported, and nothing extra flies, unless a minimum speed is asked for', () => {
    expect(fly(design(), {}).railLengthNeeded).toBeUndefined();
  });

  it("leaves the flight's own figures alone", () => {
    const plain = fly(design(), {});
    const asked = fly(design(), { railExitMinSpeed: 10 });
    expect(asked.launchRodVelocity).toBe(plain.launchRodVelocity);
    expect(asked.maxAltitude).toBe(plain.maxAltitude);
  });

  it('is shorter than the rod when the rocket reaches the speed on it', () => {
    const s = fly(design(), { railExitMinSpeed: 5 });
    expect(s.launchRodVelocity).toBeGreaterThan(5);
    expect(s.railLengthNeeded).toBeGreaterThan(0);
    expect(s.railLengthNeeded!).toBeLessThan(1);
  });

  it('is the rod that leaves at the speed, when that is past the real one', () => {
    const plain = fly(design(), {});
    const min = plain.launchRodVelocity + 3;
    const needed = fly(design(), { railExitMinSpeed: min }).railLengthNeeded!;
    expect(needed).toBeGreaterThan(1);
    // Fly it on exactly that rod: it leaves at the minimum.
    expect(fly(design(), { launchRodLength: needed }).launchRodVelocity).toBeCloseTo(min, 1);
  });

  it('is null when no rod is long enough', () => {
    expect(fly(design(), { railExitMinSpeed: 500 }).railLengthNeeded).toBeNull();
  });

  /**
   * With guide-aware clearance the rocket stops being guided before its tail
   * reaches the rod's end, so the answer is the rod that lets the lug carry it
   * to the speed, not the distance moved.
   */
  it('is a rod length under guide-aware clearance too', () => {
    const opts = { guideAwareRodClearance: true };
    const plain = fly(design(LUG), opts);
    const min = plain.launchRodVelocity + 3;
    const needed = fly(design(LUG), { ...opts, railExitMinSpeed: min }).railLengthNeeded!;
    expect(fly(design(LUG), { ...opts, launchRodLength: needed }).launchRodVelocity).toBeCloseTo(min, 1);
  });
});
