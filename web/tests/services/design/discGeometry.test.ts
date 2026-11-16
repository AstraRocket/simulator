import { describe, it, expect } from 'vitest';
import {
  boreAt,
  discDims,
  plateOuter,
  resolveDisc,
  ringBore,
  ringBoreNeedIn,
  tubeRadii,
  type Tube,
} from '../../../src/services/design/discGeometry';
import { withKernelEnds } from '../../../src/services/design/autoRadius';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';

const node = (o: object) => o as unknown as ComponentNode;

describe('discDims', () => {
  const tube: Tube = { outerR: 0.012, innerR: 0.011 };

  it('gives a coupler its bore', () => {
    const d = discDims(node({ type: 'tubecoupler', thickness: 0.001, length: 0.05 }), tube, null, 0);
    expect(d).not.toBeNull();
    expect(d!.innerR).toBeCloseTo(d!.outerR - 0.001, 12);
    expect(d!.length).toBeCloseTo(0.05, 12);
  });

  it('refuses a wall past the radius instead of reporting a solid rod', () => {
    expect(discDims(node({ type: 'tubecoupler', thickness: 0.02, length: 0.05 }), tube, null, 0)).toBeNull();
    expect(discDims(node({ type: 'engineblock', thickness: 0.05 }), tube, null, 0)).toBeNull();
  });

  it('takes a wall exactly equal to the radius as a solid part', () => {
    // ThicknessRingComponent.loadFromPreset gives a 0-bore catalog part a full-radius wall; it flies solid.
    const r = plateOuter(node({ type: 'tubecoupler' }), tube);
    const d = discDims(node({ type: 'tubecoupler', thickness: r }), tube, null, 0);
    expect(d).not.toBeNull();
    expect(d!.innerR).toBe(0);
  });

  it('still accepts a wall a real coupler uses', () => {
    expect(discDims(node({ type: 'tubecoupler', thickness: 0.0005 }), tube, null, 0)).not.toBeNull();
  });

  it('gives a bulkhead no bore, which is what a bulkhead is', () => {
    expect(discDims(node({ type: 'bulkhead' }), tube, null, 0)?.innerR).toBe(0);
  });

  it('bores an automatic ring only for a mount that passes through it', () => {
    const parent = node({
      type: 'bodytube',
      length: 0.3,
      outerRadius: 0.012,
      children: [
        { type: 'centeringring', id: 'r', length: 0.002, position: { method: 'top', offset: 0 } },
        { type: 'innertube', id: 'i', length: 0.05, outerRadius: 0.009, position: { method: 'bottom', offset: 0 } },
      ],
    });
    // The mount sits at the aft end; the ring at the fore end misses it.
    expect(discDims(parent.children![0]!, tube, parent, 0)?.innerR).toBe(0);
    expect(discDims(parent.children![0]!, tube, null, 0)?.innerR).toBe(0);
  });

  it('returns null for a type it does not size', () => {
    expect(discDims(node({ type: 'bodytube' }), tube, null, 0)).toBeNull();
  });
});

describe('tubeRadii', () => {
  it('offers no bore inside a filled body tube', () => {
    expect(tubeRadii(node({ type: 'bodytube', outerRadius: 0.012, thickness: 0.001, filled: true }))).toEqual({
      outerR: 0.012,
      innerR: 0,
    });
  });

  it('reports the bore a tube offers from its own wall', () => {
    const t = tubeRadii(node({ type: 'bodytube', outerRadius: 0.012, thickness: 0.001 }));
    expect(t).toMatchObject({ outerR: 0.012 });
    expect(t!.innerR).toBeCloseTo(0.011, 12);
  });

  it('is null for a component that is not a tube', () => {
    expect(tubeRadii(node({ type: 'bulkhead' }))).toBeNull();
  });
});

describe('a keyless tube wall', () => {
  const tube = (type: string, outerRadius: number) => ({ type, id: type, outerRadius }) as unknown as ComponentNode;

  it.each([
    ['bodytube', KERNEL_DEFAULTS.bodytube.thickness],
    ['innertube', KERNEL_DEFAULTS.innertube.thickness],
    ['tubecoupler', KERNEL_DEFAULTS.tubecoupler.thickness],
  ])('is the kernel default for a %s', (type, wall) => {
    expect(tubeRadii(tube(type, 0.02))!.innerR).toBeCloseTo(0.02 - wall, 12);
    expect(boreAt(tube(type, 0.02), 'fore')).toBeCloseTo(0.02 - wall, 12);
  });
});

describe('boreAt on a filled part', () => {
  it('offers no bore, as tubeRadii says', () => {
    const solid = {
      type: 'bodytube',
      id: 'b',
      outerRadius: 0.02,
      thickness: 0.001,
      filled: true,
    } as unknown as ComponentNode;
    expect(tubeRadii(solid)!.innerR).toBe(0);
    expect(boreAt(solid, 'fore')).toBeNull();
    expect(boreAt(solid, 'aft')).toBeNull();
  });
});

// CenteringRing.getInnerRadius uses unclamped positions: skips when `pos2 < 0 || pos1 > sibling.getLength()`.
describe('ringBore past the parent end', () => {
  const parent = (ringAt: number, mountAt: number) =>
    ({
      type: 'bodytube',
      id: 'b',
      length: 0.1,
      outerRadius: 0.02,
      children: [
        { type: 'centeringring', id: 'r', length: 0.002, position: { method: 'top', offset: ringAt } },
        { type: 'innertube', id: 'i', length: 0.05, outerRadius: 0.009, position: { method: 'top', offset: mountAt } },
      ],
    }) as unknown as ComponentNode;

  it('misses a mount wholly aft of the ring, though both overhang the tube', () => {
    // Ring 105-107 mm, mount 120-170 mm: pos2 = 0.107 - 0.12 < 0.
    const p = parent(0.105, 0.12);
    expect(ringBore(p.children![0]!, p, 0.019, 0)).toBe(0);
  });

  it('takes a mount that overlaps it past the tube end', () => {
    const p = parent(0.105, 0.09);
    expect(ringBore(p.children![0]!, p, 0.019, 0)).toBe(0.009);
  });
  it("takes a keyless mount at InnerTube()'s radius", () => {
    const p = parent(0.02, 0.01);
    delete p.children![1]!['outerRadius'];
    expect(ringBore(p.children![0]!, p, 0.019, 0)).toBe(KERNEL_DEFAULTS.innertube.outerRadius);
  });
});

describe('boreAt on a nose cone', () => {
  const cone = (flipped: boolean) =>
    ({ type: 'nosecone', id: 'n', aftRadius: 0.025, thickness: 0.002, flipped }) as unknown as ComponentNode;

  it('is open at the base, which a flipped cone has at its fore end', () => {
    expect(boreAt(cone(false), 'aft')).toBeCloseTo(0.023, 12);
    expect(boreAt(cone(false), 'fore')).toBeNull();
    expect(boreAt(cone(true), 'fore')).toBeCloseTo(0.023, 12);
    expect(boreAt(cone(true), 'aft')).toBeNull();
  });
});

describe('a centering ring with no bore on record', () => {
  const tree = {
    name: 'R',
    components: [
      {
        type: 'stage',
        id: 'st',
        children: [
          {
            type: 'bodytube',
            id: 'tube',
            length: 0.3,
            outerRadius: 0.025,
            thickness: 0.001,
            children: [
              // First in the list, but aft of the ring: the ring misses it.
              {
                type: 'innertube',
                id: 'aft',
                length: 0.05,
                outerRadius: 0.009,
                position: { method: 'top', offset: 0.2 },
              },
              {
                type: 'innertube',
                id: 'mount',
                length: 0.07,
                outerRadius: 0.015,
                position: { method: 'top', offset: 0 },
              },
              {
                type: 'centeringring',
                id: 'ring',
                length: 0.002,
                outerRadius: 0.024,
                position: { method: 'top', offset: 0 },
              },
            ],
          },
        ],
      },
    ],
  } as unknown as RocketTree;

  it('takes the bore of the mount it actually rings', () => {
    expect(resolveDisc(withKernelEnds(tree), 'ring')!.innerR).toBeCloseTo(0.015, 12);
  });
});

describe('ringBoreNeedIn', () => {
  const tree = (ring: object, mount: object = {}) =>
    ({
      name: 'R',
      components: [
        {
          type: 'stage',
          id: 'st',
          children: [
            {
              type: 'bodytube',
              id: 'tube',
              length: 0.3,
              outerRadius: 0.025,
              thickness: 0.001,
              children: [
                {
                  type: 'innertube',
                  id: 'mount',
                  length: 0.07,
                  outerRadius: 0.009,
                  position: { method: 'top', offset: 0 },
                  ...mount,
                },
                {
                  type: 'centeringring',
                  id: 'ring',
                  length: 0.002,
                  outerRadius: 0.024,
                  position: { method: 'top', offset: 0.01 },
                  ...ring,
                },
              ],
            },
          ],
        },
      ],
    }) as unknown as RocketTree;

  it('gives the hole a stated bore too small for the mount needs', () => {
    expect(ringBoreNeedIn(tree({ innerRadius: 0.0085 }), 'ring')).toBeCloseTo(0.009, 12);
  });

  it('passes a stated bore the mount fits, and one off by unit rounding', () => {
    expect(ringBoreNeedIn(tree({ innerRadius: 0.009 }), 'ring')).toBeNull();
    expect(ringBoreNeedIn(tree({ innerRadius: 0.009 - 1e-6 }), 'ring')).toBeNull();
  });

  it('leaves an automatic bore alone, since it is sized from the mounts', () => {
    expect(ringBoreNeedIn(tree({ innerRadius: 0.001, innerRadiusAuto: true }), 'ring')).toBeNull();
  });

  it('adds an off-axis mount its offset, since the stated hole is centered', () => {
    expect(ringBoreNeedIn(tree({ innerRadius: 0.009 }, { radialPosition: 0.005 }), 'ring')).toBeCloseTo(0.014, 12);
  });

  it('ignores a mount the ring does not overlap', () => {
    const t = tree({ innerRadius: 0.001, position: { method: 'top', offset: 0.2 } });
    expect(ringBoreNeedIn(t, 'ring')).toBeNull();
  });
});
