import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { buildPieces, SURFACE } from '../../../src/components/canvas/rocketPieces';

// Each surface's texture coordinates, as desktop's `TubeGenerator` and `FinSetGenerator` give them.

const TREE = {
  components: [
    {
      id: 'stage',
      type: 'stage',
      children: [
        { id: 'nose', type: 'nosecone', shape: 'ogive', length: 0.1, aftRadius: 0.02, thickness: 0.002 },
        {
          id: 'body',
          type: 'bodytube',
          length: 0.3,
          outerRadius: 0.02,
          thickness: 0.001,
          children: [
            { id: 'fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.05, tipChord: 0.02, height: 0.04 },
          ],
        },
      ],
    },
  ],
} as unknown as RocketTree;

const { pieces } = buildPieces(TREE);
const piece = (prefix: string) => pieces.find((p) => p.key.startsWith(prefix))!;

/** Each vertex of one surface: its position and texture coordinate. */
function surface(g: THREE.BufferGeometry, which: number) {
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const out: { x: number; y: number; z: number; u: number; v: number }[] = [];
  for (const group of g.groups.filter((gr) => gr.materialIndex === which)) {
    for (let k = group.start; k < group.start + group.count; k++) {
      const i = g.index ? g.index.getX(k) : k;
      out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i), u: uv.getX(i), v: uv.getY(i) });
    }
  }
  return out;
}

describe('a body tube', () => {
  const outside = surface(piece('body').geometry, SURFACE.outside);

  it('runs v from 1 at the fore end to 0 aft', () => {
    for (const p of outside) expect(p.v).toBeCloseTo(1 - p.x / 0.3, 6);
  });

  it('starts u at +Y and runs it once around toward +Z, as theta does', () => {
    for (const p of outside) {
      const theta = Math.atan2(p.z, p.y);
      const u = 1 - (theta < -1e-9 ? theta + 2 * Math.PI : theta) / (2 * Math.PI);
      // The seam's two columns share a position: u is 1 on one and 0 on the other.
      if (Math.abs(theta) < 1e-9) expect([0, 1]).toContainEqual(Number(p.u.toFixed(9)));
      else expect(p.u).toBeCloseTo(u, 6);
    }
  });

  it('runs its inner wall the other way, as a coaxial tube does', () => {
    for (const p of surface(piece('body').geometry, SURFACE.inside)) expect(p.v).toBeCloseTo(p.x / 0.3, 6);
  });
});

describe('a nose cone', () => {
  it('runs v by the station along it, not by the profile point count', () => {
    // The nose is placed turned onto the axis: local +Y is the rocket's +X.
    for (const p of surface(piece('nose').geometry, SURFACE.outside)) expect(p.v).toBeCloseTo(1 - p.y / 0.1, 6);
  });
});

describe('a fin', () => {
  const g = piece('fin').geometry;
  const left = surface(g, SURFACE.outside);
  const right = surface(g, SURFACE.inside);
  const x0 = Math.min(...left.map((p) => p.x));

  it('spans the planform with the image, edge to edge', () => {
    const us = left.map((p) => p.u);
    const vs = left.map((p) => p.v);
    expect(Math.min(...us)).toBeCloseTo(0, 6);
    expect(Math.max(...us)).toBeCloseTo(1, 6);
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(1, 6);
  });

  // Seen from +z, +x runs to the right: an image whose u follows x reads the right way round there.
  it('reads forward on the left side, which faces +z', () => {
    for (const p of left) {
      expect(p.z).toBeGreaterThan(0);
      expect(p.u).toBeCloseTo((p.x - x0) / 0.05, 5);
    }
  });

  it('negates u on the right side, which faces -z', () => {
    for (const p of right) {
      expect(p.z).toBeLessThan(0);
      expect(p.u).toBeCloseTo(-(p.x - x0) / 0.05, 5);
    }
  });
});
