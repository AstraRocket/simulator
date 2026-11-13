// FreeformFinSet.intersects, which the kernel runs on every outline and the bridge turns into a failed build.
// Ported with its snapping (setPoints) and Line2D semantics (Geo2D), so the editor refuses what the kernel would.

type Pt = readonly [number, number];

const IGNORE_SMALLER_THAN = 1e-12;
const SNAP_LARGER_THAN = 2.5;

// Line2D.relativeCCW: collinear points off the segment get a non-zero sign.
function relativeCCW(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  x2 -= x1;
  y2 -= y1;
  px -= x1;
  py -= y1;
  let ccw = px * y2 - py * x2;
  if (ccw === 0) {
    ccw = px * x2 + py * y2;
    if (ccw > 0) {
      px -= x2;
      py -= y2;
      ccw = px * x2 + py * y2;
      if (ccw < 0) ccw = 0;
    }
  }
  return ccw < 0 ? -1 : ccw > 0 ? 1 : 0;
}

function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return (
    relativeCCW(a[0], a[1], b[0], b[1], c[0], c[1]) * relativeCCW(a[0], a[1], b[0], b[1], d[0], d[1]) <= 0 &&
    relativeCCW(c[0], c[1], d[0], d[1], a[0], a[1]) * relativeCCW(c[0], c[1], d[0], d[1], b[0], b[1]) <= 0
  );
}

// As setPoints moves the outline to the origin and snaps it inside 2.5 m. Holds on a body tube,
// where the kernel's clamps leave the editor's points as they are.
function asKernelSees(points: readonly Pt[]): Pt[] {
  const [dx, dy] = points[0]!;
  const moved = dx * dx + dy * dy > IGNORE_SMALLER_THAN ? points.map(([x, y]) => [x - dx, y - dy] as Pt) : points;
  // The y snap starts from the unsnapped point, so a point past both limits keeps its x.
  return moved.map(([x, y]) =>
    y > SNAP_LARGER_THAN ? ([x, SNAP_LARGER_THAN] as Pt) : ([Math.min(x, SNAP_LARGER_THAN), y] as Pt),
  );
}

/** True when the kernel would refuse this outline for crossing or touching itself. */
export function outlineCrossesItself(points: readonly Pt[]): boolean {
  const p = asKernelSees(points);
  const n = p.length;
  // Edges run point to point; the root closes along the body and is not one of them.
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      // A first and last point at one place meet there by design.
      const [fx, fy] = p[0]!;
      const [lx, ly] = p[n - 1]!;
      if (i === 0 && j === n - 2 && Math.hypot(fx - lx, fy - ly) < IGNORE_SMALLER_THAN) continue;
      if (segmentsIntersect(p[i]!, p[i + 1]!, p[j]!, p[j + 1]!)) return true;
    }
  }
  return false;
}
