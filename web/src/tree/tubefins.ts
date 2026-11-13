import type { ComponentNode } from '../engine/openRocketEngine';
import { FIN_SET_TYPES, PLANAR_FIN_TYPES, type FinSetType, type PlanarFinSetType } from './componentKinds';
import { KERNEL_DEFAULTS } from './kernelDefaults';
import { countOf, num, numOpt } from './nodeProps';
import { axialStart } from './position';

/**
 * Absent outerRadius: TubeFinSet.getOuterRadius's auto rule. A stored zero is a zero, unless
 * `outerRadiusAuto` is set: the bridge then turns automatic back on after the stated radius.
 */
export function tubeFinRadius(node: ComponentNode, bodyRadius: number): number {
  const explicit = numOpt(node, 'outerRadius');
  if (explicit !== undefined) return Math.max(explicit, 0);
  const n = countOf(node, 'finCount', KERNEL_DEFAULTS.tubefinset.finCount);
  // Under 3 fins auto-size to the body radius (TubeFinSet.getOuterRadius); n=2 would divide by zero.
  return tubeFinMaxRadius(n, bodyRadius) ?? bodyRadius;
}

/** Where a tube fin set sits: `radiusAt` gives the body radius at an offset from the parent's start. */
export function tubeFinSeat(node: ComponentNode, pStart: number, pLen: number, radiusAt: (offset: number) => number) {
  const length = num(node, 'length', KERNEL_DEFAULTS.tubefinset.length);
  const start = axialStart(node, length, pStart, pLen);
  const bodyRadius = radiusAt(start - pStart);
  return { length, start, bodyRadius, tubeRadius: tubeFinRadius(node, bodyRadius) };
}

export function tubeFinMaxRadius(finCount: number, bodyRadius: number): number | null {
  const n = Math.round(finCount);
  if (n < 3) return null;
  const s = Math.sin(Math.PI / n);
  return (bodyRadius * s) / (1 - s);
}

export function tubeFinMaxCount(outerRadius: number, bodyRadius: number): number {
  if (!(outerRadius > 0) || !(bodyRadius > 0)) return 2;
  const ratio = Math.min(1, outerRadius / (bodyRadius + outerRadius));
  return Math.max(2, Math.floor(Math.PI / Math.asin(ratio) + 1e-9));
}

/**
 * A stated radius too large for the set's count round the body: the largest radius and count that fit.
 * The 1e-9 lets an exactly-touching (legal) set through.
 */
export function tubeFinCollision(
  node: ComponentNode,
  bodyRadius: number,
): { maxRadius: number; maxCount: number } | null {
  const r = numOpt(node, 'outerRadius');
  if (r === undefined || !(bodyRadius > 0)) return null;
  const maxRadius = tubeFinMaxRadius(countOf(node, 'finCount', KERNEL_DEFAULTS.tubefinset.finCount), bodyRadius);
  if (maxRadius === null || !(r > maxRadius + 1e-9)) return null;
  return { maxRadius, maxCount: tubeFinMaxCount(r, bodyRadius) };
}

/** Tube fins included. */
export const isFinSet = (type: string): type is FinSetType => (FIN_SET_TYPES as ReadonlySet<string>).has(type);

/** Use this for anything that produces an outline, or a tube fin gets a fabricated trapezoid. */
export const isPlanarFinSet = (type: string): type is PlanarFinSetType =>
  (PLANAR_FIN_TYPES as ReadonlySet<string>).has(type);
