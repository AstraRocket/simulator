import { describe, it, expect } from 'vitest';
import { otherMountOffer } from '../../../src/services/flight/otherMounts';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import {
  PLUGGED_DELAY,
  type ComponentNode,
  type MotorSpec,
  type RocketTree,
} from '../../../src/engine/openRocketEngine';

const node = (o: object) => o as unknown as ComponentNode;
const spec = (designation: string, ejectionDelay = 7): MotorSpec =>
  ({ designation, diameter: 0.029, length: 0.124, ejectionDelay }) as unknown as MotorSpec;
// A 30 mm bore, 200 mm long.
const tube = (id: string, o: object = {}) =>
  node({ type: 'innertube', id, motorMount: true, outerRadius: 0.0155, thickness: 0.0005, length: 0.2, ...o });

const tree = {
  components: [
    node({ type: 'stage', id: 'upper', children: [node({ type: 'bodytube', id: 'ub', children: [tube('top')] })] }),
    node({
      type: 'stage',
      id: 'booster',
      children: [
        node({
          type: 'bodytube',
          id: 'bb',
          children: [
            tube('a'),
            tube('b'),
            tube('c'),
            tube('narrow', { outerRadius: 0.0125 }),
            tube('short', { length: 0.05 }),
          ],
        }),
      ],
    }),
  ],
} as unknown as RocketTree;

const ids = (nodes: { node: ComponentNode }[]) => nodes.map((x) => x.node.id);

describe('otherMountOffer', () => {
  it('offers the other mounts of the same stage only, and names why the rest are left out', () => {
    const offer = otherMountOffer(tree, newFlightConfig({ a: { spec: spec('H128W') } }), 'a', spec('H128W'));
    expect(ids(offer.loads)).toEqual(['b', 'c']);
    expect(offer.skipped.map((s) => [s.node.id, s.reason])).toEqual([
      ['narrow', 'tooWide'],
      ['short', 'tooLong'],
    ]);
  });

  it('says what each mount holds now', () => {
    const config = newFlightConfig({ a: { spec: spec('H128W') }, b: { spec: spec('G80') } });
    const [b, c] = otherMountOffer(tree, config, 'a', spec('H128W')).loads;
    expect(b!.replaces?.designation).toBe('G80');
    expect(c!.replaces).toBeNull();
  });

  it('keeps a plugged mount plugged, and leaves out one that already holds what it would get', () => {
    const config = newFlightConfig({
      a: { spec: spec('H128W') },
      b: { spec: spec('G80', PLUGGED_DELAY) },
      c: { spec: spec('H128W') },
    });
    const { loads } = otherMountOffer(tree, config, 'a', spec('H128W'));
    expect(ids(loads)).toEqual(['b']);
    expect(loads[0]!.keptPlugged).toBe(true);
    expect(loads[0]!.spec).toMatchObject({ designation: 'H128W', ejectionDelay: PLUGGED_DELAY });
  });

  it('copies a plugged pick as picked', () => {
    const { loads } = otherMountOffer(tree, newFlightConfig({}), 'a', spec('H128W', PLUGGED_DELAY));
    expect(loads.every((l) => l.spec.ejectionDelay === PLUGGED_DELAY && !l.keptPlugged)).toBe(true);
  });
});
