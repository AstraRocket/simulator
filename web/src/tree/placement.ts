import type { ComponentNode } from '../engine/openRocketEngine';
import { clusterPlacesOf } from './cluster';
import { countOf, num, positionOf } from './nodeProps';
import { defaultSeparation } from './kernelDefaults';

const LINE_INSTANCE_TYPES: ReadonlySet<string> = new Set(['centeringring', 'bulkhead', 'launchlug', 'railbutton']);

/** Copy i sits `i × instanceSeparation` behind the first, whatever the axial method. */
export function lineInstances(node: ComponentNode): ComponentNode[] {
  if (!LINE_INSTANCE_TYPES.has(node.type)) return [node];
  const count = countOf(node, 'instanceCount', 1);
  if (count === 1) return [node];
  const separation = num(node, 'instanceSeparation', defaultSeparation(node.type));
  const pos = positionOf(node);
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? node : { ...node, position: { ...pos, offset: pos.offset + i * separation } },
  );
}

/** y = r cos θ, z = r sin θ. */
export function placementOffsets(node: ComponentNode, tubeOuterRadius: number): { y: number; z: number }[] {
  const radialPosition = num(node, 'radialPosition', 0);
  const radialDirection = num(node, 'radialDirection', 0);
  if (node.type === 'innertube') {
    return clusterPlacesOf(node, tubeOuterRadius).map((p) => ({
      y: p.radialPosition * Math.cos(p.radialDirection),
      z: p.radialPosition * Math.sin(p.radialDirection),
    }));
  }
  return [{ y: radialPosition * Math.cos(radialDirection), z: radialPosition * Math.sin(radialDirection) }];
}

/** `Transformation.rotate_x` (Transformation.java:263-271). */
export function turnedOffset(off: { y: number; z: number }, angle: number): { y: number; z: number } {
  if (angle === 0) return { y: off.y, z: off.z };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { y: off.y * c - off.z * s, z: off.y * s + off.z * c };
}
