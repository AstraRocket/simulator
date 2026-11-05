import type { ComponentNode } from '../engine/openRocketEngine';
import { KERNEL_DEFAULTS } from './kernelDefaults';
import { num } from './nodeProps';

// Exact mirror of kernel ClusterConfiguration; separation is 2 × tubeOuterRadius × clusterScale.

const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);
const R5 = 1.0 / (2 * Math.sin((2 * Math.PI) / 10));
const ring = (n: number, r: number, centered: boolean): number[] => {
  const pts: number[] = centered ? [0, 0] : [];
  for (let i = 0; i < n; i++) {
    pts.push(r * Math.sin((2 * Math.PI * i) / n), r * Math.cos((2 * Math.PI * i) / n));
  }
  return pts;
};

/** Kernel XML names (ClusterConfiguration.java). */
export type ClusterPattern =
  | 'single'
  | 'double'
  | '3-row'
  | '4-row'
  | '3-ring'
  | '4-ring'
  | '5-ring'
  | '6-ring'
  | '3-star'
  | '4-star'
  | '5-star'
  | '6-star'
  | '9-grid'
  | '9-star';

/** Flat [x0,y0, x1,y1, …] unit points. */
export const CLUSTER_POINTS: Record<ClusterPattern, number[]> = {
  single: [0, 0],
  double: [-0.5, 0, 0.5, 0],
  '3-row': [-1, 0, 0, 0, 1, 0],
  '4-row': [-1.5, 0, -0.5, 0, 0.5, 0, 1.5, 0],
  '3-ring': [-0.5, -1 / (2 * SQRT3), 0.5, -1 / (2 * SQRT3), 0, 1 / SQRT3],
  '4-ring': [-0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5],
  '5-ring': ring(5, R5, false),
  '6-ring': [0, 1, SQRT3 / 2, 0.5, SQRT3 / 2, -0.5, 0, -1, -SQRT3 / 2, -0.5, -SQRT3 / 2, 0.5],
  '3-star': [0, 0, 0, 1, SQRT3 / 2, -0.5, -SQRT3 / 2, -0.5],
  '4-star': [0, 0, -1 / SQRT2, 1 / SQRT2, 1 / SQRT2, 1 / SQRT2, 1 / SQRT2, -1 / SQRT2, -1 / SQRT2, -1 / SQRT2],
  '5-star': ring(5, 1, true),
  '6-star': [0, 0, 0, 1, SQRT3 / 2, 0.5, SQRT3 / 2, -0.5, 0, -1, -SQRT3 / 2, -0.5, -SQRT3 / 2, 0.5],
  '9-grid': [-1.4, 1.4, 0, 1.4, 1.4, 1.4, -1.4, 0, 0, 0, 1.4, 0, -1.4, -1.4, 0, -1.4, 1.4, -1.4],
  '9-star': [
    0,
    0,
    1.4,
    0,
    1.4 / SQRT2,
    -1.4 / SQRT2,
    0,
    -1.4,
    -1.4 / SQRT2,
    -1.4 / SQRT2,
    -1.4,
    0,
    -1.4 / SQRT2,
    1.4 / SQRT2,
    0,
    1.4,
    1.4 / SQRT2,
    1.4 / SQRT2,
  ],
};

/** Kernel order. */
export const CLUSTER_OPTIONS: ClusterPattern[] = Object.keys(CLUSTER_POINTS) as ClusterPattern[];

export const isClusterPattern = (v: unknown): v is ClusterPattern =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(CLUSTER_POINTS, v);

function pointsOf(cluster: string | undefined): number[] {
  return isClusterPattern(cluster) ? CLUSTER_POINTS[cluster] : CLUSTER_POINTS.single;
}

export function clusterCount(cluster: string | undefined): number {
  return pointsOf(cluster).length / 2;
}

// Meters, rotated by R(−θ) as ClusterConfiguration.java:108-119; R(+θ) turns it 2θ the wrong way.
// No radial offset: real placement uses `clusterPoints`.
export function clusterOffsets(
  cluster: string | undefined,
  tubeOuterRadius: number,
  clusterScale = 1,
  clusterRotation = 0,
): { y: number; z: number }[] {
  const pts = pointsOf(cluster);
  const separation = 2 * tubeOuterRadius * clusterScale;
  const cos = Math.cos(clusterRotation);
  const sin = Math.sin(clusterRotation);
  const out: { y: number; z: number }[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    // px/py, not x/y: `y: (x * cos ...)` reads as a self-reference and hides a sign error.
    const px = pts[i]!;
    const py = pts[i + 1]!;
    out.push({
      y: (px * cos + py * sin) * separation,
      z: (-px * sin + py * cos) * separation,
    });
  }
  return out;
}

/**
 * As InnerTube.getClusterPoints (InnerTube.java:263-273): rotated by
 * `clusterRotation − radialDirection`, then shifted by the mount's radial offset.
 */
export function clusterPoints(
  cluster: string | undefined,
  tubeOuterRadius: number,
  clusterScale = 1,
  clusterRotation = 0,
  radialPosition = 0,
  radialDirection = 0,
): { radialPosition: number; radialDirection: number }[] {
  const baseY = radialPosition * Math.cos(radialDirection);
  const baseZ = radialPosition * Math.sin(radialDirection);
  return clusterOffsets(cluster, tubeOuterRadius, clusterScale, clusterRotation - radialDirection).map((o) => {
    const y = o.y + baseY;
    const z = o.z + baseZ;
    return { radialPosition: Math.hypot(y, z), radialDirection: Math.atan2(z, y) };
  });
}

/** A mount with no `outerRadius` flies at the kernel's inner tube default. */
export function clusterPlacesOf(node: ComponentNode): { radialPosition: number; radialDirection: number }[] {
  return clusterPoints(
    typeof node['cluster'] === 'string' ? node['cluster'] : undefined,
    num(node, 'outerRadius', KERNEL_DEFAULTS.innertube.outerRadius),
    num(node, 'clusterScale', 1),
    num(node, 'clusterRotation', 0),
    num(node, 'radialPosition', 0),
    num(node, 'radialDirection', 0),
  );
}
