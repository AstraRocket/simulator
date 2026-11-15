import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../src/engine/openRocketEngine';
import { tubeFinRadius, tubeFinWall } from '../../src/tree/tubefins';
import { kernelGeometry, loadEngine } from '../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});

const BODY_RADIUS = 0.025;
const TUBE_RADIUS = 0.01;

const design = (fins: Partial<ComponentNode>, body: Partial<ComponentNode> = {}) => {
  const tube = {
    id: 'tube',
    type: 'bodytube',
    length: 0.4,
    outerRadius: BODY_RADIUS,
    thickness: 0.003,
    ...body,
    children: [{ id: 'fins', type: 'tubefinset', finCount: 6, length: 0.1, outerRadius: TUBE_RADIUS, ...fins }],
  };
  return {
    name: 'R',
    components: [
      {
        id: 's',
        type: 'stage',
        children: [{ id: 'nose', type: 'nosecone', length: 0.1, aftRadius: BODY_RADIUS, thickness: 0.002 }, tube],
      },
    ],
  } as unknown as RocketTree;
};

// The bore the 3D view draws: the tube's radius less the wall the app reads.
const appBore = (tree: RocketTree): number => {
  const tube = tree.components[0]!.children![1]!;
  const fins = tube.children![0]!;
  const rt = tubeFinRadius(fins, BODY_RADIUS);
  return rt - tubeFinWall(fins, tube, rt);
};

describe("a tube fin's wall", () => {
  it.each([
    ['a stated wall thicker than 45% of the tube', { thickness: 0.009 }, {}],
    ['a stated wall past the tube radius', { thickness: 0.05 }, {}],
    ["no wall of its own on a body tube, which takes the tube's", {}, {}],
    ['no wall of its own on a filled body tube', {}, { filled: true }],
  ] as const)('leaves the bore the kernel flies: %s', (_label, fins, body) => {
    const tree = design(fins, body);
    const kernel = kernelGeometry(engine, tree).get('fins')!;
    expect(appBore(tree)).toBeCloseTo(kernel.innerRadius!, 9);
  });
});
