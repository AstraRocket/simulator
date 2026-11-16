import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../src/engine/openRocketEngine';
import { resolveFilePositions } from '../../src/tree/position';
import { axialFrameOf } from '../../src/tree/axialRebase';
import { loadEngine } from '../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// `after` is the previous sibling's aft end, or the parent's aft end plus offset when isAfter() is false.

function kernelStations(tree: RocketTree, ids: string[]): Map<string, number> {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  return new Map(
    ids.map((id) => {
      const info = JSON.parse(engine.getComponentInfo(handle, id)) as { positionX: number; error?: string };
      if (info.error) throw new Error(`${id}: ${info.error}`);
      return [id, info.positionX];
    }),
  );
}

const tube = (children: ComponentNode[]): RocketTree =>
  ({
    components: [
      {
        type: 'stage',
        id: 'st',
        children: [
          { type: 'nosecone', id: 'nose', shape: 'ogive', length: 0.1, aftRadius: 0.025 },
          { type: 'bodytube', id: 'body', length: 0.4, outerRadius: 0.025, thickness: 0.001, children },
        ],
      } as ComponentNode,
    ],
  }) as RocketTree;

const after = (offset = 0) => ({ method: 'after', offset });
// Each copy's children get their own ids.
const copy = (part: object, id: string, position: object): ComponentNode => {
  const kids = (part as { children?: ComponentNode[] }).children;
  return {
    ...part,
    id,
    length: 0.03,
    position,
    ...(kids ? { children: kids.map((c) => ({ ...c, id: `${id}-${c.id}` })) } : {}),
  } as unknown as ComponentNode;
};

describe('an after position', () => {
  it.each([
    ['a tube coupler', { type: 'tubecoupler', outerRadius: 0.024, thickness: 0.001 }],
    ['a centering ring', { type: 'centeringring', outerRadius: 0.024, innerRadius: 0.01 }],
    ['a bulkhead', { type: 'bulkhead', outerRadius: 0.024 }],
    ['an inner tube', { type: 'innertube', outerRadius: 0.01, thickness: 0.0005 }],
    ['a mass component', { type: 'masscomponent', mass: 0.01, radius: 0.01 }],
    ['a parachute', { type: 'parachute', diameter: 0.3 }],
    ['a streamer', { type: 'streamer', stripLength: 0.5, stripWidth: 0.05 }],
    ['a shock cord', { type: 'shockcord', cordLength: 1 }],
    ['a launch lug', { type: 'launchlug', outerRadius: 0.003, thickness: 0.0005 }],
    ['a tube fin set', { type: 'tubefinset', finCount: 6, outerRadius: 0.01, thickness: 0.0005 }],
    // ComponentAssembly.setAxialMethod turns AFTER into TOP for both and keeps the offset.
    [
      'a pod set',
      {
        type: 'podset',
        instanceCount: 2,
        radiusOffset: 0.05,
        children: [{ type: 'bodytube', id: 'podTube', length: 0.1, outerRadius: 0.01, thickness: 0.0005 }],
      },
    ],
    [
      'a booster',
      {
        type: 'parallelstage',
        instanceCount: 2,
        radiusOffset: 0.05,
        children: [{ type: 'bodytube', id: 'boosterTube', length: 0.1, outerRadius: 0.01, thickness: 0.0005 }],
      },
    ],
    [
      'a fin set',
      {
        type: 'trapezoidfinset',
        finCount: 3,
        rootChord: 0.05,
        tipChord: 0.03,
        sweep: 0.02,
        height: 0.04,
        thickness: 0.003,
      },
    ],
  ])('places %s where the kernel does', (_label, part) => {
    const tree = tube([
      {
        type: 'innertube',
        id: 'lead',
        length: 0.07,
        outerRadius: 0.012,
        thickness: 0.0005,
        position: { method: 'top', offset: 0.05 },
      },
      copy(part, 'p0', after(0)),
      copy(part, 'p1', after(-0.1)),
    ]);
    const kernel = kernelStations(tree, ['p0', 'p1']);
    const resolved = resolveFilePositions(tree);
    for (const id of ['p0', 'p1']) expect(axialFrameOf(resolved, id)!.start, id).toBeCloseTo(kernel.get(id)!, 9);
  });
});
