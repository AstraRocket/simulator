import { beforeAll, describe, expect, it, vi } from 'vitest';
import { __setEngineForTests, type RocketTree } from '../../../src/engine/openRocketEngine';
import { buildForImport } from '../../../src/services/files/loadOrk';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { noteText } from '../../testing/importNotes';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  __setEngineForTests(await import('../../../src/engine/vendor/openrocket-engine.mjs'));
});

const tree = (fin: Record<string, unknown>): RocketTree =>
  ({
    name: 'Imported',
    components: [
      {
        id: 'stage1',
        type: 'stage',
        children: [
          { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.013, thickness: 0.001, shape: 'ogive' },
          {
            id: 'tube',
            type: 'bodytube',
            length: 0.2,
            outerRadius: 0.013,
            thickness: 0.0005,
            children: [{ id: 'fins', type: 'freeformfinset', name: 'Aft fins', finCount: 3, thickness: 0.003, ...fin }],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

const VALID = [
  [0, 0],
  [0.02, 0.05],
  [0.05, 0.05],
  [0.06, 0],
];
const BOWTIE = [
  [0, 0],
  [0.05, 0.05],
  [0, 0.05],
  [0.06, 0],
];

describe('buildForImport', () => {
  it('builds a good design with nothing to report', () => {
    const built = buildForImport(tree({ points: VALID }));
    expect(built.unbuildable).toBeUndefined();
    expect(built.design.staticInfo().length).toBeCloseTo(0.3, 9);
  });

  it('still opens a design whose fin outline the kernel refuses, and says why', () => {
    const t = tree({ points: BOWTIE });
    const built = buildForImport(t);
    expect(noteText(built.unbuildable!)).toMatch(/Aft fins/);
    expect(noteText(built.unbuildable!)).toMatch(/crosses or touches itself/);
    expect(noteText(built.unbuildable!)).toMatch(/open so it can be fixed/);
    // The handle is built from a repaired copy; the tree keeps the file's outline.
    type Node = { type: string; children?: Node[]; points?: number[][] };
    const stage = (t.components as unknown as Node[])[0]!;
    expect(stage.children![1]!.children![0]!.points).toEqual(BOWTIE);
  });

  it('rethrows when the failure is not an outline the repair reaches', () => {
    const t = tree({ points: VALID });
    (t.components as unknown as { type: string }[])[0]!.type = 'notAComponent';
    expect(() => buildForImport(t)).toThrow(/notAComponent/);
  });
});
