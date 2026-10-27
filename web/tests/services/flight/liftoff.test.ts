import { describe, it, expect } from 'vitest';
import { liftoffFor } from '../../../src/services/flight/liftoff';
import { defaultRocketTree } from '../../../src/services/design/defaultRocket';
import { findMounts, updateNode } from '../../../src/services/design/treeEdit';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import { C6 } from '../../../src/engine/api';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

/** Every node in the tree, depth first. */
const collect = (tree: RocketTree): ComponentNode[] => {
  const out: ComponentNode[] = [];
  const walk = (nodes: readonly ComponentNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(tree.components);
  return out;
};

/**
 * What a candidate motor lifts besides itself: the airframe, the other mounts'
 * motors, and how many of the candidate one mount takes. Counted the way the
 * rocket's class counts seated motors.
 */
describe('liftoffFor', () => {
  const mountOf = (tree: RocketTree) => findMounts(tree)[0]!.id as string;

  it('is the dry mass alone for a single mount, one motor', () => {
    const tree = defaultRocketTree();
    const id = mountOf(tree);
    const l = liftoffFor(tree, newFlightConfig({ [id]: { spec: C6 } }), id, 0.1);
    expect(l).toEqual({ dryKg: 0.1, otherMotorsKg: 0, count: 1 });
  });

  it('counts every motor a cluster flies at once', () => {
    let tree = defaultRocketTree();
    const id = mountOf(tree);
    tree = updateNode(tree, id, { cluster: '3-ring' });
    expect(liftoffFor(tree, newFlightConfig({}), id, 0.1).count).toBe(3);
  });

  /** The candidate replaces this mount's motor; the others ride along as weight. */
  it("adds the other mounts' motors at ignition, not this mount's own", () => {
    let tree = defaultRocketTree();
    const first = mountOf(tree);
    const tube = collect(tree).find((n) => n.type === 'bodytube' && n.id !== first)!;
    tree = updateNode(tree, tube.id as string, { motorMount: true });
    const second = tube.id as string;
    const heavy = { ...C6, masses: C6.masses.map((m) => m * 2) };
    const config = newFlightConfig({ [first]: { spec: C6 }, [second]: { spec: heavy } });
    expect(liftoffFor(tree, config, first, 0.1).otherMotorsKg).toBeCloseTo(heavy.masses[0]!, 9);
    expect(liftoffFor(tree, config, second, 0.1).otherMotorsKg).toBeCloseTo(C6.masses[0]!, 9);
  });
});
