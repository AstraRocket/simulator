// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { axialFrames } from '../../src/tree/axialRebase';
import { resolveFilePositions } from '../../src/tree/position';
import { syncDerived } from '../../src/services/design/treeEdit';
import type { ComponentNode, RocketTree } from '../../src/engine/openRocketEngine';
import { kernelGeometry, loadEngine, walkTree, type KernelGeometry } from '../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

// The Java source is ambiguous; the kernel's stations say a pod's body parts stack whatever their method.

const tube = (id: string, length: number, position?: ComponentNode['position']): ComponentNode => ({
  type: 'bodytube',
  id,
  length,
  outerRadius: 0.012,
  thickness: 0.0005,
  ...(position ? { position } : {}),
});

const POD_TUBES = [
  tube('pa', 0.1),
  tube('pt', 0.06, { method: 'top', offset: 0.05 }),
  tube('pm', 0.04, { method: 'middle', offset: 0.01 }),
  tube('pbm', 0.05, { method: 'bottom', offset: 0.02 }),
];

const tree: RocketTree = syncDerived({
  name: 'pod layout',
  components: [
    {
      type: 'stage',
      id: 's',
      children: [
        { type: 'nosecone', id: 'n', length: 0.12, aftRadius: 0.03, thickness: 0.002 },
        {
          type: 'bodytube',
          id: 'b',
          length: 0.6,
          outerRadius: 0.03,
          thickness: 0.001,
          children: [
            {
              type: 'podset',
              id: 'pod',
              instanceCount: 2,
              radiusOffset: 0.03,
              position: { method: 'top', offset: 0.1 },
              children: POD_TUBES,
            },
          ],
        },
      ],
    },
  ],
});

let kernel: Map<string, KernelGeometry> | undefined;
const kernelOf = async () => (kernel ??= kernelGeometry(await loadEngine(), tree));

describe('a pod set body part not positioned AFTER (D58)', () => {
  it(
    'places the pod itself where the kernel does',
    async () => {
      const k = await kernelOf();
      expect(axialFrames(tree).get('pod')!.start).toBeCloseTo(k.get('pod')!.positionX!, 9);
    },
    KERNEL_TEST_TIMEOUT_MS,
  );

  it(
    'stacks the pod body parts as axialFrames does',
    async () => {
      const k = await kernelOf();
      const frames = axialFrames(tree);
      for (const c of POD_TUBES) expect(frames.get(c.id!)!.start, c.id).toBeCloseTo(k.get(c.id!)!.positionX!, 9);
    },
    KERNEL_TEST_TIMEOUT_MS,
  );

  it(
    'resolves an AFTER part behind a TOP-offset one where the kernel puts it',
    async () => {
      // The kernel stacks the first tube, so the AFTER one starts at its aft end, not 0.05 further back.
      const filed: RocketTree = {
        name: 'pod after',
        components: [
          {
            type: 'stage',
            id: 's',
            children: [
              { type: 'nosecone', id: 'n', length: 0.12, aftRadius: 0.03, thickness: 0.002 },
              {
                type: 'bodytube',
                id: 'b',
                length: 0.6,
                outerRadius: 0.03,
                thickness: 0.001,
                children: [
                  {
                    type: 'podset',
                    id: 'pod',
                    instanceCount: 2,
                    radiusOffset: 0.03,
                    position: { method: 'top', offset: 0.1 },
                    children: [
                      tube('pt', 0.06, { method: 'top', offset: 0.05 }),
                      tube('paf', 0.04, { method: 'after', offset: 0 }),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const k = kernelGeometry(await loadEngine(), filed);
      const resolved = resolveFilePositions(filed);
      const pod = axialFrames(resolved).get('pod')!;
      const paf = walkTree(resolved).find((v) => v.id === 'paf')!.node;
      expect(paf.position).toMatchObject({ method: 'top' });
      expect(pod.start + paf.position!.offset).toBeCloseTo(k.get('paf')!.positionX!, 9);
      expect(axialFrames(resolved).get('paf')!.start).toBeCloseTo(k.get('paf')!.positionX!, 9);
    },
    KERNEL_TEST_TIMEOUT_MS,
  );
});
