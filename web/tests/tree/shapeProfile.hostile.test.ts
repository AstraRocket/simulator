import { describe, it, expect } from 'vitest';
import { outerProfile } from '../../src/tree/shapeProfile';

// calculateClip()'s bisection exit `max - min < precision` is never true for NaN.
describe('outerProfile on hostile lengths', () => {
  const shapes = ['ellipsoid', 'power', 'haack'] as const;

  it.each(shapes)('%s: returns for a NaN length', (shape) => {
    const pts = outerProfile(shape, undefined, Number.NaN, 0.01, 0.02);
    expect(Array.isArray(pts)).toBe(true);
  });

  it.each(shapes)('%s: returns for an infinite length', (shape) => {
    const pts = outerProfile(shape, undefined, Number.POSITIVE_INFINITY, 0.01, 0.02);
    expect(Array.isArray(pts)).toBe(true);
  });

  it.each(shapes)('%s: returns for a length whose doubling overflows', (shape) => {
    const pts = outerProfile(shape, undefined, 1e308, 0.01, 0.02);
    expect(Array.isArray(pts)).toBe(true);
  });

  it('still clips a sane transition under the guard', () => {
    const clipped = outerProfile('ellipsoid', undefined, 0.1, 0.01, 0.03, 8, undefined, true);
    const unclipped = outerProfile('ellipsoid', undefined, 0.1, 0.01, 0.03, 8, undefined, false);
    expect(clipped).not.toEqual(unclipped);
    expect(clipped[0]![1]).toBeCloseTo(0.01, 6);
    expect(clipped[clipped.length - 1]![1]).toBeCloseTo(0.03, 6);
  });
});
