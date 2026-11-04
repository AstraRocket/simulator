import { bearingFromPad, distanceFromPad, type GroundPoint } from './groundTrack';
import { degToRad } from '../../prefs/units';

// The ellipse is scatter at N sigma, not a confidence region: a grid sweep asserts no distribution.

export const DEFAULT_SIGMA = 2;

export function centroid(points: readonly GroundPoint[]): GroundPoint | null {
  if (!points.length) return null;
  let east = 0;
  let north = 0;
  for (const p of points) {
    east += p.east;
    north += p.north;
  }
  return { east: east / points.length, north: north / points.length };
}

const cross = (o: GroundPoint, a: GroundPoint, b: GroundPoint): number =>
  (a.east - o.east) * (b.north - o.north) - (a.north - o.north) * (b.east - o.east);

// Collinear points are dropped (`<= 0`), so a one-heading sweep returns its two ends as a segment.
export function convexHull(points: readonly GroundPoint[]): GroundPoint[] {
  const pts = [...points].sort((a, b) => a.east - b.east || a.north - b.north);
  // Duplicate landings are common and upset the turn test.
  const uniq = pts.filter((p, i) => i === 0 || p.east !== pts[i - 1]!.east || p.north !== pts[i - 1]!.north);
  if (uniq.length < 3) return uniq;

  const half = (source: GroundPoint[]): GroundPoint[] => {
    const out: GroundPoint[] = [];
    for (const p of source) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop(); // the shared endpoint, contributed by the other half
    return out;
  };

  const hull = [...half(uniq), ...half([...uniq].reverse())];
  // All collinear: return the segment, not a zero-area ring of four.
  return hull.length >= 3 ? hull : uniq.slice(0, 1).concat(uniq.slice(-1));
}

export function polygonArea(points: readonly GroundPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.east * b.north - b.east * a.north;
  }
  return Math.abs(sum) / 2;
}

export interface DriftEllipse {
  center: GroundPoint;
  semiMajorM: number;
  semiMinorM: number;
  /** Long axis, degrees clockwise from north. */
  bearingDeg: number;
  sigma: number;
}

// Sample covariance (n-1).
export function driftEllipse(points: readonly GroundPoint[], sigma = DEFAULT_SIGMA): DriftEllipse | null {
  const center = centroid(points);
  if (!center || points.length < 2) return null;

  let see = 0;
  let snn = 0;
  let sen = 0;
  for (const p of points) {
    const de = p.east - center.east;
    const dn = p.north - center.north;
    see += de * de;
    snn += dn * dn;
    sen += de * dn;
  }
  const n = points.length - 1;
  see /= n;
  snn /= n;
  sen /= n;

  const mean = (see + snn) / 2;
  // Clamped: float error can push the discriminant a hair below zero (NaN sqrt).
  const gap = Math.sqrt(Math.max(0, ((see - snn) / 2) ** 2 + sen * sen));
  const major = Math.max(0, mean + gap);
  const minor = Math.max(0, mean - gap);

  // With no covariance the formula would give (0, 0) and call a north-south spread east-west.
  const [ve, vn] = sen !== 0 ? [major - snn, sen] : see >= snn ? [1, 0] : [0, 1];

  return {
    center,
    semiMajorM: sigma * Math.sqrt(major),
    semiMinorM: sigma * Math.sqrt(minor),
    bearingDeg: bearingFromPad({ east: ve, north: vn }),
    sigma,
  };
}

// A polygon, not a rotated SVG `<ellipse>`, so it stays right when the view's axes do not share a scale.
export function ellipsePolygon(e: DriftEllipse, segments = 72): GroundPoint[] {
  const rad = degToRad(e.bearingDeg);
  const me = Math.sin(rad);
  const mn = Math.cos(rad);
  // Minor axis: (e, n) -> (-n, e).
  return Array.from({ length: segments }, (_, i) => {
    const th = (2 * Math.PI * i) / segments;
    const a = e.semiMajorM * Math.cos(th);
    const b = e.semiMinorM * Math.sin(th);
    return { east: e.center.east + a * me - b * mn, north: e.center.north + a * mn + b * me };
  });
}

export interface DriftRegion {
  branch: number;
  samples: GroundPoint[];
  centroid: GroundPoint;
  /** Two points for a collinear sweep. */
  hull: GroundPoint[];
  ellipse: DriftEllipse | null;
  maxRangeM: number;
  minRangeM: number;
  areaM2: number;
}

export function driftRegion(
  branch: number,
  samples: readonly GroundPoint[],
  sigma = DEFAULT_SIGMA,
): DriftRegion | null {
  const center = centroid(samples);
  if (!center) return null;
  const ranges = samples.map(distanceFromPad);
  const hull = convexHull(samples);
  return {
    branch,
    samples: [...samples],
    centroid: center,
    hull,
    ellipse: driftEllipse(samples, sigma),
    maxRangeM: Math.max(...ranges),
    minRangeM: Math.min(...ranges),
    areaM2: polygonArea(hull),
  };
}

export function sweepRegions(
  landings: readonly ({ branch: number } & GroundPoint)[],
  sigma = DEFAULT_SIGMA,
): DriftRegion[] {
  const byBranch = new Map<number, GroundPoint[]>();
  for (const l of landings) {
    const at = byBranch.get(l.branch);
    const p = { east: l.east, north: l.north };
    if (at) at.push(p);
    else byBranch.set(l.branch, [p]);
  }
  return [...byBranch.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([branch, points]) => driftRegion(branch, points, sigma))
    .filter((r): r is DriftRegion => r !== null);
}
