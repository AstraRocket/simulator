import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '../../src/engine/openRocketEngine';
import type { RocketTree } from '../../src/engine/openRocketEngine';
import {
  KERNEL_ELLIPSE_POINTS,
  ellipticalFinPoints,
  finCutContour,
  finMountOf,
  finOutlinePoints,
  finPointsWithRoot,
  finRootPoints,
  finSpan,
  finTabPoints,
  finTabSpan,
  trapezoidFinPoints,
} from '../../src/tree/finPlanform';
import { tubeFinRadius } from '../../src/tree/tubefins';
import { FREEFORM_SNAP_LARGER_THAN, axialLength, freeformPoints } from '../../src/tree/position';
import { finPlanformMm } from '../../src/services/report/reportGeometry';

const JAVA_ROOT = fileURLToPath(new URL('../../../engine-java/src/java/info/openrocket/core/', import.meta.url));

function javaSource(relPath: string): string {
  let raw: string;
  try {
    raw = readFileSync(JAVA_ROOT + relPath, 'utf8');
  } catch {
    // A failure, not a skip: the gate must not silently disable itself.
    throw new Error(
      `Kernel reference source not found: engine-java/src/java/info/openrocket/core/${relPath}. ` +
        `The fin-geometry port is verified against it; if the kernel tree moved, update JAVA_ROOT here.`,
    );
  }
  return raw.replace(/\s+/g, ' ');
}

const node = (props: Record<string, unknown>): ComponentNode => ({ id: 'f1', ...props }) as unknown as ComponentNode;

describe('elliptical fin planform vs EllipticalFinSet.java', () => {
  const src = javaSource('rocketcomponent/EllipticalFinSet.java');

  it('is generated from the formulas the port was written against', () => {
    expect(src).toContain('double a = Math.PI * (POINTS - 1 - i) / (POINTS - 1);');
    expect(src).toContain('POINT_X[i] = (Math.cos(a) + 1) / 2;');
    expect(src).toContain('POINT_Y[i] = Math.sin(a);');
    expect(src).toContain('POINT_X[0] = 0;');
    expect(src).toContain('POINT_Y[0] = 0;');
    expect(src).toContain('POINT_X[POINTS - 1] = 1;');
    expect(src).toContain('POINT_Y[POINTS - 1] = 0;');
    // getFinPoints scales the unit table by (max(length, 0.0001), height).
    expect(src).toContain('double len = MathUtil.max(length, 0.0001);');
    expect(src).toContain('finPoints[i] = new Coordinate(POINT_X[i] * len, POINT_Y[i] * height);');
  });

  it('samples at the kernel resolution', () => {
    const declared = /private static final int POINTS = (\d+);/.exec(src);
    expect(declared?.[1]).toBeDefined();
    expect(Number(declared![1])).toBe(KERNEL_ELLIPSE_POINTS);
    expect(ellipticalFinPoints(0.05, 0.03)).toHaveLength(KERNEL_ELLIPSE_POINTS);
  });

  it('matches an independent transcription of the kernel algorithm', () => {
    const POINTS = 31;
    const POINT_X: number[] = [];
    const POINT_Y: number[] = [];
    for (let i = 0; i < POINTS; i++) {
      const a = (Math.PI * (POINTS - 1 - i)) / (POINTS - 1);
      POINT_X[i] = (Math.cos(a) + 1) / 2;
      POINT_Y[i] = Math.sin(a);
    }
    POINT_X[0] = 0;
    POINT_Y[0] = 0;
    POINT_X[POINTS - 1] = 1;
    POINT_Y[POINTS - 1] = 0;

    for (const [rootChord, height] of [
      [0.05, 0.03],
      [0.12, 0.004],
      [0.0001, 0.05],
      [0.2, 0.2],
    ] as const) {
      const len = Math.max(rootChord, 0.0001);
      const ours = ellipticalFinPoints(rootChord, height);
      for (let i = 0; i < POINTS; i++) {
        expect(ours[i]![0]).toBeCloseTo(POINT_X[i]! * len, 12);
        expect(ours[i]![1]).toBeCloseTo(POINT_Y[i]! * height, 12);
      }
    }
  });

  it('lies on the half-ellipse, which a sine arch does not', () => {
    const root = 0.05,
      height = 0.03;
    for (const [x, y] of ellipticalFinPoints(root, height)) {
      const u = (x - root / 2) / (root / 2);
      const v = y / height;
      expect(u * u + v * v).toBeCloseTo(1, 10);
    }
  });

  it('pins an interior station to the closed form', () => {
    // y = h*sqrt(1 - (2x/root - 1)^2) = 18.0 mm at x = 5 mm; a sine arch gives 9.27 mm.
    const root = 0.05,
      height = 0.03;
    const pts = ellipticalFinPoints(root, height);
    const at5 = pts.reduce((a, b) => (Math.abs(b[0] - 0.005) < Math.abs(a[0] - 0.005) ? b : a));
    const exact = height * Math.sqrt(1 - Math.pow((2 * at5[0]) / root - 1, 2));
    expect(at5[1]).toBeCloseTo(exact, 12);
    expect(height * Math.sqrt(1 - Math.pow((2 * 0.005) / root - 1, 2))).toBeCloseTo(0.018, 4);
  });

  it('keeps the endpoints exactly on the root line', () => {
    const pts = ellipticalFinPoints(0.05, 0.03);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[KERNEL_ELLIPSE_POINTS - 1]).toEqual([0.05, 0]);
  });
});

describe('trapezoid fin planform vs TrapezoidFinSet.java', () => {
  const src = javaSource('rocketcomponent/TrapezoidFinSet.java');

  it('is generated from the formulas the port was written against', () => {
    expect(src).toContain('points.add(Coordinate.NUL);');
    expect(src).toContain('points.add(new Coordinate(sweep, height));');
    expect(src).toContain('if (tipChord > 0.0001) {');
    expect(src).toContain('points.add(new Coordinate(sweep + tipChord, height));');
    expect(src).toContain('points.add(new Coordinate(MathUtil.max(length, 0.0001), 0));');
  });

  it('matches an independent transcription, including the tip-collapse rule', () => {
    const kernelPoints = (rootChord: number, tipChord: number, sweep: number, height: number): number[][] => {
      const points: number[][] = [];
      points.push([0, 0]);
      points.push([sweep, height]);
      if (tipChord > 0.0001) points.push([sweep + tipChord, height]);
      points.push([Math.max(rootChord, 0.0001), 0]);
      return points;
    };
    for (const [rootChord, tipChord, sweep, height] of [
      [0.06, 0.03, 0.03, 0.05],
      [0.05, 0, 0.02, 0.03],
      [0.05, 0.00005, 0.02, 0.03], // below the kernel's 0.0001 threshold -> triangle
      [0.00002, 0.02, 0.01, 0.04],
    ] as const) {
      const n = node({ type: 'trapezoidfinset', rootChord, tipChord, sweep, height });
      expect(trapezoidFinPoints(n)).toEqual(kernelPoints(rootChord, tipChord, sweep, height));
    }
  });
});

describe('tube-fin auto radius vs TubeFinSet.java', () => {
  const src = javaSource('rocketcomponent/TubeFinSet.java');

  it('is generated from the formulas the port was written against', () => {
    expect(src).toContain('final double finSep = Math.PI / fins;');
    expect(src).toContain('r *= Math.sin(finSep) / (1.0 - Math.sin(finSep));');
    // The under-3-fins branch of getOuterRadius().
    expect(src).toContain('if (fins < 3) { return getBodyRadius(); } else { return getTouchingRadius(); }');
  });

  it('matches an independent transcription of getTouchingRadius', () => {
    const touchingRadius = (bodyRadius: number, fins: number): number => {
      let r = bodyRadius;
      const finSep = Math.PI / fins;
      r *= Math.sin(finSep) / (1.0 - Math.sin(finSep));
      return r;
    };
    for (const fins of [3, 4, 5, 6, 8, 12]) {
      const n = node({ type: 'tubefinset', finCount: fins });
      expect(tubeFinRadius(n, 0.025)).toBeCloseTo(touchingRadius(0.025, fins), 12);
    }
  });

  it('falls back to the body radius below three fins, as the kernel does', () => {
    for (const fins of [1, 2]) {
      expect(tubeFinRadius(node({ type: 'tubefinset', finCount: fins }), 0.025)).toBeCloseTo(0.025, 12);
    }
  });

  it('prefers an explicit radius over the auto rule', () => {
    const n = node({ type: 'tubefinset', finCount: 6, outerRadius: 0.011 });
    expect(tubeFinRadius(n, 0.025)).toBe(0.011);
  });

  it('keeps a stored radius the way setOuterRadius stores it', () => {
    // A stored zero is a zero-size tube, not the touching radius.
    expect(src).toContain('this.autoRadius = false; this.outerRadius = Math.max(radius, 0);');
    const setOuterRadius = (radius: number): number => Math.max(radius, 0);
    for (const r of [0, -0.004, 0.003]) {
      const n = node({ type: 'tubefinset', finCount: 6, outerRadius: r });
      expect(tubeFinRadius(n, 0.025)).toBe(setOuterRadius(r));
    }
  });
});

describe('freeform outline vs FreeformFinSet.setPoints', () => {
  const src = javaSource('rocketcomponent/FreeformFinSet.java');

  it('is generated from the rules the port was written against', () => {
    expect(src).toContain('private static final double IGNORE_SMALLER_THAN = 1.0e-12;');
    expect(src).toContain('public static final double SNAP_LARGER_THAN = 2.5;');
    expect(src).toContain(
      'final CoordinateIF delta = newPoints.get(0).multiply(-1); if (IGNORE_SMALLER_THAN < delta.length2()) { newPoints = translatePoints(newPoints, delta); }',
    );
    expect(src).toContain(
      'if (p.getX() > SNAP_LARGER_THAN) { newPoints.set(i, p.setX(SNAP_LARGER_THAN)); } if (p.getY() > SNAP_LARGER_THAN) { newPoints.set(i, p.setY(SNAP_LARGER_THAN)); }',
    );
  });

  it('translates to the first point, then snaps each coordinate past 2.5 m', () => {
    // Both `set` calls start from the translated `p`, so the y snap overwrites the x snap.
    const setPoints = (pts: [number, number][]): [number, number][] => {
      const [x0, y0] = pts[0]!;
      return pts
        .map(([x, y]): [number, number] => [x - x0, y - y0])
        .map(([x, y]) => (y > 2.5 ? [x, 2.5] : x > 2.5 ? [2.5, y] : [x, y]));
    };
    expect(FREEFORM_SNAP_LARGER_THAN).toBe(2.5);
    const raw: [number, number][] = [
      [0.1, 0],
      [1.5, 3.2],
      [3.4, 0],
    ];
    const n = node({ type: 'freeformfinset', points: raw });
    expect(freeformPoints(n)).toEqual(setPoints(raw));
    expect(finSpan(n)).toBe(2.5);
    expect(axialLength(n)).toBeCloseTo(2.5, 12);
    const both: [number, number][] = [
      [0, 0],
      [2.8, 3.1],
      [3.4, 0],
    ];
    expect(freeformPoints(node({ type: 'freeformfinset', points: both }))).toEqual(setPoints(both));
    expect(setPoints(both)[1]).toEqual([2.8, 2.5]);
  });
});

describe('through-the-wall tab vs FinSet.java', () => {
  const src = javaSource('rocketcomponent/FinSet.java');

  it('clamps tab height the way the kernel does', () => {
    expect(src).toContain('double maxTabHeight = getMaxTabHeight();');
    expect(src).toContain('this.tabHeight = Math.min(this.tabHeight, maxTabHeight);');
    expect(src).toContain('return MathUtil.min(radiusFront, radiusTrailing);');
    expect(src).toContain('return sym.getRadius(finFront.getX() + xLead);');
    expect(src).toContain('return sym.getRadius(finFront.getX() + xTrail);');
    expect(src).toContain('return tabPosition + tabLength;');
  });

  it('never cuts a tab deeper than the body radius', () => {
    const n = node({ type: 'trapezoidfinset', tabHeight: 0.02, tabLength: 0.02, tabOffsetMethod: 'middle' });
    expect(finTabSpan(n, 0.05, 0.012)?.height).toBeCloseTo(0.012, 12);
    expect(finTabSpan(n, 0.05, 0.03)?.height).toBeCloseTo(0.02, 12);
    expect(finTabSpan(n, 0.05, null)?.height).toBeCloseTo(0.02, 12);
  });

  // The tab front edge is `AxialMethod.getAsPosition(tabOffset, tabLength, length)`.
  it('places the tab by every AxialMethod the bridge accepts', () => {
    const axial = javaSource('rocketcomponent/position/AxialMethod.java');
    // ABSOLUTE and TOP, AFTER, MIDDLE, BOTTOM, in source order.
    expect(axial).toContain(
      'public double getAsPosition(double offset, double innerLength, double outerLength) { return offset; }',
    );
    expect(axial).toContain(
      'public double getAsPosition(double offset, double innerLength, double outerLength) { return outerLength + offset; }',
    );
    expect(axial).toContain('return offset + (outerLength - innerLength) / 2;');
    expect(axial).toContain('return offset + (outerLength - innerLength);');
    expect(src).toContain('this.tabPosition = this.tabOffsetMethod.getAsPosition(tabOffset, tabLength, length);');
    const getAsPosition: Record<string, (offset: number, inner: number, outer: number) => number> = {
      absolute: (offset) => offset,
      after: (offset, _inner, outer) => outer + offset,
      top: (offset) => offset,
      middle: (offset, inner, outer) => offset + (outer - inner) / 2,
      bottom: (offset, inner, outer) => offset + (outer - inner),
    };
    const rootChord = 0.06;
    const tabLength = 0.02;
    for (const [method, position] of Object.entries(getAsPosition)) {
      for (const tabOffset of [-0.01, 0, 0.005]) {
        const n = node({
          type: 'trapezoidfinset',
          rootChord,
          tabHeight: 0.004,
          tabLength,
          tabOffsetMethod: method,
          tabOffset,
        });
        expect(finTabSpan(n, rootChord, null)?.x0, `${method} @ ${tabOffset}`).toBeCloseTo(
          position(tabOffset, tabLength, rootChord),
          12,
        );
      }
    }
  });

  it('returns null rather than a degenerate tab', () => {
    const noTab = node({ type: 'trapezoidfinset', tabHeight: 0, tabLength: 0.02 });
    expect(finTabSpan(noTab, 0.05, 0.012)).toBeNull();
    const zeroLen = node({ type: 'trapezoidfinset', tabHeight: 0.005, tabLength: 0 });
    expect(finTabSpan(zeroLen, 0.05, 0.012)).toBeNull();
  });
});

// Expected values are written out from the Java, never read back from the module under test.
describe('a fin on its parent vs FinSet.java and FreeformFinSet.java', () => {
  const finSet = javaSource('rocketcomponent/FinSet.java');
  const freeform = javaSource('rocketcomponent/FreeformFinSet.java');

  it('is generated from the formulas the port was written against', () => {
    expect(finSet).toContain(
      'return getMountPoints(finLead.getX(), xFinEnd, -finLead.getX(), -finLead.getY(), maximumBodyDivisionCount);',
    );
    expect(finSet).toContain(
      'if ((!MathUtil.equals(getCantAngle(), 0)) || (parent instanceof Transition && ((Transition)parent).getShapeType() != Shape.CONICAL)) {',
    );
    expect(finSet).toContain('final double xWidth = 0.0025;');
    expect(finSet).toContain('divisionCount = (int) Math.ceil(intervalLength / xWidth);');
    expect(finSet).toContain('private static final int MAX_ROOT_DIVISIONS = 100;');
    expect(finSet).toContain('double yCurr = parent.getRadius(xCurr);');
    expect(finSet).toContain('yTabFront = body.getRadius(finFront.getX() + xTabFront) - finFront.getY();');
    expect(finSet).toContain('yTabTrail = body.getRadius(finFront.getX() + xTabTrail) - finFront.getY();');
    expect(finSet).toContain('yTabBottom = MathUtil.min(yTabFront, yTabTrail) - tabHeight;');
    expect(finSet).toContain('final double xCurr_rot = xCenter + dx * Math.abs(Math.cos(cantAngle));');
    expect(finSet).toContain('final double dz = Math.abs(Math.sin(cantAngle)) * dx;');
    expect(finSet).toContain('dy = radius_rot - Math.sqrt(Math.pow(radius_rot, 2) - Math.pow(dz, 2));');
    // FreeformFinSet.getFinPoints moves the end points onto the root.
    expect(freeform).toContain(
      'finPoints[finPoints.length - 1] = finPoints[finPoints.length - 1].setX(rootPoints[rootPoints.length - 1].getX()).setY(rootPoints[rootPoints.length - 1].getY());',
    );
    expect(freeform).toContain('if (yBody > yPrior) { points.set(index, points.get(index).setY(yBody)); }');
  });

  // `Transition.getRadius` with r1 > r2 measures from the small end: R(x) = 0.025 - 0.1 x.
  const R = (x: number) => 0.025 - 0.1 * x;
  const transition = {
    type: 'transition',
    id: 'boattail',
    shape: 'conical',
    length: 0.1,
    foreRadius: 0.025,
    aftRadius: 0.015,
    thickness: 0.002,
  };
  const fin = node({
    type: 'freeformfinset',
    id: 'fins',
    finCount: 3,
    thickness: 0.003,
    points: [
      [0, 0],
      [0.02, 0.03],
      [0.04, 0],
    ],
    tabHeight: 0.02,
    tabLength: 0.02,
    tabOffsetMethod: 'top',
    tabOffset: 0.01,
    position: { method: 'top', offset: 0.03 },
  });
  const tree = {
    components: [
      {
        type: 'stage',
        id: 'stage',
        children: [
          { type: 'nosecone', id: 'nose', shape: 'ogive', length: 0.1, aftRadius: 0.025, thickness: 0.002 },
          { type: 'bodytube', id: 'tube', length: 0.3, outerRadius: 0.025, thickness: 0.001 },
          { ...transition, children: [fin] },
        ],
      },
    ],
  } as unknown as RocketTree;
  const mount = finMountOf(tree, 'fins')!;
  const front = 0.03;
  const yFin = R(front);

  it('stands on the radius under its own front', () => {
    expect(mount.front).toBeCloseTo(front, 12);
    expect(mount.radiusAt(mount.front)).toBeCloseTo(0.022, 12);
  });

  it('runs its root along the taper (getRootPoints)', () => {
    const root = finRootPoints(fin, mount);
    expect(root).toHaveLength(2);
    expect(root[0]![0]).toBeCloseTo(0, 12);
    expect(root[0]![1]).toBeCloseTo(0, 12);
    expect(root[1]![0]).toBeCloseTo(0.04, 12);
    expect(root[1]![1]).toBeCloseTo(R(front + 0.04) - yFin, 12);
    expect(root[1]![1]).toBeCloseTo(-0.004, 12);
  });

  it('moves the outline end points onto the root (getFinPoints)', () => {
    const outline = finOutlinePoints(fin, mount)!;
    expect(outline[0]).toEqual([0, 0]);
    expect(outline[1]![0]).toBeCloseTo(0.02, 12);
    expect(outline[1]![1]).toBeCloseTo(0.03, 12);
    expect(outline[2]![0]).toBeCloseTo(0.04, 12);
    expect(outline[2]![1]).toBeCloseTo(-0.004, 12);
  });

  it('starts the tab at the body surface at each of its stations (getTabPoints)', () => {
    // getMaxTabHeight = min(R(0.04), R(0.06)) = 0.019, so the 20 mm tab cuts 19 mm.
    const yFront = R(front + 0.01) - yFin;
    const yTrail = R(front + 0.03) - yFin;
    const yBottom = Math.min(yFront, yTrail) - Math.min(0.02, Math.min(R(front + 0.01), R(front + 0.03)));
    const tab = finTabPoints(fin, mount)!;
    const expected = [
      [0.01, yFront],
      [0.01, yBottom],
      [0.03, yBottom],
      [0.03, yTrail],
    ];
    expect(tab).toHaveLength(4);
    tab.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i]![0]!, 12);
      expect(y).toBeCloseTo(expected[i]![1]!, 12);
    });
    expect(yFront).toBeCloseTo(-0.001, 12);
    expect(yTrail).toBeCloseTo(-0.003, 12);
    expect(yBottom).toBeCloseTo(-0.022, 12);
  });

  // The root's front point is the outline's first, so it is not repeated.
  const expected = [
    [0, 0],
    [0.02, 0.03],
    [0.04, -0.004],
    [0.03, -0.003],
    [0.03, -0.022],
    [0.01, -0.022],
    [0.01, -0.001],
  ];

  it('cuts the outline, the root and the tab as one closed contour', () => {
    const contour = finCutContour(fin, mount)!;
    expect(contour).toHaveLength(expected.length);
    contour.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i]![0]!, 12);
      expect(y).toBeCloseTo(expected[i]![1]!, 12);
    });
    expect(contour.some(([x, y]) => Math.abs(x - 0.04) < 1e-12 && Math.abs(y) < 1e-12)).toBe(false);
  });

  it('draws the same root it cuts', () => {
    const drawn = finPointsWithRoot(fin, mount)!;
    expect(drawn).toHaveLength(3);
    expect(drawn[2]![1]).toBeCloseTo(-0.004, 12);
  });

  it('prints the same part on the 1:1 template', () => {
    // mm, y measured down from the 30 mm span.
    const template = finPlanformMm(fin, mount);
    expect(template.pts).toHaveLength(expected.length);
    template.pts.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i]![0]! * 1000, 9);
      expect(y).toBeCloseTo((0.03 - expected[i]![1]!) * 1000, 9);
    });
  });

  it('bends a canted fin root down onto a body tube (getFinCantYOffset)', () => {
    // Root drops dy = r - sqrt(r^2 - dz^2), dz = |sin(cant)| dx from the root midpoint.
    const r = 0.02;
    const cant = 0.1;
    const canted = node({ type: 'trapezoidfinset', rootChord: 0.05, tipChord: 0.02, sweep: 0.02, height: 0.04, cant });
    const tubeMount = { radiusAt: () => r, length: 0.3, front: 0.1, curved: false };
    const root = finRootPoints(canted, tubeMount);
    const drop = (x: number) => {
      const dz = Math.abs(Math.sin(cant)) * (x - 0.025);
      return -(r - Math.sqrt(r * r - dz * dz));
    };
    // getMountPoints: ceil(interval / 2.5 mm) intervals.
    expect(root).toHaveLength(Math.ceil((0.1 + 0.05 - 0.1) / 0.0025) + 1);
    expect(root[0]![0]).toBeCloseTo(0, 12);
    expect(root[root.length - 1]![0]).toBeCloseTo(0.05, 12);
    for (const [x, y] of root) expect(y, `station ${x}`).toBeCloseTo(drop(x), 12);
    expect(Math.min(...root.map(([, y]) => Math.abs(y)))).toBeLessThan(1e-6);
    expect(root.filter(([, y]) => y < -1e-9).length).toBeGreaterThan(root.length - 3);
    expect(drop(0.01)).toBeCloseTo(-0.0000561, 7);
    const outline = finOutlinePoints(canted, tubeMount)!;
    expect(outline[0]![1]).toBeCloseTo(drop(0), 12);
    expect(outline[outline.length - 1]![1]).toBeCloseTo(drop(0.05), 12);
  });
});

// On a new use, move the math into `tree/`; do not add the consumer to the allowlist.
describe('no module grows its own fin sampler', () => {
  // `../../src/`, not `..`, which would resolve to web/tests/ and read no src.
  const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
  const ALLOWED = ['tree/finPlanform.ts', 'tree/tubefins.ts', 'tree/shapeProfile.ts'];

  const sourceFiles = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = dir + entry;
      if (statSync(full).isDirectory()) {
        if (entry !== 'vendor') sourceFiles(full + '/', out);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  };

  // Not `FIN_DEFAULTS` or `finRootChord`: a consumer can hold every dimension and still draw its own curve.
  const SHARED_OUTLINE = /finPlanformPoints|finCutContour|finPlanformMm|finPointsWithRoot|finOutlinePoints/;

  // The trig guard cannot see an SVG arc or polygon literal; add fin-drawing modules here.
  const OUTLINE_CONSUMERS = [
    'components/canvas/AftView.tsx',
    'components/canvas/schematicShapes.tsx',
    'components/canvas/rocketPieces.ts',
    'services/report/reportGeometry.ts',
    'services/report/templatesSection.ts',
    'services/exports/solidMesh.ts',
    'services/exports/dxfExport.ts',
    'services/files/onshapeExport.ts',
    'services/files/rasaero/surface.ts',
    'services/files/rasaero/sustainer.ts',
    'services/design/componentActions.ts',
    'services/flight/finFlutter.ts',
  ];

  it('reads the source tree, not itself', () => {
    // Otherwise the guard passes vacuously if the walk never reaches src.
    const files = sourceFiles(SRC).map((f) => f.slice(SRC.length).split('\\').join('/'));
    expect(files).toContain('tree/finPlanform.ts');
    expect(files).toContain('components/canvas/schematicShapes.tsx');
    expect(files.length).toBeGreaterThan(200);
    for (const a of ALLOWED) expect(files, a).toContain(a);
  });

  it('every fin-drawing module takes its outline from tree/finPlanform', () => {
    const files = sourceFiles(SRC).map((f) => f.slice(SRC.length).split('\\').join('/'));
    for (const rel of OUTLINE_CONSUMERS) expect(files, rel).toContain(rel);
    const callers = files.filter(
      (rel) =>
        !rel.startsWith('tree/') &&
        SHARED_OUTLINE.test(readFileSync(SRC + rel, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')),
    );
    expect(callers.filter((rel) => !OUTLINE_CONSUMERS.includes(rel))).toEqual([]);
    const missing = OUTLINE_CONSUMERS.filter((rel) => !SHARED_OUTLINE.test(readFileSync(SRC + rel, 'utf8')));
    expect(missing).toEqual([]);
  });

  it('keeps kernel trigonometry in the ports that own it', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = file.slice(SRC.length).split('\\').join('/');
      if (ALLOWED.includes(rel)) continue;
      if (/Math\.(sin|cos|acos|asin)\(Math\.PI/.test(readFileSync(file, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe('the cut contour and the printed template are the same part', () => {
  const R = 0.012;

  const cases: Record<string, unknown>[] = [
    { type: 'ellipticalfinset', rootChord: 0.05, height: 0.03 },
    { type: 'ellipticalfinset', rootChord: 0.05, height: 0.03, tabHeight: 0.02, tabLength: 0.02 },
    { type: 'trapezoidfinset', rootChord: 0.06, tipChord: 0.03, sweep: 0.03, height: 0.05 },
    { type: 'trapezoidfinset', rootChord: 0.06, height: 0.05 },
    {
      type: 'freeformfinset',
      points: [
        [0.02, 0],
        [0.04, 0.04],
        [0.07, 0],
      ],
    },
  ];

  const ellipse = (root: number, height: number): number[][] =>
    Array.from({ length: KERNEL_ELLIPSE_POINTS }, (_, i) => {
      if (i === 0) return [0, 0];
      if (i === KERNEL_ELLIPSE_POINTS - 1) return [root, 0];
      const a = (Math.PI * (KERNEL_ELLIPSE_POINTS - 1 - i)) / (KERNEL_ELLIPSE_POINTS - 1);
      return [((Math.cos(a) + 1) / 2) * root, Math.sin(a) * height];
    });

  // A tab defaults to MIDDLE, offset 0, cut `min(tabHeight, getMaxTabHeight())` deep.
  const closedForms: ([number[][], number] | null)[] = [
    [ellipse(0.05, 0.03), 0.03],
    [[...ellipse(0.05, 0.03), [0.035, 0], [0.035, -R], [0.015, -R], [0.015, 0]], 0.03],
    [
      [
        [0, 0],
        [0.03, 0.05],
        [0.06, 0.05],
        [0.06, 0],
      ],
      0.05,
    ],
    null, // the fallback tip chord is an app default, not a kernel formula
    [
      [
        [0, 0],
        [0.02, 0.04],
        [0.05, 0],
      ],
      0.04,
    ],
  ];

  it.each(
    cases.flatMap((c, i) => {
      const form = closedForms[i];
      return form ? [[String(c['type']) + JSON.stringify(c['tabHeight'] ?? ''), c, form] as const] : [];
    }),
  )('prints the closed form for %s', (_label, props, [outline, span]) => {
    const template = finPlanformMm(node(props), R);
    expect(template.pts).toHaveLength(outline.length);
    template.pts.forEach(([x, y], j) => {
      expect(x, `point ${j}`).toBeCloseTo(outline[j]![0]! * 1000, 9);
      expect(y, `point ${j}`).toBeCloseTo((span - outline[j]![1]!) * 1000, 9);
    });
  });

  it.each(cases.map((c) => [String(c['type']) + JSON.stringify(c['tabHeight'] ?? ''), c] as const))(
    'agrees for %s',
    (_label, props) => {
      const n = node(props);
      const contour = finCutContour(n, R);
      const template = finPlanformMm(n, R);
      expect(contour).not.toBeNull();
      // y_mm = (height - y_m) * 1000.
      const height = finSpan(n);
      const fromTemplate = template.pts.map(([x, y]) => [x / 1000, height - y / 1000]);
      expect(fromTemplate).toHaveLength(contour!.length);
      for (let i = 0; i < contour!.length; i++) {
        expect(fromTemplate[i]![0]).toBeCloseTo(contour![i]![0], 9);
        expect(fromTemplate[i]![1]).toBeCloseTo(contour![i]![1], 9);
      }
    },
  );
});
