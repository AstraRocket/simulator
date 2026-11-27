import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  padStand,
  railGeometry,
  railSection,
  railSide,
  rodRadius,
} from '../../../src/components/canvas/launchGuideShape';
import { liftOnPad, newPlacement } from '../../../src/components/canvas/bodyMotion';

const crosses = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2): boolean => {
  const side = (p: THREE.Vector2, q: THREE.Vector2, r: THREE.Vector2) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};

describe('the rail section', () => {
  const outline = railSection().getPoints();

  it('is a T-slot square: a slot in each of the four faces, and a bore', () => {
    // Four faces of nine points, the first repeated to close it.
    expect(new Set(outline.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)).size).toBe(36);
    expect(railSection().holes).toHaveLength(1);
    const xs = outline.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-0.5, 9);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 9);
  });

  it('never crosses itself, so the slots stay apart at the corners', () => {
    const n = outline.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n - 1; j++) {
        if (i === 0 && j === n - 2) continue;
        expect(crosses(outline[i]!, outline[i + 1]!, outline[j]!, outline[j + 1]!)).toBe(false);
      }
    }
  });

  it('stands along y, centered, at its width and length', () => {
    const box = new THREE.Box3().setFromBufferAttribute(
      railGeometry(0.0254, 2).getAttribute('position') as THREE.BufferAttribute,
    );
    expect(box.min.y).toBeCloseTo(-1, 9);
    expect(box.max.y).toBeCloseTo(1, 9);
    expect(box.max.x - box.min.x).toBeCloseTo(0.0254, 9);
    expect(box.max.z - box.min.z).toBeCloseTo(0.0254, 9);
  });
});

describe('sizes as sold', () => {
  it('takes 1515 past 2 m of rail, 1010 below', () => {
    expect(railSide(1.8)).toBeCloseTo(0.0254, 9);
    expect(railSide(2.4)).toBeCloseTo(0.0381, 9);
  });

  it('thickens a rod with its length', () => {
    expect(rodRadius(0.9)).toBeLessThan(rodRadius(1.2));
    expect(rodRadius(1.2)).toBeLessThan(rodRadius(1.8));
  });
});

describe('the pad stand', () => {
  it('is a model pad for a short rod and a high power pad for a long rail, within what is sold', () => {
    expect(padStand(0.9).reach).toBeCloseTo(0.4, 9);
    expect(padStand(6).reach).toBeCloseTo(1.2, 9);
    const s = padStand(2);
    expect(s.top).toBeGreaterThan(s.height);
    expect(s.height).toBeLessThan(s.reach);
  });
});

describe('the lift onto the pad', () => {
  const pad = new THREE.Vector3(0, 0, 0);
  const lift = { heightM: 0.3, fadeM: 3, untilT: 10 };
  const placed = (y: number, t: number) => {
    const p = newPlacement();
    p.position.set(0, y, 0);
    liftOnPad(p, pad, lift, t, 2);
    return p.position.y;
  };

  it('stands what is on the pad on the deflector, at the drawing scale', () => {
    expect(placed(0, 0)).toBeCloseTo(0.6, 9);
  });

  it('eases back to the flown track, and leaves it alone clear of the pad or after apogee', () => {
    expect(placed(3, 1)).toBeGreaterThan(3);
    expect(placed(3, 1)).toBeLessThan(3.6);
    expect(placed(6, 1)).toBe(6);
    expect(placed(0, 12)).toBe(0);
  });
});
