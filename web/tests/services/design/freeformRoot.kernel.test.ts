import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { designBlocker } from '../../../src/services/flight/runnability';
import { kernelGeometry, loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});

const design = (points: [number, number][]) =>
  ({
    name: 'R',
    components: [
      {
        id: 's',
        type: 'stage',
        children: [
          { id: 'n', type: 'nosecone', length: 0.1, aftRadius: 0.02, thickness: 0.002 },
          {
            id: 'b',
            type: 'bodytube',
            length: 0.3,
            outerRadius: 0.02,
            thickness: 0.001,
            motorMount: true,
            children: [{ id: 'f', type: 'freeformfinset', name: 'Fins', finCount: 3, thickness: 0.003, points }],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

describe('a freeform fin set whose last point is not behind its first', () => {
  it.each([
    [
      'level with it',
      [
        [0, 0],
        [0.03, 0.04],
        [0, 0],
      ],
    ],
    [
      'ahead of it',
      [
        [0, 0],
        [0.03, 0.04],
        [-0.02, 0],
      ],
    ],
  ] as [string, [number, number][]][])(
    'is refused before a run, since the kernel builds it with no length (%s)',
    (_label, points) => {
      const tree = design(points);
      // FreeformFinSet flies last.x - first.x as stored, and builds the design with it.
      expect(kernelGeometry(engine, tree).get('f')!.length).toBeLessThanOrEqual(0);
      expect(designBlocker(tree)).toEqual({
        kind: 'badGeometry',
        bad: [{ id: 'f', type: 'freeformfinset', name: 'Fins', field: 'length' }],
      });
    },
  );

  it('lets an outline with a length fly', () => {
    const tree = design([
      [0, 0],
      [0.03, 0.04],
      [0.06, 0],
    ]);
    expect(kernelGeometry(engine, tree).get('f')!.length).toBeGreaterThan(0);
    expect(designBlocker(tree)).toBeNull();
  });
});
