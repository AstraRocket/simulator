import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { finSetPositions } from '../../../src/services/report/reportModel';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The fin marking guide, the design CSV and the .ork designinfo give each fin
 * set's root span from the nose. Cant turns a fin about its root's midpoint and
 * leaves the root's station where it was, so a canted set has to report the
 * span the same set reports uncanted, which is the kernel's own figure.
 */

const design = (cantRad: number, rootChord: number): RocketTree =>
  ({
    name: 'Canted',
    components: [
      {
        type: 'stage',
        id: 'st',
        children: [
          { type: 'nosecone', id: 'nose', shape: 'ogive', length: 0.15, aftRadius: 0.025 },
          {
            type: 'bodytube',
            id: 'body',
            length: 0.5,
            outerRadius: 0.025,
            children: [
              {
                type: 'trapezoidfinset',
                id: 'fins',
                finCount: 3,
                rootChord,
                tipChord: 0.05,
                sweep: 0.05,
                height: 0.06,
                thickness: 0.003,
                cant: cantRad,
                position: { method: 'bottom', offset: 0 },
              },
            ],
          },
        ],
      } as ComponentNode,
    ],
  }) as RocketTree;

/** The fin set's span as the report reads it, with the kernel locating it. */
function span(tree: RocketTree): { topX: number; bottomX: number } {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const rocket = {
    componentInfo: (id: string) => JSON.parse(engine.getComponentInfo(handle, id)) as { positionX: number },
  };
  const [fins] = finSetPositions(tree.components[0]!, rocket);
  return fins!;
}

describe('a canted fin set in the report', () => {
  it.each([
    [15, 0.05],
    [15, 0.2],
    [-10, 0.12],
  ])('at %s degrees with a %s m root spans what it spans uncanted', (deg, chord) => {
    const canted = span(design((deg * Math.PI) / 180, chord));
    const straight = span(design(0, chord));
    expect(canted.topX).toBeCloseTo(straight.topX, 9);
    expect(canted.bottomX).toBeCloseTo(straight.bottomX, 9);
  });
});
