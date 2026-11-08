// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { overturnedFins } from '../../../src/services/design/requiredComponent';
import { designBlocker, designBlockerText } from '../../../src/services/flight/runnability';
import { syncDerived } from '../../../src/services/design/treeEdit';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { kernelGeometry, loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

// `FinSet.getFinCantYOffset` guards only `dz >= radius`; `dz` < 0 ahead of the midpoint gives NaN (null) fin points.

const R = 0.012;
const CANT = (15 * Math.PI) / 180;

const design = (rootChord: number, cant = CANT, method = 'bottom'): RocketTree =>
  syncDerived({
    name: 'canted',
    components: [
      {
        type: 'stage',
        id: 's',
        children: [
          { type: 'nosecone', id: 'n', length: 0.1, aftRadius: R, thickness: 0.002 },
          {
            type: 'bodytube',
            id: 'b',
            length: 0.4,
            outerRadius: R,
            thickness: 0.0005,
            children: [
              {
                type: 'innertube',
                id: 'mm',
                length: 0.07,
                outerRadius: 0.009,
                thickness: 0.0005,
                motorMount: true,
                position: { method: 'bottom', offset: 0 },
              },
              {
                type: 'trapezoidfinset',
                id: 'fins',
                finCount: 3,
                rootChord,
                tipChord: 0.03,
                height: 0.04,
                sweep: 0.02,
                thickness: 0.002,
                cant,
                position: { method, offset: 0 },
              },
            ],
          },
        ],
      },
    ],
  } as unknown as RocketTree);

const kernelNaN = async (tree: RocketTree): Promise<boolean> => {
  const pts = kernelGeometry(await loadEngine(), tree).get('fins')!.finPoints!;
  return pts.some(([x, y]) => x === null || y === null);
};

describe('a canted fin set whose turned root reaches the body', () => {
  const cases: { label: string; tree: RocketTree }[] = [
    { label: '100 mm root at 15 deg', tree: design(0.1) },
    { label: '90 mm root at 15 deg', tree: design(0.09) },
    { label: '100 mm root at 13.5 deg', tree: design(0.1, (13.5 * Math.PI) / 180) },
    { label: '100 mm root at 14.5 deg', tree: design(0.1, (14.5 * Math.PI) / 180) },
    { label: '100 mm root at -15 deg', tree: design(0.1, -CANT) },
    { label: '100 mm root at 15 deg, top of the tube', tree: design(0.1, CANT, 'top') },
  ];

  for (const { label, tree } of cases) {
    it(
      `is refused exactly when the kernel flies NaN points: ${label}`,
      async () => {
        const nan = await kernelNaN(tree);
        expect(overturnedFins(tree).map((f) => f.id)).toEqual(nan ? ['fins'] : []);
        expect(designBlocker(tree)?.kind ?? null).toBe(nan ? 'finCant' : null);
      },
      KERNEL_TEST_TIMEOUT_MS,
    );
  }

  it(
    'covers both outcomes, so the cases above test the boundary',
    async () => {
      const outcomes = await Promise.all(cases.map(({ tree }) => kernelNaN(tree)));
      expect(outcomes).toContain(true);
      expect(outcomes).toContain(false);
    },
    KERNEL_TEST_TIMEOUT_MS,
  );

  it('names the fin set in the refusal', () => {
    const b = designBlocker(design(0.1))!;
    const t = (key: string, vars?: Record<string, unknown>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
    expect(designBlockerText(b, t)).toContain('sim.finCant');
    expect(designBlockerText(b, t)).toContain('part.trapezoidfinset');
  });
});
