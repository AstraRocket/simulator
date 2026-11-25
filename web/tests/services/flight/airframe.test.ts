import { describe, expect, it } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { airframes, chargeMouth } from '../../../src/services/flight/airframe';
import type { FlightBody } from '../../../src/services/flight/flightBodies';
import type { Deployment } from '../../../src/services/flight/flightSources';
import { findNode } from '../../../src/services/design/treeEdit';
import { walkNodes } from '../../../src/tree/treeWalk';

const at = (method: string, offset: number) => ({ position: { method, offset } });
const chute = (id: string, over: object = {}) => ({
  id,
  type: 'parachute',
  diameter: 0.4,
  length: 0.03,
  ...at('top', 0.1),
  ...over,
});
const nose = { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.02 };
const tube = (id: string, children: object[] = [], over: object = {}) => ({
  id,
  type: 'bodytube',
  length: 0.3,
  outerRadius: 0.02,
  children,
  ...over,
});
/** Across the back of a 0.3 m tube. */
const coupler = (id: string, children: object[] = []) => ({
  id,
  type: 'tubecoupler',
  length: 0.1,
  outerRadius: 0.0195,
  children,
  ...at('top', 0.25),
});
const wall = (id: string, offset: number) => ({
  id,
  type: 'bulkhead',
  length: 0.005,
  outerRadius: 0.0195,
  ...at('top', offset),
});
const rocket = (...children: object[]): RocketTree =>
  ({ name: 'R', components: [{ id: 'stage', type: 'stage', children }] }) as unknown as RocketTree;

const idsIn = (nodes: readonly ComponentNode[]) => new Set([...walkNodes(nodes)].flatMap((n) => n.id ?? []));
const whole = (tree: RocketTree): FlightBody[] => [
  { branch: {}, parent: null, separatedAt: Infinity, partIds: idsIn(tree.components) } as unknown as FlightBody,
];
const out = (tree: RocketTree, id: string, from: number, body = 0): Deployment => ({
  device: findNode(tree, id) as ComponentNode,
  body,
  from,
  to: 100,
});
/** The ids of the part ahead of each joint that opens, for one device out. */
const opened = (tree: RocketTree, id: string): string[] => {
  const [frame] = airframes(tree, whole(tree), [out(tree, id, 5)]);
  return frame
    ? frame.sections.slice(0, -1).map((s) => [...s.partIds].filter((p) => /^(nose|t\d)$/.test(p)).at(-1)!)
    : [];
};

describe('the joint a recovery device opens', () => {
  it('is the nose cone’s, with nothing between', () => {
    expect(opened(rocket(nose, tube('t1', [chute('c')])), 'c')).toEqual(['nose']);
    expect(opened(rocket({ ...nose, children: [chute('c')] }, tube('t1')), 'c')).toEqual(['nose']);
  });

  it('is the next one forward that slides, through tubes that only meet', () => {
    expect(opened(rocket(nose, tube('t1'), tube('t2', [chute('c')])), 'c')).toEqual(['nose']);
    expect(opened(rocket(nose, tube('t1', [coupler('k')]), tube('t2', [chute('c')])), 'c')).toEqual(['t1']);
    const shouldered = { id: 't1', type: 'transition', length: 0.05, foreRadius: 0.02, aftRadius: 0.02 };
    const loose = { ...shouldered, aftShoulderLength: 0.03, aftShoulderRadius: 0.019 };
    expect(opened(rocket(nose, loose, tube('t2', [chute('c')])), 'c')).toEqual(['t1']);
  });

  it('is at the front of its own tube where a wall stops it looking further', () => {
    expect(opened(rocket(nose, tube('t1', [wall('w', 0.1)]), tube('t2', [chute('c')])), 'c')).toEqual(['t1']);
  });

  it('is not stopped by what goes with the section ahead', () => {
    const bay = tube('t1', [coupler('k', [wall('w', 0.08)])]);
    expect(opened(rocket(nose, bay, tube('t2', [chute('c')])), 'c')).toEqual(['t1']);
  });

  it('is at the back where the front is walled off', () => {
    const tree = rocket(nose, tube('t1', [wall('w', 0.02), chute('c'), coupler('k')]), tube('t2'));
    expect(opened(tree, 'c')).toEqual(['t1']);
  });

  it('is the front one where the motor closes the back, and where it is shut in at both ends', () => {
    expect(opened(rocket(nose, tube('t1', [chute('c')], { motorMount: true })), 'c')).toEqual(['nose']);
    expect(opened(rocket(nose, tube('t1', [wall('w', 0.02), chute('c'), wall('x', 0.2)])), 'c')).toEqual(['nose']);
  });

  it('goes by the shear pins where either end could open', () => {
    const pins = (offset: number) => ({
      id: 'pins',
      type: 'masscomponent',
      name: '3x 2-56 pins',
      ...at('top', offset),
    });
    const tree = (...more: object[]) => rocket(nose, tube('t1', [chute('c'), coupler('k'), ...more]), tube('t2'));
    expect(opened(tree(), 'c')).toEqual(['nose']);
    expect(opened(tree(pins(0.29)), 'c')).toEqual(['t1']);
    expect(opened(tree(pins(0.01)), 'c')).toEqual(['nose']);
  });

  it('is none with the bay already open to the air', () => {
    expect(opened(rocket(tube('t1', [chute('c')]), tube('t2')), 'c')).toEqual([]);
    const aft = tube('t1', [wall('w', 0.02), chute('c')]);
    expect(opened(rocket(nose, aft), 'c')).toEqual([]);
  });

  it('is the one the design says', () => {
    const tree = (opensAt: string) =>
      rocket(nose, tube('t1', [chute('c', { opensAt }), coupler('k')]), tube('t2'), tube('t3'));
    expect(opened(tree('auto'), 'c')).toEqual(['nose']);
    expect(opened(tree('front'), 'c')).toEqual(['nose']);
    expect(opened(tree('back'), 'c')).toEqual(['t1']);
    expect(opened(tree('closed'), 'c')).toEqual([]);
    expect(opened(tree('sideways'), 'c')).toEqual(['nose']);
  });
});

describe('an airframe that comes apart', () => {
  const dual = rocket(
    nose,
    tube('t1', [chute('main'), chute('extra'), { id: 'mc', type: 'shockcord', cordLength: 0.9, length: 0.02 }]),
    tube('t2', [chute('drogue'), { id: 'dc', type: 'shockcord', cordLength: 2, length: 0.02 }, wall('w', 0.2)]),
  );
  (dual.components[0]!.children![1] as ComponentNode).children!.push(coupler('k') as unknown as ComponentNode);
  const frames = airframes(dual, whole(dual), [out(dual, 'drogue', 5), out(dual, 'main', 20), out(dual, 'extra', 21)]);

  it('is in sections from joint to joint, each opening with its first device, on its own cord', () => {
    expect(frames).toHaveLength(1);
    const [f] = frames;
    expect(f!.sections.map((s) => [s.fore, s.aft].map((v) => Number(v.toFixed(6))))).toEqual([
      [0, 0.1],
      [0.1, 0.4],
      [0.4, 0.7],
    ]);
    expect(f!.joints).toEqual([
      { opens: 20, cord: 0.9, deviceIds: ['main', 'extra'] },
      { opens: 5, cord: 2, deviceIds: ['drogue'] },
    ]);
    expect(f!.sections[2]!.partIds.has('drogue')).toBe(true);
  });

  it('blows each charge out of the joint it opens', () => {
    expect(chargeMouth(frames, 0, 4.5, 0)).toBeCloseTo(0.4, 6);
    expect(chargeMouth(frames, 0, 19, 0)).toBeCloseTo(0.1, 6);
    expect(chargeMouth(frames, 1, 19, 0.25)).toBe(0.25);
  });

  it('hangs on a cord as long as the rocket where the design has none, three times that on automatic', () => {
    const bare = rocket(nose, tube('t1', [chute('c')]));
    expect(airframes(bare, whole(bare), [out(bare, 'c', 1)])[0]!.joints[0]!.cord).toBeCloseTo(0.4, 6);
    const auto = rocket(nose, tube('t1', [chute('c'), { id: 'k', type: 'shockcord', cordLengthAuto: true }]));
    expect(airframes(auto, whole(auto), [out(auto, 'c', 1)])[0]!.joints[0]!.cord).toBeCloseTo(1.2, 6);
  });

  it('is one to each pod, on the part that carries it, and to each strap-on once it is off', () => {
    const pod = (type: string) =>
      rocket(nose, tube('t1', [{ id: 'side', type, children: [{ ...nose, id: 'nose2' }, tube('t9', [chute('c')])] }]));
    const onPod = pod('podset');
    const [f] = airframes(onPod, whole(onPod), [out(onPod, 'c', 5)]);
    expect(f).toMatchObject({ body: 0, assemblyId: 'side', carrierId: 't1' });
    expect(f!.sections).toHaveLength(2);

    const strapped = pod('parallelstage');
    const own = idsIn([findNode(strapped, 'side')!]);
    const all = idsIn(strapped.components);
    const bodies = [
      { branch: {}, parent: null, separatedAt: Infinity, partIds: new Set([...all].filter((id) => !own.has(id))) },
      { branch: {}, parent: 0, separatedAt: 6, partIds: own },
    ] as unknown as FlightBody[];
    const [b] = airframes(strapped, bodies, [out(strapped, 'c', 5, 1)]);
    expect(b).toMatchObject({ body: 1, assemblyId: 'side', carrierId: null });
    // Not before it is off.
    expect(b!.joints[0]!.opens).toBe(6);
    // Its copies still come down apart with nothing out.
    expect(airframes(strapped, bodies, [])).toHaveLength(1);
  });
});
