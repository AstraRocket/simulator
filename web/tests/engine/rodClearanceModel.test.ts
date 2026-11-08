import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  __setEngineForTests,
  OpenRocketDesign,
  type ComponentNode,
  type MotorSpec,
  type RocketTree,
} from '../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

// Off, upstream compares travel with the full rod length. On, a rail guides until
// the second-to-last button station leaves the rod.
vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

type Engine = typeof import('../../src/engine/vendor/openrocket-engine.mjs');
let engine: Engine;

beforeAll(async () => {
  engine = await import('../../src/engine/vendor/openrocket-engine.mjs');
  __setEngineForTests(engine);
});

const TUBE_LENGTH = 0.6;

const design = (guide: ComponentNode | ComponentNode[] | null): RocketTree =>
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
            length: TUBE_LENGTH,
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
              ...(guide ? (Array.isArray(guide) ? guide : [guide]) : []),
            ],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

const lug = (length: number): ComponentNode =>
  ({
    id: 'lug',
    type: 'launchlug',
    length,
    outerRadius: 0.005,
    thickness: 0.001,
    position: { method: 'top', offset: 0 },
    overrideMass: 0,
    overrideCD: 0,
  }) as unknown as ComponentNode;

// A button's origin is its axial center.
let buttonSeq = 0;
const button = (outerDiameter: number, offset = 0, angle = 0): ComponentNode =>
  ({
    id: `button${++buttonSeq}`,
    type: 'railbutton',
    outerDiameter,
    totalHeight: 0.008,
    angleOffset: angle,
    position: { method: 'top', offset },
    overrideMass: 0,
    overrideCD: 0,
  }) as unknown as ComponentNode;

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

const MAX_TIME = 0.5;

function fly(tree: RocketTree, guideAware: boolean): { speed: number; time: number } {
  const d = OpenRocketDesign.buildTree(tree);
  d.setMotorById('tube', C6);
  // LAUNCHROD lands at a step end, so a 1 ms step resolves departures 40 mm apart.
  const r = d.simulate({
    launchRodLength: 2,
    guideAwareRodClearance: guideAware,
    randomSeed: 1,
    timeStep: 0.001,
    maxTime: MAX_TIME,
  });
  const ev = r.events.find((e) => e.type === 'LAUNCHROD');
  expect(ev, 'the flight must reach rod clearance').toBeTruthy();
  expect(ev!.time, 'rod clearance must come before the flight is cut off').toBeLessThan(MAX_TIME);
  return { speed: r.summary.launchRodVelocity, time: ev!.time };
}

describe('the default clearance model is upstream', () => {
  it('reports the same departure with a forward lug as with no guide at all', () => {
    const none = fly(design(null), false);
    const forward = fly(design(lug(0.04)), false);
    expect(forward.time).toBeCloseTo(none.time, 9);
    expect(forward.speed).toBeCloseTo(none.speed, 9);
  });

  it('reports the same departure with a rail button as with no guide at all', () => {
    const none = fly(design(null), false);
    const rail = fly(design(button(0.01)), false);
    expect(rail.time).toBeCloseTo(none.time, 9);
    expect(rail.speed).toBeCloseTo(none.speed, 9);
  });
});

describe('the guide-aware clearance model', () => {
  it('ends the guided phase sooner for a lug above the aft end', () => {
    const upstream = fly(design(lug(0.04)), false);
    const aware = fly(design(lug(0.04)), true);
    expect(aware.time).toBeLessThan(upstream.time);
    expect(aware.speed).toBeLessThan(upstream.speed);
    expect(aware.speed).toBeGreaterThan(0);
  });

  it('leaves a design with no guide alone, which is a tower', () => {
    const upstream = fly(design(null), false);
    const aware = fly(design(null), true);
    expect(aware.time).toBeCloseTo(upstream.time, 9);
    expect(aware.speed).toBeCloseTo(upstream.speed, 9);
  });

  it('ends the guided phase sooner for a rail button too', () => {
    const upstream = fly(design(button(0.01)), false);
    const aware = fly(design(button(0.01)), true);
    expect(aware.time).toBeLessThan(upstream.time);
    expect(aware.speed).toBeLessThan(upstream.speed);
  });
});

describe('a rail is guided by two buttons, not one', () => {
  const forwardLug = () => fly(design(lug(0.04)), true);

  it('gives a single button no guided travel at all', () => {
    const one = fly(design(button(0.08)), true);
    const upstream = fly(design(button(0.08)), false);
    expect(one.time).toBeLessThan(upstream.time);
    expect(one.time).toBeLessThan(forwardLug().time);
    expect(one.speed).toBeLessThan(forwardLug().speed);
  });

  it('is guided to the second-to-last station, not the last', () => {
    const pair = fly(design([button(0.08), button(0.08, 0.2)]), true);
    const byLug = forwardLug();
    expect(pair.time).toBeCloseTo(byLug.time, 9);
    expect(pair.speed).toBeCloseTo(byLug.speed, 9);
  });

  it('counts buttons side by side as one station, so still no guidance', () => {
    const sideBySide = fly(design([button(0.08), button(0.08, 0.0002)]), true);
    const one = fly(design(button(0.08)), true);
    expect(sideBySide.time).toBeCloseTo(one.time, 9);
  });

  it('does not pair buttons on opposite sides of the body', () => {
    const opposite = fly(design([button(0.08), button(0.08, 0.2, Math.PI)]), true);
    const one = fly(design(button(0.08)), true);
    expect(opposite.time).toBeCloseTo(one.time, 9);
  });
});

describe('a design with both a lug and buttons', () => {
  const aftPair = () => [button(0.08, 0.3), button(0.08, 0.5)];

  it('takes the shorter of the two', () => {
    const both = fly(design([lug(0.04), ...aftPair()]), true);
    const lugOnly = fly(design(lug(0.04)), true);
    const railOnly = fly(design(aftPair()), true);
    expect(railOnly.time).toBeGreaterThan(lugOnly.time);
    expect(both.time).toBeCloseTo(lugOnly.time, 9);
  });

  it('ignores buttons that cannot guide rather than counting them as nothing', () => {
    const withStray = fly(design([lug(0.04), button(0.08, 0.3)]), true);
    const lugOnly = fly(design(lug(0.04)), true);
    expect(withStray.time).toBeCloseTo(lugOnly.time, 9);
  });
});
