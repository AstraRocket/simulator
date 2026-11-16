import { describe, expect, it } from 'vitest';
import { DEFAULT_PINS, ejectionBay, parseShearPins, PIN_STRENGTH_N } from '../../../src/services/flight/ejectionBay';
import { uiToSi } from '../../../src/prefs/units';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';

const LBF = uiToSi('force', 'lbf', 1);
const at = (offset: number) => ({ method: 'top', offset });

function rocket(inside: ComponentNode[] = [], noseShoulder = 0.05): RocketTree {
  return {
    components: [
      {
        id: 'st',
        type: 'stage',
        children: [
          {
            id: 'nose',
            type: 'nosecone',
            length: 0.2,
            aftRadius: 0.04,
            shoulderLength: noseShoulder,
            shoulderRadius: 0.039,
          },
          {
            id: 'tube',
            type: 'bodytube',
            name: 'Upper',
            length: 0.6,
            outerRadius: 0.04,
            thickness: 0.001,
            children: [{ id: 'chute', type: 'parachute', length: 0.05, position: at(0.1) }, ...inside],
          },
        ],
      },
    ],
  } as unknown as RocketTree;
}

function held(inside: ComponentNode[] = [], holderToo: ComponentNode[] = []): RocketTree {
  const tree = rocket(inside);
  const tube = (tree.components[0]!.children ?? [])[1]!;
  const [chute, ...rest] = tube.children ?? [];
  tube.children = [
    {
      id: 'holder',
      type: 'innertube',
      length: 0.2,
      outerRadius: 0.035,
      position: at(0.05),
      children: [{ ...chute!, position: at(0.05) }, ...holderToo],
    } as never,
    ...rest,
  ];
  return tree;
}

describe('a recovery device kept in an inner tube', () => {
  it('is in the body tube around the inner tube, which does not close the bay', () => {
    const bay = ejectionBay(held([{ id: 'bh', type: 'bulkhead', length: 0.01, position: at(0.3) } as never]), 'chute')!;
    expect(bay.tubeId).toBe('tube');
    expect(bay.boreM).toBeCloseTo(0.078, 12);
    expect(bay.lengthM).toBeCloseTo(0.25, 12);
  });

  it('reads closures and pins kept inside the inner tube too', () => {
    const bay = ejectionBay(
      held(
        [],
        [
          { id: 'bh', type: 'bulkhead', length: 0.01, position: at(0.15) } as never,
          { id: 'p', type: 'masscomponent', name: '4x 4-40', position: at(0) } as never,
        ],
      ),
      'chute',
    )!;
    // Holder at 25 cm from the tip, so its bulkhead starts at 40 cm; the shoulder ends at 25.
    expect(bay.lengthM).toBeCloseTo(0.15, 12);
    expect(bay.pins).toMatchObject({ count: 4, size: '4-40', from: '4x 4-40' });
  });

  it('has no bay when no body tube is above it', () => {
    const tree = rocket();
    const stage = tree.components[0]!;
    stage.children = [
      ...(stage.children ?? []),
      {
        id: 'pod',
        type: 'innertube',
        length: 0.2,
        children: [{ id: 'loose', type: 'streamer', length: 0.05 }],
      } as never,
    ];
    expect(ejectionBay(tree, 'loose')).toBeNull();
  });
});

describe("a recovery device's bay", () => {
  it('runs from the nose shoulder to the first bulkhead aft of the device', () => {
    const bay = ejectionBay(
      rocket([{ id: 'bh', type: 'bulkhead', length: 0.01, position: at(0.3) } as never]),
      'chute',
    )!;
    expect(bay.tubeName).toBe('Upper');
    expect(bay.boreM).toBeCloseTo(0.078, 12);
    // Shoulder ends 25 cm from the tip; the bulkhead starts at 50 cm.
    expect(bay.lengthM).toBeCloseTo(0.25, 12);
    expect(bay.wholeTube).toBe(false);
  });

  it('ignores a closure on the far side of another one, and parts that do not close the bore', () => {
    const bay = ejectionBay(
      rocket([
        { id: 'bh', type: 'bulkhead', length: 0.01, position: at(0.3) } as never,
        { id: 'ring', type: 'centeringring', length: 0.005, position: at(0.5) } as never,
        { id: 'cord', type: 'shockcord', length: 0.05, position: at(0.2) } as never,
      ]),
      'chute',
    )!;
    expect(bay.lengthM).toBeCloseTo(0.25, 12);
  });

  it('is the whole tube when nothing closes it, and says so', () => {
    const bay = ejectionBay(rocket([], 0), 'chute')!;
    expect(bay.lengthM).toBeCloseTo(0.6, 12);
    expect(bay.wholeTube).toBe(true);
  });

  it('reads the bore as the kernel builds the tube', () => {
    const tube = (t: RocketTree) => (t.components[0]!.children ?? [])[1] as Record<string, unknown>;
    const keyless = rocket();
    delete tube(keyless)['thickness'];
    expect(ejectionBay(keyless, 'chute')!.boreM).toBeCloseTo(2 * (0.04 - KERNEL_DEFAULTS.bodytube.thickness), 12);
    const filled = rocket();
    tube(filled)['filled'] = true;
    expect(ejectionBay(filled, 'chute')!.boreM).toBe(0);
  });

  it('is not closed by a shoulder with no radius', () => {
    const tree = rocket();
    delete ((tree.components[0]!.children ?? [])[0] as Record<string, unknown>)['shoulderRadius'];
    expect(ejectionBay(tree, 'chute')!.wholeTube).toBe(true);
  });

  // A flipped nose cone's shoulder is on its fore end (NoseCone.java).
  it("takes a flipped nose cone's shoulder on the tube in front of it, not the one behind", () => {
    const tree = rocket();
    const parts = tree.components[0]!.children!;
    const nose = { ...parts[0]!, flipped: true };
    expect(
      ejectionBay({ components: [{ ...tree.components[0]!, children: [nose, parts[1]!] }] }, 'chute')!.wholeTube,
    ).toBe(true);
    const tail = { ...nose, id: 'tail' };
    const bay = ejectionBay(
      { components: [{ ...tree.components[0]!, children: [{ ...parts[0]!, shoulderLength: 0 }, parts[1]!, tail] }] },
      'chute',
    )!;
    // The tube runs 20 to 80 cm from the tip; the tail cone's 5 cm shoulder reaches forward to 75.
    expect(bay.lengthM).toBeCloseTo(0.55, 12);
  });

  it('is closed by the shoulder of a nose cone in the same pod', () => {
    const pod = rocket().components[0]!.children!;
    const tree = {
      components: [
        {
          id: 'st',
          type: 'stage',
          children: [
            {
              id: 'main',
              type: 'bodytube',
              length: 1,
              outerRadius: 0.05,
              thickness: 0.001,
              children: [
                { id: 'pods', type: 'podset', instanceCount: 2, radiusOffset: 0.1, position: at(0), children: pod },
              ],
            },
          ],
        },
      ],
    } as unknown as RocketTree;
    expect(ejectionBay(tree, 'chute')!.lengthM).toBeCloseTo(0.55, 12);
  });

  it('is null for a device that is not in a body tube', () => {
    expect(ejectionBay(rocket(), 'nose')).toBeNull();
    expect(ejectionBay(rocket(), 'missing')).toBeNull();
  });

  it('assumes three #2-56 pins with no pin object, and reads one when there is', () => {
    expect(ejectionBay(rocket(), 'chute')!.pins).toEqual({
      ...DEFAULT_PINS,
      forceN: PIN_STRENGTH_N['2-56'],
      from: null,
    });
    const pinned = ejectionBay(
      rocket([{ id: 'p', type: 'masscomponent', name: 'Shear pins 4x 4-40', position: at(0) } as never]),
      'chute',
    )!;
    expect(pinned.pins).toMatchObject({ count: 4, size: '4-40', from: 'Shear pins 4x 4-40' });
  });
});

describe('shear pins from a name', () => {
  it.each([
    ['3x 2-56', 3, '2-56'],
    ['shear pins 4-40 x4', 4, '4-40'],
    ['2 pins #4-40', 2, '4-40'],
    ['#6-32 shear pin', 3, '6-32'],
    ['shear pins', 3, '2-56'],
  ])('reads %s', (name, count, size) => {
    const got = parseShearPins(name)!;
    expect(got.count).toBe(count);
    expect(got.size).toBe(size);
    expect(got.forceN).toBeCloseTo(PIN_STRENGTH_N[size as keyof typeof PIN_STRENGTH_N], 9);
  });

  it('takes a strength from the name over the typical one, in lbf or N', () => {
    expect(parseShearPins('4 × 6-32 @ 95 lbf')).toMatchObject({ count: 4, size: null });
    expect(parseShearPins('4 × 6-32 @ 95 lbf')!.forceN).toBeCloseTo(95 * LBF, 9);
    expect(parseShearPins('3x 2-56 @150N')!.forceN).toBeCloseTo(150, 9);
  });

  it('reads friction fit and a count of 0 as no pins', () => {
    expect(parseShearPins('Friction fit')!.count).toBe(0);
    expect(parseShearPins('0 shear pins')!.count).toBe(0);
  });

  it('is null for a mass object about something else', () => {
    expect(parseShearPins('Altimeter')).toBeNull();
    expect(parseShearPins('Nose weight 12g')).toBeNull();
  });
});
