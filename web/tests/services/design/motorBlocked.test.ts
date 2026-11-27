import { describe, it, expect } from 'vitest';
import { blockedMotors } from '../../../src/services/design/motorBlocked';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import type { ComponentNode, MotorSpec, RocketTree } from '../../../src/engine/openRocketEngine';

const node = (o: object) => o as unknown as ComponentNode;
const spec = (designation: string, length: number, diameter = 0.029): MotorSpec =>
  ({ designation, diameter, length }) as unknown as MotorSpec;
const bottom = (offset = 0) => ({ method: 'bottom', offset });
const top = (offset = 0) => ({ method: 'top', offset });

/** A 40 mm airframe 600 mm long; its 200 mm, 30 mm bore mount flush with the aft end, and `parts` beside it. */
const rocket = (parts: object[], mountKids: object[] = []): RocketTree =>
  ({
    components: [
      node({
        type: 'stage',
        id: 's',
        children: [
          node({
            type: 'bodytube',
            id: 'bt',
            length: 0.6,
            outerRadius: 0.0205,
            thickness: 0.0005,
            children: [
              node({
                type: 'innertube',
                id: 'mmt',
                name: 'Motor mount',
                motorMount: true,
                outerRadius: 0.0155,
                thickness: 0.0005,
                length: 0.2,
                position: bottom(),
                children: mountKids.map(node),
              }),
              ...parts.map(node),
            ],
          }),
        ],
      }),
    ],
  }) as unknown as RocketTree;

const flown = (...motors: MotorSpec[]) => motors.map((m) => newFlightConfig({ mmt: { spec: m } }));
const found = (tree: RocketTree, ...motors: MotorSpec[]) =>
  blockedMotors(tree, flown(...motors)).map((b) => [b.designation, b.blocker.id, Number(b.overlapM.toFixed(4))]);

// Its aft face 250 mm ahead of the airframe's aft end: 50 mm ahead of the mount.
const bulkhead = { type: 'bulkhead', id: 'bh', length: 0.002, position: bottom(-0.25) };

describe('blockedMotors', () => {
  it('flags a motor that runs into a bulkhead ahead of the mount, by how far', () => {
    expect(found(rocket([bulkhead]), spec('J', 0.3))).toEqual([['J', 'bh', 0.05]]);
  });

  it('leaves a motor longer than its mount alone while the airframe ahead is open', () => {
    expect(found(rocket([bulkhead]), spec('H', 0.124), spec('I', 0.24))).toEqual([]);
    expect(found(rocket([]), spec('K', 0.5))).toEqual([]);
  });

  it('flags one that runs into the engine block in its own mount, but not one seated against it', () => {
    const block = [{ type: 'engineblock', id: 'eb', length: 0.005, position: top() }];
    expect(found(rocket([], block), spec('G', 0.2))).toEqual([['G', 'eb', 0.005]]);
    expect(found(rocket([], block), spec('F', 0.195))).toEqual([]);
  });

  it('lets a motor pass a centering ring that the mount itself passes', () => {
    const ring = { type: 'centeringring', id: 'cr', length: 0.006, position: bottom(-0.194) };
    expect(found(rocket([ring]), spec('J', 0.3))).toEqual([]);
  });

  it('ignores a motor beside the blocker, and recovery gear in the way', () => {
    // A 6 mm disc 18 mm off the axis: clear of a 29 mm motor's edge at 14.5 mm.
    const aside = { ...bulkhead, outerRadius: 0.003, radialPosition: 0.018 };
    const chute = { type: 'parachute', id: 'p', length: 0.1, position: bottom(-0.2) };
    expect(found(rocket([aside, chute]), spec('J', 0.3))).toEqual([]);
  });

  it("lets each motor of a cluster through the ring's hole for its own tube", () => {
    const tree = rocket([{ type: 'centeringring', id: 'cr', length: 0.006, position: bottom(-0.194) }]);
    const mount = tree.components[0]!.children![0]!.children![0] as Record<string, unknown>;
    Object.assign(mount, { cluster: '3-ring', outerRadius: 0.006, thickness: 0.0005 });
    expect(found(tree, spec('A', 0.07, 0.01))).toEqual([]);
  });

  it('flags a motor whose engine block sits too far aft for it, by the length it lacks', () => {
    const block = [{ type: 'engineblock', id: 'eb', length: 0.006, thickness: 0.002, position: top(0.006) }];
    expect(found(rocket([], block), spec('C', 0.2))).toEqual([['C', 'eb', 0.012]]);
  });

  /** A stage of chained parts, the last a 54 mm airframe 400 mm long with a 200 mm mount flush aft. */
  const chain = (...ahead: object[]): RocketTree =>
    ({
      components: [
        node({
          type: 'stage',
          id: 's',
          children: [
            ...ahead.map(node),
            node({
              type: 'bodytube',
              id: 'bt',
              length: 0.4,
              outerRadius: 0.0275,
              thickness: 0.0005,
              children: [
                node({
                  type: 'innertube',
                  id: 'mmt',
                  motorMount: true,
                  outerRadius: 0.0195,
                  thickness: 0.0005,
                  length: 0.2,
                  position: bottom(),
                }),
              ],
            }),
          ],
        }),
      ],
    }) as unknown as RocketTree;
  const upper = { type: 'bodytube', id: 'up', length: 0.2, outerRadius: 0.0195, thickness: 0.0005 };
  // 54 mm down to 38 mm over 60 mm, a 2 mm wall: narrower inside than a 38 mm motor over its fore part.
  const reducer = {
    type: 'transition',
    id: 'tr',
    length: 0.06,
    foreRadius: 0.0195,
    aftRadius: 0.0275,
    shape: 'conical',
    thickness: 0.002,
  };

  it('flags a long motor that runs into a reducing transition ahead, where it narrows below the motor', () => {
    const [hit] = blockedMotors(chain(upper, reducer), flown(spec('L', 0.5, 0.038)));
    expect(hit?.blocker.id).toBe('tr');
    // Its front at 160 mm; the shell narrows below 19 mm inside about 11 mm into the transition, at 211 mm.
    expect(hit!.overlapM).toBeGreaterThan(0.045);
    expect(hit!.overlapM).toBeLessThan(0.056);
  });

  it('leaves a motor alone that stops short of the transition', () => {
    expect(blockedMotors(chain(upper, reducer), flown(spec('K', 0.38, 0.038)))).toEqual([]);
  });

  it('flags a motor that reaches into the nose cone of a stubby rocket', () => {
    const nose = { type: 'nosecone', id: 'nc', length: 0.1, aftRadius: 0.0275, shape: 'conical', thickness: 0.002 };
    const [hit] = blockedMotors(chain(nose), flown(spec('J', 0.45, 0.038)));
    expect(hit?.blocker.id).toBe('nc');
  });

  it("counts a transition's capped shoulder as a bulkhead", () => {
    const capped = {
      ...reducer,
      foreRadius: 0.0275,
      aftShoulderLength: 0.03,
      aftShoulderRadius: 0.027,
      aftShoulderThickness: 0.002,
      aftShoulderCapped: true,
    };
    const [hit] = blockedMotors(chain(upper, capped), flown(spec('L', 0.5, 0.038)));
    expect(hit?.blocker.id).toBe('tr');
    // The cap is the shoulder's aft 2 mm, 30 mm into the airframe: at 290 mm; the motor's front at 160 mm.
    expect(hit!.overlapM).toBeCloseTo(0.13, 6);
  });
});
