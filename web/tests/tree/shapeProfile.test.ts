import { describe, it, expect } from 'vitest';
import {
  shapeParamDefault,
  shapeUsesParameter,
  shapeParamMax,
  shapeIsClippable,
  shapeRadius,
  outerProfile,
  nodeShape,
  stationRadius,
  profileEnds,
  hasShoulder,
  shouldersOf,
} from '../../src/tree/shapeProfile';
import { KERNEL_DEFAULTS, KERNEL_SHAPES } from '../../src/tree/kernelDefaults';
import type { ComponentNode } from '../../src/engine/openRocketEngine';

describe('shape parameter metadata', () => {
  // defaultParameter() overrides: OGIVE 1.0 (Transition.java:1039-1041), POWER 0.5
  // (:1104-1106), PARABOLIC 1.0 (:1150-1152). HAACK's maxParameter() is 1/3 (:1187-1189).
  it('defaults per shape (ogive/parabolic 1, power 0.5, rest 0)', () => {
    expect(shapeParamDefault('ogive')).toBe(1);
    expect(shapeParamDefault('parabolic')).toBe(1);
    expect(shapeParamDefault('power')).toBe(0.5);
    expect(shapeParamDefault('conical')).toBe(0);
    expect(shapeParamDefault('haack')).toBe(0);
  });

  it('knows which shapes actually use the parameter', () => {
    expect(shapeUsesParameter('ogive')).toBe(true);
    expect(shapeUsesParameter('haack')).toBe(true);
    expect(shapeUsesParameter('conical')).toBe(false);
    expect(shapeUsesParameter('ellipsoid')).toBe(false);
  });

  it('caps haack at 1/3 and everything else at 1', () => {
    expect(shapeParamMax('haack')).toBeCloseTo(1 / 3);
    expect(shapeParamMax('ogive')).toBe(1);
  });

  it('marks ellipsoid / power / haack as clippable, the rest not', () => {
    expect(shapeIsClippable('ellipsoid')).toBe(true);
    expect(shapeIsClippable('power')).toBe(true);
    expect(shapeIsClippable('haack')).toBe(true);
    expect(shapeIsClippable('conical')).toBe(false);
    expect(shapeIsClippable('ogive')).toBe(false);
  });
});

describe('shapeRadius', () => {
  it('conical is a straight taper from tip to base', () => {
    expect(shapeRadius('conical', 0, 0.05, 1, 0)).toBeCloseTo(0);
    expect(shapeRadius('conical', 0.5, 0.05, 1, 0)).toBeCloseTo(0.025);
    expect(shapeRadius('conical', 1, 0.05, 1, 0)).toBeCloseTo(0.05);
  });

  it('every shape reaches the full radius at its base (x = length)', () => {
    for (const shape of ['conical', 'ellipsoid', 'power', 'parabolic', 'haack', 'ogive']) {
      const param = shapeParamDefault(shape);
      expect(shapeRadius(shape, 1, 0.05, 1, param), shape).toBeCloseTo(0.05);
    }
  });

  it('a blunt power series (param≈0) is a flat cylinder off the tip', () => {
    expect(shapeRadius('power', 0, 0.05, 1, 0)).toBe(0);
    expect(shapeRadius('power', 0.5, 0.05, 1, 0)).toBe(0.05);
  });

  it('power series scales as (x/length)^param', () => {
    expect(shapeRadius('power', 0.25, 0.05, 1, 0.5)).toBeCloseTo(0.05 * Math.sqrt(0.25));
  });
});

describe('outerProfile', () => {
  it('samples a nose cone (foreR 0) from tip to base with steps+1 points', () => {
    const pts = outerProfile('conical', 0, 0.1, 0, 0.05, 4);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[2]![0]).toBeCloseTo(0.05);
    expect(pts[2]![1]).toBeCloseTo(0.025);
    expect(pts[4]![0]).toBeCloseTo(0.1);
    expect(pts[4]![1]).toBeCloseTo(0.05);
  });

  it('draws a straight tube when the ends are equal', () => {
    const pts = outerProfile('conical', 0, 0.1, 0.02, 0.02, 4);
    expect(pts.every(([, r]) => r === 0.02)).toBe(true);
  });

  it('flips so the fore radius leads for a shrinking transition', () => {
    const pts = outerProfile('conical', 0, 0.1, 0.05, 0.02, 4);
    expect(pts[0]![1]).toBeCloseTo(0.05);
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0.02);
  });

  it('merges an exact extra abscissa without dropping the even ladder', () => {
    const pts = outerProfile('conical', 0, 0.1, 0, 0.05, 4, [0.03]);
    expect(pts).toHaveLength(6);
    expect(pts.some(([x]) => Math.abs(x - 0.03) < 1e-9)).toBe(true);
    expect(pts.map(([x]) => x)).toEqual([...pts.map(([x]) => x)].sort((a, b) => a - b));
  });

  it('replaces (not duplicates) an extra abscissa that coincides with a sample', () => {
    const pts = outerProfile('conical', 0, 0.1, 0, 0.05, 4, [0.05]);
    expect(pts).toHaveLength(5);
  });

  it('the clipped flag is ignored on a non-clippable shape', () => {
    const clipped = outerProfile('conical', undefined, 0.1, 0.02, 0.05, 8, undefined, true);
    const unclipped = outerProfile('conical', undefined, 0.1, 0.02, 0.05, 8, undefined, false);
    expect(clipped).toEqual(unclipped);
  });

  it('the clipped flag changes a clippable transition', () => {
    const clipped = outerProfile('ellipsoid', undefined, 0.1, 0.02, 0.05, 8, undefined, true);
    const unclipped = outerProfile('ellipsoid', undefined, 0.1, 0.02, 0.05, 8, undefined, false);
    expect(clipped).not.toEqual(unclipped);
  });
});

// `Transition.calculateClip` (Transition.java:695-700): r1 == type.getRadius(clipLength, r2, clipLength + length).
describe('calculateClip (via the clipped profile)', () => {
  const CLIPPABLE = ['ellipsoid', 'power', 'haack'] as const;

  const solveClip = (shape: string, param: number, length: number, r1: number, r2: number): number => {
    let lo = 0;
    let hi = length;
    while (shapeRadius(shape, hi, r2, hi + length, param) < r1) hi *= 2;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (shapeRadius(shape, mid, r2, mid + length, param) > r1) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };

  // The second geometry is not bracketed by `max = length`, so it exercises the doubling loop.
  const GEOMS: [number, number, number][] = [
    [0.1, 0.02, 0.04],
    [0.2, 0.0495, 0.05],
  ];

  it.each(CLIPPABLE)('%s draws the tail of the virtual nose it was cut from', (shape) => {
    const p = shapeParamDefault(shape);
    for (const [len, r1, r2] of GEOMS) {
      const clip = solveClip(shape, p, len, r1, r2);
      for (const [x, r] of outerProfile(shape, p, len, r1, r2, 16)) {
        if (x <= 0 || x >= len) continue;
        expect(r).toBeCloseTo(shapeRadius(shape, clip + x, r2, clip + len, p), 5);
      }
    }
  });

  it.each(CLIPPABLE)('%s meets both end radii', (shape) => {
    const p = shapeParamDefault(shape);
    const pts = outerProfile(shape, p, 0.1, 0.02, 0.04, 16);
    expect(pts[0]![1]).toBeCloseTo(0.02, 12);
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0.04, 12);
    expect(pts[1]![1]).toBeGreaterThan(0.02);
    expect(pts[1]![1]).toBeLessThan(0.024);
  });

  it.each(CLIPPABLE)('%s grows monotonically from fore to aft', (shape) => {
    const pts = outerProfile(shape, shapeParamDefault(shape), 0.1, 0.02, 0.04, 32);
    for (let i = 1; i < pts.length; i++) expect(pts[i]![1]).toBeGreaterThanOrEqual(pts[i - 1]![1]);
  });

  it('a nose cone (foreR 0) is never clipped: clipLength is 0 by definition', () => {
    for (const shape of CLIPPABLE) {
      const p = shapeParamDefault(shape);
      for (const [x, r] of outerProfile(shape, p, 0.1, 0, 0.04, 8)) {
        expect(r).toBeCloseTo(shapeRadius(shape, x, 0.04, 0.1, p), 12);
      }
    }
  });

  it('an explicit clipped=false draws the unclipped delta shape instead', () => {
    // The kernel's other branch: r1 + getRadius(x, r2 - r1, length).
    const p = shapeParamDefault('ellipsoid');
    for (const [x, r] of outerProfile('ellipsoid', p, 0.1, 0.02, 0.04, 8, undefined, false)) {
      expect(r).toBeCloseTo(0.02 + shapeRadius('ellipsoid', x, 0.02, 0.1, p), 12);
    }
  });

  it('a shrinking transition is the mirror of the growing one', () => {
    const p = shapeParamDefault('haack');
    const grow = outerProfile('haack', p, 0.1, 0.02, 0.04, 16);
    const shrink = outerProfile('haack', p, 0.1, 0.04, 0.02, 16);
    for (let i = 0; i < grow.length; i++) {
      expect(shrink[i]![1]).toBeCloseTo(grow[grow.length - 1 - i]![1], 12);
    }
  });

  it('a zero-length transition degenerates to the fore radius', () => {
    const pts = outerProfile('haack', 0, 0, 0.02, 0.04, 4);
    expect(pts.every(([, r]) => r === 0.02)).toBe(true);
  });

  it('a near-cylindrical clipped transition still lands on both radii', () => {
    const pts = outerProfile('ellipsoid', 0, 0.2, 0.0495, 0.05, 16);
    expect(pts[0]![1]).toBeCloseTo(0.0495, 12);
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0.05, 12);
    expect(pts.every(([, r]) => Number.isFinite(r))).toBe(true);
  });
});

describe('a node with no shape key', () => {
  const nose = (shape?: string) =>
    ({
      type: 'nosecone',
      id: 'n',
      length: 0.1,
      aftRadius: 0.02,
      ...(shape ? { shape } : {}),
    }) as unknown as ComponentNode;
  const transition = (shape?: string) =>
    ({
      type: 'transition',
      id: 't',
      length: 0.05,
      foreRadius: 0.02,
      aftRadius: 0.03,
      ...(shape ? { shape } : {}),
    }) as unknown as ComponentNode;

  it('is the kernel shape for its type', () => {
    expect(nodeShape(nose())).toBe(KERNEL_SHAPES.nosecone);
    expect(nodeShape(transition())).toBe(KERNEL_SHAPES.transition);
    expect(nodeShape(nose('haack'))).toBe('haack');
  });

  it('gives a keyless nose cone the radius of an ogive at a station', () => {
    expect(stationRadius(nose(), 0.05)).toBeCloseTo(stationRadius(nose('ogive'), 0.05), 12);
    expect(stationRadius(nose(), 0.05)).not.toBeCloseTo(stationRadius(nose('conical'), 0.05), 6);
  });
});

describe('stationRadius on a part with no length on record', () => {
  it('reads the profile at the length the bridge builds it at', () => {
    const L = KERNEL_DEFAULTS.transition.length;
    const t = { type: 'transition', shape: 'conical', foreRadius: 0.02, aftRadius: 0.03 } as unknown as ComponentNode;
    expect(stationRadius(t, 0)).toBeCloseTo(0.02, 12);
    expect(stationRadius(t, 0.0125)).toBeCloseTo(0.02 + (0.01 * 0.0125) / L, 12);
  });
});

describe('stationRadius on a zero-length transition', () => {
  it('answers as Transition.getRadius: fore before x = 0, aft from x = 0 on', () => {
    // `x >= length` is true at x = 0, so the aft end wins there whichever is wider.
    const t = { type: 'transition', length: 0, foreRadius: 0.03, aftRadius: 0.02 } as unknown as ComponentNode;
    expect(stationRadius(t, -0.001)).toBe(0.03);
    expect(stationRadius(t, 0)).toBe(0.02);
    expect(stationRadius({ ...t, foreRadius: 0.01 } as ComponentNode, 0)).toBe(0.02);
  });
});

describe('profileEnds for a transition with no radius on record', () => {
  it('reads each missing end as SymmetricComponent.DEFAULT_RADIUS, 0.025 m', () => {
    expect(profileEnds({ type: 'transition' } as unknown as ComponentNode)).toEqual({ fore: 0.025, aft: 0.025 });
    expect(profileEnds({ type: 'transition', foreRadius: 0.01 } as unknown as ComponentNode)).toEqual({
      fore: 0.01,
      aft: 0.025,
    });
  });
});

describe('shouldersOf', () => {
  const nose = (o: Record<string, unknown>) =>
    ({ type: 'nosecone', shoulderRadius: 0.02, shoulderLength: 0.03, ...o }) as unknown as ComponentNode;

  it('puts a nose cone shoulder on its base, fore once flipped', () => {
    expect(shouldersOf(nose({})).aft).toMatchObject({ radius: 0.02, length: 0.03 });
    expect(hasShoulder(shouldersOf(nose({})).fore)).toBe(false);
    expect(shouldersOf(nose({ flipped: true })).fore).toMatchObject({ radius: 0.02, length: 0.03 });
    expect(hasShoulder(shouldersOf(nose({ flipped: true })).aft)).toBe(false);
  });

  it('reads a transition’s two shoulders under their own keys', () => {
    const tr = {
      type: 'transition',
      foreShoulderRadius: 0.01,
      foreShoulderLength: 0.02,
      aftShoulderRadius: 0.015,
      aftShoulderLength: 0.025,
      aftShoulderCapped: true,
    } as unknown as ComponentNode;
    const { fore, aft } = shouldersOf(tr);
    expect(fore).toMatchObject({ radius: 0.01, length: 0.02, capped: false });
    expect(aft).toMatchObject({ radius: 0.015, length: 0.025, capped: true });
  });

  it('counts a shoulder only with a radius and a length', () => {
    expect(hasShoulder(shouldersOf(nose({ shoulderLength: 0 })).aft)).toBe(false);
    expect(hasShoulder(shouldersOf(nose({ shoulderRadius: 1e-9 })).aft)).toBe(false);
    expect(hasShoulder(shouldersOf(nose({})).aft)).toBe(true);
  });
});
