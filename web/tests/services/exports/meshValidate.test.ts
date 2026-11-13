import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { meshTolerances, triangleArea, validateSolid } from '../../../src/services/exports/meshValidate';
import {
  countBoundaryEdges,
  isSimplePolygon,
  makeWatertight,
  solidForNode,
} from '../../../src/services/exports/solidMesh';

const node = (props: Record<string, unknown>): ComponentNode => ({ id: 'n1', ...props }) as unknown as ComponentNode;

function tetra(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 3));
  g.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  return g;
}

describe('validateSolid detects what countBoundaryEdges cannot', () => {
  it('passes a closed, consistently wound solid', () => {
    expect(validateSolid(tetra())).toEqual([]);
  });

  it('catches an empty mesh, which an edge count calls watertight', () => {
    const g = tetra();
    g.setIndex([]);
    expect(validateSolid(g).map((i) => i.kind)).toContain('empty');
  });

  it('catches a hole', () => {
    const g = tetra();
    g.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2]);
    expect(validateSolid(g).map((i) => i.kind)).toContain('non-manifold-edge');
  });

  it('catches a flipped face that leaves every edge used exactly twice', () => {
    const g = tetra();
    g.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 3, 2]); // last face reversed
    const kinds = validateSolid(g).map((i) => i.kind);
    expect(kinds).toContain('inconsistent-winding');
    expect(kinds).not.toContain('non-manifold-edge');
  });

  it('catches a non-finite vertex and a collapsed triangle', () => {
    const g = tetra();
    const pos = g.getAttribute('position');
    pos.setXYZ(3, NaN, 0, 0);
    expect(validateSolid(g).map((i) => i.kind)).toContain('non-finite');

    const flat = new THREE.BufferGeometry();
    flat.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 2, 0, 0], 3));
    flat.setIndex([0, 1, 2]);
    expect(validateSolid(flat).map((i) => i.kind)).toContain('degenerate-triangle');
  });

  it('names what is wrong, not merely that something is', () => {
    const g = tetra();
    g.setIndex([]);
    expect(
      validateSolid(g)
        .map((i) => i.detail)
        .join('; '),
    ).toMatch(/no triangles/);
  });
});

describe('meshTolerances scale with the model', () => {
  it('keeps a 1e-6 weld tolerance for a normal-sized part and tightens it for a tiny one', () => {
    const big = new THREE.BufferGeometry();
    big.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3));
    expect(meshTolerances(big).weld).toBeCloseTo(1e-6, 12);

    const tiny = new THREE.BufferGeometry();
    tiny.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1e-3, 0, 0], 3));
    expect(meshTolerances(tiny).weld).toBeLessThan(1e-8);
    expect(meshTolerances(tiny).weld).toBeGreaterThan(0);
  });
});

describe('every exported component is a valid solid', () => {
  const parts: Array<[string, ComponentNode, number | null]> = [
    ['nose cone', node({ type: 'nosecone', shape: 'ogive', length: 0.1, aftRadius: 0.012, thickness: 0.001 }), null],
    ['nose cone (conical)', node({ type: 'nosecone', shape: 'conical', length: 0.08, aftRadius: 0.012 }), null],
    ['nose cone (haack)', node({ type: 'nosecone', shape: 'haack', length: 0.12, aftRadius: 0.012 }), null],
    ['body tube', node({ type: 'bodytube', length: 0.3, outerRadius: 0.012, thickness: 0.0005 }), null],
    [
      'transition',
      node({ type: 'transition', shape: 'conical', length: 0.05, foreRadius: 0.012, aftRadius: 0.008 }),
      null,
    ],
    [
      'trapezoid fin',
      node({ type: 'trapezoidfinset', rootChord: 0.06, tipChord: 0.03, sweep: 0.03, height: 0.05, thickness: 0.003 }),
      0.012,
    ],
    [
      'trapezoid fin with a tab',
      node({
        type: 'trapezoidfinset',
        rootChord: 0.06,
        tipChord: 0.03,
        sweep: 0.03,
        height: 0.05,
        thickness: 0.003,
        tabHeight: 0.008,
        tabLength: 0.02,
      }),
      0.012,
    ],
    ['elliptical fin', node({ type: 'ellipticalfinset', rootChord: 0.05, height: 0.03, thickness: 0.003 }), 0.012],
    [
      'elliptical fin with a tab',
      node({
        type: 'ellipticalfinset',
        rootChord: 0.05,
        height: 0.03,
        thickness: 0.003,
        tabHeight: 0.008,
        tabLength: 0.02,
      }),
      0.012,
    ],
    [
      'freeform fin',
      node({
        type: 'freeformfinset',
        thickness: 0.003,
        points: [
          [0, 0],
          [0.02, 0.04],
          [0.06, 0.03],
          [0.07, 0],
        ],
      }),
      0.012,
    ],
    [
      'freeform fin with a concave notch',
      node({
        type: 'freeformfinset',
        thickness: 0.003,
        points: [
          [0, 0],
          [0.01, 0.05],
          [0.035, 0.012],
          [0.06, 0.05],
          [0.07, 0],
        ],
      }),
      0.012,
    ],
    ['tube fin (auto radius)', node({ type: 'tubefinset', length: 0.08, finCount: 6, thickness: 0.0005 }), 0.025],
    ['launch lug', node({ type: 'launchlug', length: 0.04, outerRadius: 0.0022, thickness: 0.0003 }), null],
  ];

  it.each(parts)('%s', (_label, n, parentRadius) => {
    const geo = solidForNode(n, parentRadius);
    expect(geo).not.toBeNull();
    const issues = validateSolid(geo!, meshTolerances(geo!).area);
    expect(issues).toEqual([]);
  });

  it('refuses a scaled-down design rather than exporting an empty solid', () => {
    const tiny = node({ type: 'nosecone', shape: 'ogive', length: 0.00021, aftRadius: 0.000036 });
    const geo = solidForNode(tiny);
    expect(geo).not.toBeNull();
    expect(geo!.getIndex()!.count).toBeGreaterThan(0);
    expect(validateSolid(geo!, meshTolerances(geo!).area)).toEqual([]);
  });
});

describe('isSimplePolygon rejects a pinched outline', () => {
  it('still accepts an ordinary fin', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [0.02, 0.04],
        [0.06, 0.03],
        [0.07, 0],
      ]),
    ).toBe(true);
  });

  it('rejects a bow tie', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [0.06, 0.04],
        [0.06, 0],
        [0, 0.04],
      ]),
    ).toBe(false);
  });

  it('rejects two vertices dragged onto each other', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [0.03, 0.04],
        [0.06, 0],
        [0.03, 0.04],
        [0.09, 0],
      ]),
    ).toBe(false);
  });

  it('rejects a vertex sitting exactly on a non-adjacent edge', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [0.08, 0],
        [0.08, 0.04],
        [0.04, 0],
        [0, 0.04],
      ]),
    ).toBe(false);
  });
});

describe('makeWatertight caps a non-convex hole without overlapping itself', () => {
  // The corners' mean (1, 0.9) lies outside the polygon, so a fan cap from it overlaps itself.
  const CONTOUR: Array<[number, number]> = [
    [0, 0],
    [2, 0],
    [2, 2],
    [1, 0.5],
    [0, 2],
  ];

  function openPrism(): THREE.BufferGeometry {
    const pos: number[] = [];
    for (const [x, y] of CONTOUR) pos.push(x, y, 0, x, y, 1);
    const idx: number[] = [];
    for (let i = 0; i < CONTOUR.length; i++) {
      const j = (i + 1) % CONTOUR.length;
      const b0 = i * 2,
        t0 = i * 2 + 1,
        b1 = j * 2,
        t1 = j * 2 + 1;
      idx.push(b0, b1, t1, b0, t1, t0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  it('starts as an open shell with two boundary loops', () => {
    const open = openPrism();
    expect(countBoundaryEdges(open)).toBe(CONTOUR.length * 2);
    expect(validateSolid(open).map((i) => i.kind)).toContain('non-manifold-edge');
  });

  it('closes into a genuinely valid solid', () => {
    const capped = makeWatertight(openPrism());
    expect(countBoundaryEdges(capped)).toBe(0);
    expect(validateSolid(capped)).toEqual([]);
  });

  it('keeps every cap triangle inside the outline it is closing', () => {
    const capped = makeWatertight(openPrism());
    const pos = capped.getAttribute('position');
    const idx = capped.getIndex()!;

    const inside = (x: number, y: number): boolean => {
      let hit = false;
      for (let i = 0, j = CONTOUR.length - 1; i < CONTOUR.length; j = i++) {
        const [xi, yi] = CONTOUR[i]!;
        const [xj, yj] = CONTOUR[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };

    let capTriangles = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const ia = idx.getX(t),
        ib = idx.getX(t + 1),
        ic = idx.getX(t + 2);
      if (pos.getZ(ia) !== 0 || pos.getZ(ib) !== 0 || pos.getZ(ic) !== 0) continue;
      capTriangles++;
      const cx = (pos.getX(ia) + pos.getX(ib) + pos.getX(ic)) / 3;
      const cy = (pos.getY(ia) + pos.getY(ib) + pos.getY(ic)) / 3;
      expect({ cx, cy, inside: inside(cx, cy) }).toEqual({ cx, cy, inside: true });
    }
    expect(capTriangles).toBeGreaterThanOrEqual(3);
  });

  it('adds no vertex of its own', () => {
    const open = openPrism();
    const before = open.getAttribute('position').count;
    expect(makeWatertight(openPrism()).getAttribute('position').count).toBe(before);
  });
});

describe('triangleArea', () => {
  it('is half the cross product, and 0 for a collinear triangle', () => {
    const v = (x: number, y: number) => new THREE.Vector3(x, y, 0);
    expect(triangleArea(v(0, 0), v(2, 0), v(0, 3))).toBeCloseTo(3);
    expect(triangleArea(v(0, 0), v(1, 1), v(2, 2))).toBe(0);
  });
});
