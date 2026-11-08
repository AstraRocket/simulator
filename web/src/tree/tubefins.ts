import type { ComponentNode } from '../engine/openRocketEngine';
import { FIN_SET_TYPES, PLANAR_FIN_TYPES, type FinSetType, type PlanarFinSetType } from './componentKinds';
import { KERNEL_DEFAULTS } from './kernelDefaults';
import { countOf, numOpt } from './nodeProps';

/** Absent outerRadius: TubeFinSet.getOuterRadius's auto rule. A stored zero is a zero. */
export function tubeFinRadius(node: ComponentNode, bodyRadius: number): number {
  const explicit = numOpt(node, 'outerRadius');
  if (explicit !== undefined) return Math.max(explicit, 0);
  const n = countOf(node, 'finCount', KERNEL_DEFAULTS.tubefinset.finCount);
  // Under 3 fins auto-size to the body radius (TubeFinSet.getOuterRadius); n=2 would divide by zero.
  return tubeFinMaxRadius(n, bodyRadius) ?? bodyRadius;
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

/** Tube fins included. */
export const isFinSet = (type: string): type is FinSetType => (FIN_SET_TYPES as ReadonlySet<string>).has(type);

/** Use this for anything that produces an outline, or a tube fin gets a fabricated trapezoid. */
export const isPlanarFinSet = (type: string): type is PlanarFinSetType =>
  (PLANAR_FIN_TYPES as ReadonlySet<string>).has(type);
