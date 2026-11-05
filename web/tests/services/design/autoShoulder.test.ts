import { describe, it, expect } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { syncAutoShoulders } from '../../../src/services/design/autoShoulder';
import { defaultNode, updateNode } from '../../../src/services/design/treeEdit';

const stage = (children: ComponentNode[]) =>
  ({ name: 'T', components: [{ type: 'stage', name: 'S', children }] }) as unknown as RocketTree;

const chainOf = (tree: RocketTree) => (tree.components[0] as unknown as { children: ComponentNode[] }).children;

const tube = (id: string, outerRadius: number, thickness: number) =>
  ({ type: 'bodytube', id, length: 0.3, outerRadius, thickness }) as unknown as ComponentNode;

describe('syncAutoShoulders', () => {
  it('gives a nose cone the bore of the tube behind it', () => {
    const t = syncAutoShoulders(
      stage([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.013, shoulderAuto: true } as unknown as ComponentNode,
        tube('b', 0.013, 0.001),
      ]),
    );
    expect(chainOf(t)[0]!['shoulderRadius']).toBeCloseTo(0.012, 9);
  });

  it('reads the END the shoulder plugs into, not the neighbor wholesale', () => {
    const t = syncAutoShoulders(
      stage([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.02, shoulderAuto: true } as unknown as ComponentNode,
        {
          type: 'transition',
          id: 'tr',
          length: 0.05,
          foreRadius: 0.02,
          aftRadius: 0.01,
          thickness: 0.001,
        } as unknown as ComponentNode,
      ]),
    );
    expect(chainOf(t)[0]!['shoulderRadius']).toBeCloseTo(0.019, 9);
  });

  it('takes a transition fore shoulder from the part above and aft from the part below', () => {
    const t = syncAutoShoulders(
      stage([
        tube('a', 0.013, 0.001),
        {
          type: 'transition',
          id: 'tr',
          length: 0.05,
          foreRadius: 0.013,
          aftRadius: 0.009,
          thickness: 0.0005,
          foreShoulderAuto: true,
          aftShoulderAuto: true,
        } as unknown as ComponentNode,
        tube('b', 0.009, 0.0005),
      ]),
    );
    const tr = chainOf(t)[1]!;
    expect(tr['foreShoulderRadius']).toBeCloseTo(0.012, 9);
    expect(tr['aftShoulderRadius']).toBeCloseTo(0.0085, 9);
  });

  it('touches nothing without the flag, which is every imported design', () => {
    const before = stage([
      { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.013 } as unknown as ComponentNode,
      tube('b', 0.013, 0.001),
    ]);
    const after = syncAutoShoulders(before);
    expect(after).toBe(before);
    expect(chainOf(after)[0]!['shoulderRadius']).toBeUndefined();
  });

  it('leaves a typed value alone when there is no neighbor to follow yet', () => {
    const t = syncAutoShoulders(
      stage([
        {
          type: 'nosecone',
          id: 'n',
          length: 0.1,
          aftRadius: 0.013,
          shoulderRadius: 0.011,
          shoulderAuto: true,
        } as unknown as ComponentNode,
      ]),
    );
    expect(chainOf(t)[0]!['shoulderRadius']).toBeCloseTo(0.011, 9);
  });

  it('follows the tube through an edit, and stops the moment the flag is cleared', () => {
    let t = syncAutoShoulders(
      stage([
        { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.013, shoulderAuto: true } as unknown as ComponentNode,
        tube('b', 0.013, 0.001),
      ]),
    );
    t = updateNode(t, 'b', { thickness: 0.002 });
    expect(chainOf(t)[0]!['shoulderRadius']).toBeCloseTo(0.011, 9);

    t = updateNode(t, 'n', { shoulderAuto: false });
    t = updateNode(t, 'b', { thickness: 0.003 });
    expect(chainOf(t)[0]!['shoulderRadius']).toBeCloseTo(0.011, 9);
  });

  it('is on for a part created here and absent from the file reader', () => {
    expect(defaultNode('nosecone')['shoulderAuto']).toBe(true);
    expect(defaultNode('transition')['foreShoulderAuto']).toBe(true);
    expect(defaultNode('transition')['aftShoulderAuto']).toBe(true);
    expect(defaultNode('bodytube')['shoulderAuto']).toBeUndefined();
  });
});

describe('a tail cone', () => {
  it('plugs its shoulder into the part ahead of it', () => {
    const t = syncAutoShoulders(
      stage([
        tube('b', 0.02, 0.001),
        {
          type: 'nosecone',
          id: 'tail',
          length: 0.05,
          aftRadius: 0.02,
          flipped: true,
          shoulderAuto: true,
          shoulderLength: 0.02,
        } as unknown as ComponentNode,
      ]),
    );
    expect(chainOf(t)[1]!['shoulderRadius']).toBeCloseTo(0.019, 12);
  });
});

// Transition.setForeShoulderRadius clamps to its own end: `MathUtil.min(radius, getForeRadius())`.
describe('an automatic transition shoulder', () => {
  const tree = (foreRadius: number, aftRadius: number): RocketTree =>
    ({
      components: [
        {
          type: 'stage',
          id: 's',
          children: [
            { type: 'bodytube', id: 'a', length: 0.2, outerRadius: 0.025, thickness: 0.001 },
            {
              type: 'transition',
              id: 't',
              length: 0.05,
              foreRadius,
              aftRadius,
              thickness: 0.001,
              foreShoulderAuto: true,
              foreShoulderLength: 0.02,
              aftShoulderAuto: true,
              aftShoulderLength: 0.02,
            },
            { type: 'bodytube', id: 'b', length: 0.2, outerRadius: 0.025, thickness: 0.001 },
          ],
        },
      ],
    }) as unknown as RocketTree;
  const shoulders = (t: RocketTree) => {
    const n = t.components[0]!.children![1]!;
    return [n['foreShoulderRadius'], n['aftShoulderRadius']];
  };

  it('stops at an end narrower than the bore', () => {
    expect(shoulders(syncAutoShoulders(tree(0.01, 0.015)))).toEqual([0.01, 0.015]);
  });

  it('follows the bore when the end is wider', () => {
    const [fore, aft] = shoulders(syncAutoShoulders(tree(0.03, 0.03))) as number[];
    expect(fore).toBeCloseTo(0.024, 12);
    expect(aft).toBeCloseTo(0.024, 12);
  });
});
