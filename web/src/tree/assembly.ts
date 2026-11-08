import type { ComponentNode } from '../engine/openRocketEngine';
import { ASSEMBLY_TYPES, isChainType, type AssemblyType } from './componentKinds';
import { kernelLength } from './kernelDefaults';
import { bodyTubeRadius, chainOuterRadius, num } from './nodeProps';

// SI units. Mirrors PodSet getInstanceOffsets: y = r·cosθ, z = r·sinθ.

// Repeats `partLength`'s kernel default because position.ts imports this module.
export function assemblyChainLength(pod: ComponentNode): number {
  return (pod.children ?? [])
    .filter((c) => isChainType(c.type))
    .reduce((s, c) => s + num(c, 'length', kernelLength(c.type) ?? 0), 0);
}

/** Meters. */
export function assemblyBoundingRadius(pod: ComponentNode): number {
  let r = 0;
  for (const c of pod.children ?? []) r = Math.max(r, chainOuterRadius(c));
  return r;
}

// As `RadiusMethod.getRadius`; a `relative` offset is a gap from the parent surface.
export function resolveAssemblyRadius(pod: ComponentNode, parentOuterRadius: number): number {
  const offset = num(pod, 'radiusOffset', 0);
  const method = typeof pod['radiusMethod'] === 'string' ? pod['radiusMethod'] : 'relative';
  if (method === 'free') return offset;
  if (method === 'coaxial') return 0;
  if (method === 'surface') return parentOuterRadius + assemblyBoundingRadius(pod);
  return offset + parentOuterRadius + assemblyBoundingRadius(pod);
}

/** 0 for anything but a body tube: `RadiusMethod` reads only `BodyTube.getOuterRadius`. */
export function assemblyParentRadius(parent: ComponentNode | null | undefined): number {
  return parent?.type === 'bodytube' ? bodyTubeRadius(parent) : 0;
}

export interface RingInstance {
  y: number;
  z: number;
  angle: number;
}

/** `angleOffset` in radians. The 2D view projects `y` and ignores `z`. */
export function ringInstanceOffsets(count: number, radius: number, angleOffset = 0): RingInstance[] {
  const n = Math.max(1, Math.round(count));
  const out: RingInstance[] = [];
  for (let i = 0; i < n; i++) {
    const angle = angleOffset + (2 * Math.PI * i) / n;
    out.push({ y: radius * Math.cos(angle), z: radius * Math.sin(angle), angle });
  }
  return out;
}

export function isAssembly(type: string): type is AssemblyType {
  return (ASSEMBLY_TYPES as ReadonlySet<string>).has(type);
}
