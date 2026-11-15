import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { buildAftScene } from '../../../src/components/canvas/aftScene';
import { syncDerived } from '../../../src/services/design/treeEdit';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { kernelGeometry, loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const t = ((k: string) => k) as unknown as TFunction;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});

// Three motor tubes through one automatic ring: desktop and every export cut one hole per tube.
const tree = syncDerived({
  name: 'R',
  components: [
    {
      id: 's',
      type: 'stage',
      children: [
        { id: 'n', type: 'nosecone', length: 0.2, aftRadius: 0.04, thickness: 0.002 },
        {
          id: 'b',
          type: 'bodytube',
          length: 0.5,
          outerRadius: 0.04,
          thickness: 0.001,
          children: [
            {
              id: 'mm',
              type: 'innertube',
              length: 0.1,
              outerRadius: 0.009,
              thickness: 0.0005,
              cluster: '3-ring',
              motorMount: true,
              position: { method: 'bottom', offset: 0 },
            },
            {
              id: 'cr',
              type: 'centeringring',
              length: 0.005,
              outerRadiusAuto: true,
              innerRadiusAuto: true,
              position: { method: 'bottom', offset: -0.01 },
            },
          ],
        },
      ],
    },
  ],
} as unknown as RocketTree);

describe('an automatic centering ring around a motor cluster, from behind', () => {
  it('shows one hole per tube where the kernel places it, and no centered bore', () => {
    const tube = kernelGeometry(engine, tree).get('mm')!;
    const places = tube.clusterPoints!;
    expect(places).toHaveLength(3);

    const circles = buildAftScene(tree.components, undefined, t).inner.filter(
      (s) => s.kind === 'circle' && s.key.startsWith('cr:'),
    ) as { y: number; z: number; r: number }[];
    // The outer edge, then one per hole.
    expect(circles).toHaveLength(1 + places.length);
    const holes = circles.slice(1);
    for (const [y, z] of places) {
      // The aft view's frame is the kernel's turned +π/2: (y, z) is drawn at (-z, y).
      const hit = holes.find((h) => Math.abs(h.y + z) < 1e-9 && Math.abs(h.z - y) < 1e-9);
      expect(hit, `a hole at kernel (${y}, ${z})`).toBeDefined();
      expect(hit!.r).toBeCloseTo(tube.outerRadius!, 9);
    }
    expect(holes.some((h) => Math.hypot(h.y, h.z) < 1e-9)).toBe(false);
  });
});
