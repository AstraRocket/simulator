import { describe, it, expect } from 'vitest';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { fitContextFor } from '../../../src/services/parts/componentFit';
import { fitRuleFor } from '../../../src/services/parts/componentFilter';

// Values are radii, as the tree stores them.
const makeTree = (): RocketTree =>
  ({
    components: [
      {
        id: 's1',
        type: 'stage',
        children: [
          { id: 'nose', type: 'nosecone', aftRadius: 0.0273, length: 0.15 },
          {
            id: 'tube',
            type: 'bodytube',
            outerRadius: 0.0273,
            thickness: 0.0016,
            length: 0.4,
            children: [
              { id: 'mount', type: 'innertube', outerRadius: 0.0145, length: 0.1 },
              { id: 'ring', type: 'centeringring', outerRadius: 0.0257, innerRadius: 0.0145, length: 0.003 },
              { id: 'coupler', type: 'tubecoupler', outerRadius: 0.0255, thickness: 0.0016, length: 0.08 },
              { id: 'chute', type: 'parachute', diameter: 0.45 },
            ],
          },
        ],
      },
      {
        id: 's2',
        type: 'stage',
        children: [{ id: 'booster', type: 'bodytube', outerRadius: 0.0332, thickness: 0.0016, length: 0.3 }],
      },
    ],
  }) as unknown as RocketTree;

describe('fitContextFor', () => {
  const tree = makeTree();

  it('derives the enclosing bore from the wall, which is not a stored field', () => {
    expect(fitContextFor(tree, 'coupler')!.parentInner).toBeCloseTo(0.0514, 6);
    expect(fitContextFor(tree, 'ring')!.parentInner).toBeCloseTo(0.0514, 6);
  });

  it('finds the mount a centering ring has to clear beside it, not under it', () => {
    expect(fitContextFor(tree, 'ring')!.mountOuter).toBeCloseTo(0.029, 6);
  });

  it('matches each airframe end against the part beside it, across stages', () => {
    const tube = fitContextFor(tree, 'tube')!;
    expect(tube.foreMatch).toBeCloseTo(0.0546, 9);
    expect(tube.aftMatch).toBeCloseTo(0.0664, 9);
    expect(fitContextFor(tree, 'nose')!.aftMatch).toBeCloseTo(0.0546, 9);
    expect(fitContextFor(tree, 'nose')!.foreMatch).toBeUndefined();
  });

  it('gives a part on a bare stage no enclosing geometry, and says so', () => {
    const ctx = fitContextFor(tree, 'booster')!;
    expect(ctx.parentInner).toBeUndefined();
    expect(ctx.foreMatch).toBeCloseTo(0.0546, 9);
    expect(ctx.aftMatch).toBeUndefined();
  });

  it('returns nothing for an id that is not in the tree', () => {
    expect(fitContextFor(tree, 'nope')).toBeUndefined();
    expect(fitContextFor(tree, null)).toBeUndefined();
  });

  describe('feeding the filter', () => {
    it('lets a coupler be ranked against the bore it slides into', () => {
      expect(fitRuleFor('tubecoupler', fitContextFor(tree, 'coupler'))).toEqual({
        kind: 'inside',
        target: expect.closeTo(0.0514, 6) as unknown as number,
      });
    });

    it('lets a body tube be ranked against the airframe it continues', () => {
      const rule = fitRuleFor('bodytube', fitContextFor(tree, 'booster'));
      expect(rule).toEqual({ kind: 'ends', fore: expect.closeTo(0.0546, 9) as unknown as number, aft: null });
    });

    it('still abstains where the geometry cannot answer', () => {
      expect(fitRuleFor('parachute', fitContextFor(tree, 'chute'))).toBeNull();
    });
  });

  it('ignores a wall that cannot be a wall', () => {
    const bad = {
      components: [
        {
          id: 's1',
          type: 'stage',
          children: [
            {
              id: 'solid',
              type: 'bodytube',
              outerRadius: 0.0273,
              thickness: 0.0273,
              children: [{ id: 'x', type: 'tubecoupler' }],
            },
          ],
        },
      ],
    } as unknown as RocketTree;
    expect(fitContextFor(bad, 'x')!.parentInner).toBeUndefined();
    expect(fitRuleFor('tubecoupler', fitContextFor(bad, 'x'))).toBeNull();
  });
});
describe('fitContextFor on a keyless wall', () => {
  it('derives the bore from the kernel default wall', () => {
    const tree = {
      components: [
        {
          id: 's1',
          type: 'stage',
          children: [
            { id: 'tube', type: 'bodytube', outerRadius: 0.0273, children: [{ id: 'x', type: 'tubecoupler' }] },
          ],
        },
      ],
    } as unknown as RocketTree;
    expect(fitContextFor(tree, 'x')!.parentInner).toBeCloseTo(2 * (0.0273 - KERNEL_DEFAULTS.bodytube.thickness), 9);
  });
  const inside = (tube: Record<string, unknown>) =>
    fitContextFor(
      {
        components: [
          {
            id: 's1',
            type: 'stage',
            children: [{ id: 'tube', ...tube, children: [{ id: 'x', type: 'tubecoupler' }] }],
          },
        ],
      } as unknown as RocketTree,
      'x',
    )!.parentInner;

  it('offers no bore inside a filled body tube', () => {
    expect(inside({ type: 'bodytube', outerRadius: 0.0273, thickness: 0.001, filled: true })).toBeUndefined();
  });

  it('reads a keyless radius as the kernel default', () => {
    expect(inside({ type: 'bodytube', thickness: 0.001 })).toBeCloseTo(
      2 * (KERNEL_DEFAULTS.bodytube.outerRadius - 0.001),
      9,
    );
  });
});
