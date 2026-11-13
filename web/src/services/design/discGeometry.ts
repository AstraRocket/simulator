import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { innerTubeRadius, noseConeAftRadius, num, positionOf, transitionOuterRadius } from '../../tree/nodeProps';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import { partLength, startFromPosition } from '../../tree/position';
import { stationRadius } from '../../tree/shapeProfile';
import { clusterPlacesOf } from '../../tree/cluster';
import { parentStartOf } from '../../tree/axialRebase';
import { COMPONENT_DEFAULTS } from './componentDefaults';

// No three.js or writers here, so importing it does not pull the DXF serializer into first paint.

const FALLBACK_RADIUS = 0.012;

// Per type, so a bore is the same asked as the part or as the tube around something.
const TUBE_WALL = {
  bodytube: COMPONENT_DEFAULTS.bodytube.thickness,
  innertube: COMPONENT_DEFAULTS.innertube.thickness,
  tubecoupler: COMPONENT_DEFAULTS.tubecoupler.thickness,
} as const;

export interface Tube {
  outerR: number;
  innerR: number;
}
/** A transition gives its wider end. */
export function tubeRadii(node: ComponentNode): Tube | null {
  const t = node.type;
  if (t === 'bodytube' || t === 'innertube' || t === 'tubecoupler') {
    const built = t === 'tubecoupler' ? NaN : KERNEL_DEFAULTS[t].outerRadius;
    const or = num(node, 'outerRadius', built);
    // A filled body tube is solid: `BodyTube.getInnerRadius` is 0.
    if (t === 'bodytube' && node['filled'] === true && !Number.isNaN(or)) return { outerR: or, innerR: 0 };
    if (!Number.isNaN(or)) return { outerR: or, innerR: Math.max(0, or - num(node, 'thickness', TUBE_WALL[t])) };
  } else if (t === 'nosecone') {
    const ar = noseConeAftRadius(node);
    return { outerR: ar, innerR: Math.max(0, ar - num(node, 'thickness', COMPONENT_DEFAULTS.nosecone.thickness)) };
  } else if (t === 'transition') {
    const or = transitionOuterRadius(node);
    if (or > 0) {
      return { outerR: or, innerR: Math.max(0, or - num(node, 'thickness', COMPONENT_DEFAULTS.transition.thickness)) };
    }
  }
  return null;
}

export function plateOuter(node: ComponentNode, enclosing: Tube | null): number {
  const explicit = num(node, 'outerRadius', NaN);
  if (!Number.isNaN(explicit)) return explicit;
  if (enclosing && enclosing.innerR > 0) return enclosing.innerR;
  return FALLBACK_RADIUS;
}

/** `parentStart` is the parent's rocket-frame start, which an `absolute` child is measured against. */
function spanIn(child: ComponentNode, parent: ComponentNode, parentStart: number): [number, number] {
  const len = partLength(parent);
  const [start, end] = rawSpanIn(child, parent, parentStart);
  const clamp = (x: number) => Math.min(Math.max(x, 0), len);
  return [clamp(start), clamp(end)];
}

/** Unclamped: overhang included. */
function rawSpanIn(child: ComponentNode, parent: ComponentNode, parentStart: number): [number, number] {
  const start = startFromPosition(positionOf(child), partLength(child), partLength(parent), parentStart);
  return [start, start + partLength(child)];
}

function innerRadiusAt(parent: ComponentNode, x: number): number | null {
  if (parent.type === 'nosecone' || parent.type === 'transition') {
    const wall = num(parent, 'thickness', COMPONENT_DEFAULTS[parent.type].thickness);
    return Math.max(stationRadius(parent, x) - wall, 0);
  }
  return tubeRadii(parent)?.innerR ?? null;
}

export function boreAround(child: ComponentNode, parent: ComponentNode, parentStart: number): number | null {
  const [x0, x1] = spanIn(child, parent, parentStart);
  const a = innerRadiusAt(parent, x0);
  const b = innerRadiusAt(parent, x1);
  return a === null || b === null ? null : Math.min(a, b);
}

/** A ring's stated bore, else the mounts that pass through it (a tree not yet through `syncDerived`). */
export function statedOrRingBore(
  ring: ComponentNode,
  parent: ComponentNode | null,
  ringOuter: number,
  parentStart: number,
): number {
  const bore = num(ring, 'innerRadius', NaN);
  if (!Number.isNaN(bore)) return bore;
  return parent ? ringBore(ring, parent, ringOuter, parentStart) : 0;
}

export function ringBore(ring: ComponentNode, parent: ComponentNode, ringOuter: number, parentStart: number): number {
  let bore = 0;
  for (const tube of tubesThrough(ring, parent, parentStart)) bore = Math.max(bore, innerTubeRadius(tube));
  return Math.min(bore, ringOuter);
}

// Unclipped spans: an overhanging mount still misses a ring past its own end.
function tubesThrough(ring: ComponentNode, parent: ComponentNode, parentStart: number): ComponentNode[] {
  const [r0, r1] = rawSpanIn(ring, parent, parentStart);
  return (parent.children ?? []).filter((sib) => {
    if (sib.type !== 'innertube') return false;
    const [t0, t1] = rawSpanIn(sib, parent, parentStart);
    return !(r1 < t0 || r0 > t1);
  });
}

/** Kernel y/z frame, meters. */
export interface Hole {
  y: number;
  z: number;
  r: number;
}

/** Null for a stated bore or a single centered hole, which the plain bore already draws. */
function ringHoles(ring: ComponentNode, parent: ComponentNode, parentStart: number): Hole[] | null {
  if (ring.type !== 'centeringring') return null;
  if (ring['innerRadiusAuto'] !== true && typeof ring['innerRadius'] === 'number') return null;
  const holes: Hole[] = [];
  for (const tube of tubesThrough(ring, parent, parentStart)) {
    const r = innerTubeRadius(tube);
    for (const { radialPosition: d, radialDirection: dir } of clusterPlacesOf(tube)) {
      holes.push({ y: d * Math.cos(dir), z: d * Math.sin(dir), r });
    }
  }
  const centered = holes.length === 1 && Math.hypot(holes[0]!.y, holes[0]!.z) < 1e-9;
  return holes.length === 0 || centered ? null : holes;
}

export function nodeContext(
  tree: RocketTree,
  nodeId: string,
): { node: ComponentNode; enclosing: Tube | null; siblings: ComponentNode[]; parent: ComponentNode | null } | null {
  let found: {
    node: ComponentNode;
    enclosing: Tube | null;
    siblings: ComponentNode[];
    parent: ComponentNode | null;
  } | null = null;
  const walk = (
    node: ComponentNode,
    enclosing: Tube | null,
    siblings: ComponentNode[],
    parent: ComponentNode | null,
  ): boolean => {
    if (node.id === nodeId) {
      found = { node, enclosing, siblings, parent };
      return true;
    }
    const kids = node.children ?? [];
    const childEnclosing = tubeRadii(node) ?? enclosing; // a tube redefines the bore for its children
    for (const kid of kids) if (walk(kid, childEnclosing, kids, node)) return true;
    return false;
  };
  for (const stage of tree.components) {
    const kids = stage.type === 'stage' ? (stage.children ?? []) : [stage];
    for (const kid of kids) if (walk(kid, tubeRadii(kid) ?? null, kids, stage.type === 'stage' ? stage : null)) break;
  }
  return found;
}

export function ringHolesIn(
  tree: RocketTree,
  ctx: { node: ComponentNode; parent: ComponentNode | null },
): Hole[] | null {
  return ctx.parent ? ringHoles(ctx.node, ctx.parent, parentStartOf(tree, ctx.parent)) : null;
}

/** `holes`, when set, replaces the centered bore. */
export function resolveDisc(
  tree: RocketTree,
  nodeId: string,
): { outerR: number; innerR: number; length: number; holes: Hole[] | null } | null {
  const ctx = nodeContext(tree, nodeId);
  const dims = ctx
    ? discDims(ctx.node, ctx.enclosing, ctx.parent, ctx.parent ? parentStartOf(tree, ctx.parent) : 0)
    : null;
  return ctx && dims ? { ...dims, holes: ringHolesIn(tree, ctx) } : null;
}

export function discDims(
  node: ComponentNode,
  enclosing: Tube | null,
  parent: ComponentNode | null,
  parentStart: number,
): { outerR: number; innerR: number; length: number } | null {
  const outerR = plateOuter(node, enclosing);
  if (node.type === 'bulkhead') {
    return { outerR, innerR: 0, length: num(node, 'length', COMPONENT_DEFAULTS.bulkhead.length) };
  }
  if (node.type === 'centeringring') {
    const innerR = statedOrRingBore(node, parent, outerR, parentStart);
    return { outerR, innerR, length: num(node, 'length', COMPONENT_DEFAULTS.centeringring.length) };
  }
  if (node.type === 'tubecoupler' || node.type === 'engineblock') {
    const wall = num(
      node,
      'thickness',
      node.type === 'engineblock' ? COMPONENT_DEFAULTS.engineblock.thickness : COMPONENT_DEFAULTS.tubecoupler.thickness,
    );
    const length = num(
      node,
      'length',
      node.type === 'engineblock' ? COMPONENT_DEFAULTS.engineblock.length : COMPONENT_DEFAULTS.tubecoupler.length,
    );
    // Wall equal to the radius is a legitimately solid part; a thicker one is refused.
    if (!(wall <= outerR)) return null;
    return { outerR, innerR: outerR - wall, length };
  }
  return null;
}

// Not `tubeRadii`, which takes a transition's wider end and would misfit a boat tail's fore shoulder.
export function boreAt(node: ComponentNode, end: 'fore' | 'aft'): number | null {
  const e = endAt(node, end);
  return e && e.outer > 0 && e.wall < e.outer ? e.outer - e.wall : null;
}

/** Null for a filled part, a nose cone's tip, or anything that is not airframe. */
export function endAt(node: ComponentNode, end: 'fore' | 'aft'): { outer: number; wall: number } | null {
  if (node['filled'] === true) return null;
  const at = (outer: number, dflt: number) => ({ outer, wall: num(node, 'thickness', dflt) });
  switch (node.type) {
    case 'bodytube':
    case 'innertube':
      return at(num(node, 'outerRadius', KERNEL_DEFAULTS[node.type].outerRadius), TUBE_WALL[node.type]);
    case 'tubecoupler':
      return at(num(node, 'outerRadius', NaN), TUBE_WALL[node.type]);
    case 'transition':
      return at(num(node, end === 'fore' ? 'foreRadius' : 'aftRadius', NaN), COMPONENT_DEFAULTS.transition.thickness);
    case 'nosecone': {
      // A flipped cone's base is its fore end (`NoseCone.getBaseRadius`).
      const base = node['flipped'] === true ? 'fore' : 'aft';
      return end === base ? at(noseConeAftRadius(node), COMPONENT_DEFAULTS.nosecone.thickness) : null;
    }
    default:
      return null;
  }
}
