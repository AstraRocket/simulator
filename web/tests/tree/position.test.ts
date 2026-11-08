import { describe, it, expect } from 'vitest';
import type { ComponentNode, RocketTree } from '../../src/engine/openRocketEngine';
import {
  axialLength,
  freeformPoints,
  freeformRootChord,
  normalizeFreeformPoints,
  startFromPosition,
  resolveFilePositions,
} from '../../src/tree/position';
import { KERNEL_DEFAULTS } from '../../src/tree/kernelDefaults';
import { axialFrameOf } from '../../src/tree/axialRebase';

describe('axialLength', () => {
  it('uses the root chord from the first to the last point for a freeform fin set', () => {
    const fin = {
      type: 'freeformfinset',
      points: [
        [0, 0],
        [0.03, 0.02],
        [0.06, 0],
      ],
    } as unknown as ComponentNode;
    expect(axialLength(fin)).toBeCloseTo(0.06);
  });

  it('falls back to a default span for an empty freeform fin set', () => {
    expect(axialLength({ type: 'freeformfinset' })).toBeCloseTo(0.05);
  });

  it('uses root chord for trapezoid / elliptical fins', () => {
    expect(axialLength({ type: 'trapezoidfinset', rootChord: 0.07 })).toBeCloseTo(0.07);
    expect(axialLength({ type: 'ellipticalfinset' })).toBeCloseTo(0.05);
  });

  it('uses length, then a default, for other parts', () => {
    expect(axialLength({ type: 'bodytube', length: 0.1 })).toBeCloseTo(0.1);
    // orkImport reads <packedlength> into `length`; there is no `packedLength` key.
    expect(axialLength({ type: 'parachute', length: 0.3 })).toBeCloseTo(0.3);
    expect(axialLength({ type: 'bulkhead' })).toBeCloseTo(KERNEL_DEFAULTS.bulkhead.length);
    expect(axialLength({ type: 'bulkhead' })).toBeCloseTo(0.002);
    expect(axialLength({ type: 'centeringring' })).toBeCloseTo(0.002);
    expect(axialLength({ type: 'engineblock' })).toBeCloseTo(0.005);
    expect(axialLength({ type: 'innertube' })).toBeCloseTo(0.07);
    expect(axialLength({ type: 'tubecoupler' })).toBeCloseTo(KERNEL_DEFAULTS.tubecoupler.length);
    expect(axialLength({ type: 'launchlug' })).toBeCloseTo(KERNEL_DEFAULTS.launchlug.length);
    expect(axialLength({ type: 'masscomponent' })).toBeCloseTo(KERNEL_DEFAULTS.masscomponent.length);
    expect(axialLength({ type: 'tubefinset' })).toBeCloseTo(0.1);
    expect(axialLength({ type: 'parachute' })).toBeCloseTo(0.025);
    expect(axialLength({ type: 'streamer' })).toBeCloseTo(0.025);
    expect(axialLength({ type: 'shockcord' })).toBeCloseTo(0.025);
    // No factory default: RocketComponent.length is 0.
    expect(axialLength({ type: 'railbutton' })).toBe(0);
  });

  it('uses the chain length for an assembly', () => {
    const podset = { type: 'podset', children: [{ type: 'bodytube', length: 0.08 }] } as ComponentNode;
    expect(axialLength(podset)).toBeCloseTo(0.08);
  });
});

describe('startFromPosition', () => {
  const pLen = 0.2,
    cLen = 0.05;
  it('top is the offset itself', () => {
    expect(startFromPosition({ method: 'top', offset: 0.02 }, cLen, pLen, 0.3)).toBeCloseTo(0.02);
  });
  // RocketComponent.setAxialOffset: an ABSOLUTE offset less the parent's first location.
  it('absolute is measured from the nose tip, so the parent start comes off it', () => {
    expect(startFromPosition({ method: 'absolute', offset: 0.32 }, cLen, pLen, 0.3)).toBeCloseTo(0.02);
    expect(startFromPosition({ method: 'absolute', offset: 0.02 }, cLen, pLen, 0)).toBeCloseTo(0.02);
  });
  it('middle centers the child then adds the offset', () => {
    expect(startFromPosition({ method: 'middle', offset: 0 }, cLen, pLen, 0.3)).toBeCloseTo(0.075);
  });
  it('bottom aligns the trailing edges then adds the offset', () => {
    expect(startFromPosition({ method: 'bottom', offset: 0 }, cLen, pLen, 0.3)).toBeCloseTo(0.15);
  });
});

describe('resolveFilePositions', () => {
  it('keeps an absolute child as the file wrote it, measured from the nose tip', () => {
    const tree: RocketTree = {
      components: [
        {
          id: 's1',
          type: 'stage',
          children: [
            { id: 'nc', type: 'nosecone', length: 0.1 },
            {
              id: 'bt',
              type: 'bodytube',
              length: 0.2,
              children: [{ id: 'it', type: 'innertube', length: 0.05, position: { method: 'absolute', offset: 0.15 } }],
            },
          ],
        },
      ],
    };
    const out = resolveFilePositions(tree);
    expect(out).toBe(tree);
    expect(axialFrameOf(out, 'it')!.start).toBeCloseTo(0.15, 12);
  });

  it('lays out a member with no length at the kernel length for its type', () => {
    const tree: RocketTree = {
      components: [
        {
          id: 's1',
          type: 'stage',
          children: [
            { id: 'nc', type: 'nosecone' },
            {
              id: 'bt',
              type: 'bodytube',
              length: 0.2,
              children: [{ id: 'it', type: 'innertube', length: 0.05, position: { method: 'absolute', offset: 0.15 } }],
            },
          ],
        },
      ],
    };
    expect(axialFrameOf(tree, 'bt')!.start).toBeCloseTo(KERNEL_DEFAULTS.nosecone.length, 12);
    expect(axialFrameOf(tree, 'it')!.start).toBeCloseTo(0.15, 12);
  });

  it('returns the same tree object when there is nothing to resolve', () => {
    const tree: RocketTree = {
      components: [
        {
          id: 's1',
          type: 'stage',
          children: [
            {
              id: 'bt',
              type: 'bodytube',
              length: 0.2,
              children: [{ id: 'it', type: 'innertube', length: 0.05, position: { method: 'top', offset: 0.02 } }],
            },
          ],
        },
      ],
    };
    expect(resolveFilePositions(tree)).toBe(tree);
  });

  it('walks an off-axis assembly with its OWN length and start, not zero and the chain total', () => {
    const tree: RocketTree = {
      components: [
        {
          type: 'stage',
          id: 's',
          children: [
            { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.012 },
            { type: 'bodytube', id: 'b', length: 0.4, outerRadius: 0.012 },
            {
              type: 'podset',
              id: 'p',
              radiusOffset: 0.03,
              position: { method: 'top', offset: 0.1 },
              children: [
                { type: 'bodytube', id: 'pb', length: 0.2, outerRadius: 0.008 },
                {
                  type: 'masscomponent',
                  id: 'pm',
                  length: 0.02,
                  position: { method: 'absolute', offset: 0.22 },
                },
                { type: 'masscomponent', id: 'pa', length: 0.01, position: { method: 'after', offset: 0 } },
              ],
            },
          ],
        },
      ],
    } as unknown as RocketTree;

    const pod = resolveFilePositions(tree).components[0]!.children![2]!;
    const [, mass, after] = pod.children!;
    // MassObject overrides isAfter() to false, so `after` is the pod's aft end.
    expect(mass!.position).toEqual({ method: 'absolute', offset: 0.22 });
    expect(after!.position!.method).toBe('top');
    expect(after!.position!.offset).toBeCloseTo(0.2, 12);
    expect(axialFrameOf(tree, 'pm')!.start).toBeCloseTo(0.22, 12);
  });

  it('gives a middle-positioned child inside a pod a station inside the pod', () => {
    // With parent length 0, `middle` would resolve to -childLen/2.
    const tree: RocketTree = {
      components: [
        {
          type: 'stage',
          id: 's',
          children: [
            { type: 'bodytube', id: 'b', length: 0.5, outerRadius: 0.012 },
            {
              type: 'parallelstage',
              id: 'ps',
              radiusOffset: 0.03,
              children: [
                { type: 'bodytube', id: 'pb', length: 0.3, outerRadius: 0.01 },
                { type: 'masscomponent', id: 'm1', length: 0.02, position: { method: 'middle', offset: 0 } },
                { type: 'masscomponent', id: 'm2', length: 0.02, position: { method: 'after', offset: 0 } },
              ],
            },
          ],
        },
      ],
    } as unknown as RocketTree;

    const ps = resolveFilePositions(tree).components[0]!.children![1]!;
    expect(ps.children![2]!.position!.offset).toBeCloseTo(0.3);
  });
});

describe('freeformRootChord', () => {
  // FreeformFinSet.length = last.x - first.x.
  it('is the span between the first and last points, not the aftmost point', () => {
    const overhanging: [number, number][] = [
      [0, 0],
      [0.04, 0.05],
      [0.09, 0.05],
      [0.06, 0],
    ];
    expect(freeformRootChord(overhanging)).toBeCloseTo(0.06, 9);
    expect(Math.max(...overhanging.map((p) => p[0]))).toBeCloseTo(0.09, 9);
  });

  it('agrees with Math.max for an ordinary fin', () => {
    const plain: [number, number][] = [
      [0, 0],
      [0.02, 0.04],
      [0.05, 0.04],
      [0.07, 0],
    ];
    expect(freeformRootChord(plain)).toBeCloseTo(Math.max(...plain.map((p) => p[0])), 9);
  });

  it('falls back rather than returning a zero or negative chord', () => {
    expect(freeformRootChord(undefined)).toBe(0.05);
    expect(freeformRootChord([])).toBe(0.05);
    expect(freeformRootChord([[0.1, 0] as [number, number], [0, 0] as [number, number]])).toBe(0.05);
    expect(freeformRootChord([[Number.NaN, 0] as [number, number], [0.1, 0] as [number, number]])).toBe(0.05);
  });

  it('is what axialLength uses, so the schematic and the report agree', () => {
    const fin = {
      type: 'freeformfinset',
      points: [
        [0, 0],
        [0.04, 0.05],
        [0.09, 0.05],
        [0.06, 0],
      ],
    } as unknown as ComponentNode;
    expect(axialLength(fin)).toBeCloseTo(freeformRootChord(fin['points'] as [number, number][]), 9);
  });
});

// `FreeformFinSet.setPoints()` translates the outline so its first point is the origin.
describe('normalizeFreeformPoints', () => {
  it('leaves an outline that already starts at the origin untouched', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.02, 0.03],
      [0.06, 0],
    ];
    expect(normalizeFreeformPoints(pts)).toBe(pts); // same reference: no copy, no drift
  });

  it('translates by -p0 in BOTH axes, as the kernel does', () => {
    expect(
      normalizeFreeformPoints([
        [0.02, 0.01],
        [0.04, 0.04],
        [0.08, 0.01],
      ]),
    ).toEqual([
      [0, 0],
      [expect.closeTo(0.02, 12), expect.closeTo(0.03, 12)],
      [expect.closeTo(0.06, 12), 0],
    ]);
  });

  it('preserves the root chord, which is already translation-invariant', () => {
    const moved: [number, number][] = [
      [0.02, 0],
      [0.04, 0.03],
      [0.08, 0],
    ];
    expect(freeformRootChord(moved)).toBeCloseTo(0.06, 12);
    expect(freeformRootChord(normalizeFreeformPoints(moved))).toBeCloseTo(0.06, 12);
  });

  it('survives an empty or malformed outline', () => {
    expect(normalizeFreeformPoints(undefined)).toEqual([]);
    expect(normalizeFreeformPoints([])).toEqual([]);
    expect(normalizeFreeformPoints([[NaN, 0] as [number, number]])).toEqual([[NaN, 0]]);
  });

  it('reads only freeform nodes through the node accessor', () => {
    const got = freeformPoints({
      type: 'freeformfinset',
      points: [
        [0.02, 0],
        [0.05, 0.02],
        [0.08, 0],
      ],
    } as never);
    // Element-wise: the subtraction is exact in decimal but not in binary.
    expect(got.map(([x]) => x)).toEqual([expect.closeTo(0, 12), expect.closeTo(0.03, 12), expect.closeTo(0.06, 12)]);
    expect(got.map(([, y]) => y)).toEqual([0, 0.02, 0]);
    expect(freeformPoints({ type: 'trapezoidfinset', points: [[1, 1]] } as never)).toEqual([]);
  });
});

// RocketComponent.setAfter:1459-1491: previous sibling's aft end, offset forced to 0.
describe('resolveFilePositions: after', () => {
  const tree = (): RocketTree =>
    ({
      components: [
        {
          id: 's1',
          type: 'stage',
          children: [
            {
              id: 'body',
              type: 'bodytube',
              length: 0.4,
              children: [
                { id: 'a', type: 'innertube', length: 0.07, position: { method: 'top', offset: 0.05 } },
                { id: 'b', type: 'tubecoupler', length: 0.03, position: { method: 'after', offset: 0 } },
                { id: 'c', type: 'engineblock', length: 0.005, position: { method: 'after', offset: 0 } },
              ],
            },
          ],
        },
      ],
    }) as unknown as RocketTree;

  const kids = (t: RocketTree) => t.components[0]!.children![0]!.children!;

  it('seats an after-positioned part at the previous sibling’s aft end', () => {
    const out = kids(resolveFilePositions(tree()));
    const p = out[1]!.position as { method: string; offset: number };
    expect(p.method).toBe('top');
    expect(p.offset).toBeCloseTo(0.12, 9);
  });

  it('chains, so a second after-part follows the first', () => {
    const out = kids(resolveFilePositions(tree()));
    expect((out[2]!.position as { offset: number }).offset).toBeCloseTo(0.15, 9);
  });

  it('starts a FIRST child at the parent’s top, as setAfter does', () => {
    const t = tree();
    // A coupler: an inner tube overrides isAfter() and would take the parent's aft end.
    t.components[0]!.children![0]!.children![0]! = {
      id: 'a',
      type: 'tubecoupler',
      length: 0.07,
      position: { method: 'after', offset: 0 },
    } as never;
    const out = kids(resolveFilePositions(t));
    expect(out[0]!.position).toMatchObject({ method: 'top', offset: 0 });
  });

  it('keeps what the file said, so the .ork round-trip stays byte-stable', () => {
    const p = kids(resolveFilePositions(tree()))[1]!.position as {
      offset: number;
      ork?: { method: string; resolved: number };
    };
    expect(p.ork!.method).toBe('after');
    // Compared with === at export time.
    expect(p.ork!.resolved).toBe(p.offset);
  });

  it('ignores a stored offset, because the kernel forces it to zero', () => {
    const t = tree();
    (t.components[0]!.children![0]!.children![1]!.position as { offset: number }).offset = 0.9;
    expect((kids(resolveFilePositions(t))[1]!.position as { offset: number }).offset).toBeCloseTo(0.12, 9);
  });
});
