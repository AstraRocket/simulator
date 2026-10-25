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

/**
 * An `after` position, which only an older or hand-edited file carries, is
 * resolved by the app before the kernel sees the design. Its station has to be
 * the one the kernel gives the same design built with `after` as written: the
 * previous sibling's aft end for the parts whose isAfter() is the method's own,
 * and the parent's aft end plus the offset for the ones that override it to
 * false (fin sets, inner tubes, lugs, mass objects, tube fins).
 */

/** Each part's station from the nose, as the kernel locates it. */
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

describe('an after position', () => {
  it.each([
    ['a tube coupler', { type: 'tubecoupler', outerRadius: 0.024, thickness: 0.001 }],
    ['a centering ring', { type: 'centeringring', outerRadius: 0.024, innerRadius: 0.01 }],
    ['a bulkhead', { type: 'bulkhead', outerRadius: 0.024 }],
    ['an inner tube', { type: 'innertube', outerRadius: 0.01, thickness: 0.0005 }],
    ['a mass component', { type: 'masscomponent', mass: 0.01, radius: 0.01 }],
    ['a parachute', { type: 'parachute', diameter: 0.3 }],
    ['a launch lug', { type: 'launchlug', outerRadius: 0.003, thickness: 0.0005 }],
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
      { ...part, id: 'p0', length: 0.03, position: after(0) } as ComponentNode,
      { ...part, id: 'p1', length: 0.03, position: after(-0.1) } as ComponentNode,
    ]);
    const kernel = kernelStations(tree, ['p0', 'p1']);
    const resolved = resolveFilePositions(tree);
    for (const id of ['p0', 'p1']) expect(axialFrameOf(resolved, id)!.start, id).toBeCloseTo(kernel.get(id)!, 9);
  });
});
