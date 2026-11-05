import type { ComponentNode, RocketTree } from '../engine/openRocketEngine';
import { bodyTubeRadius, finCant, num, positionOf } from './nodeProps';
import { findWithParent } from './treeWalk';
import { parentStartOf } from './axialRebase';
import { axialLength, freeformPoints, freeformRootChord, partLength, startFromPosition } from './position';
import { nodeShape, stationRadius } from './shapeProfile';
import { isFinSet, isPlanarFinSet } from './tubefins';
import { FIN_DEFAULTS, KERNEL_DEFAULTS } from './kernelDefaults';
import { isZero } from '../services/motors/mathEquals';

/**
 * The single source for fin outlines; do not sample one elsewhere (a sine-arch ellipse is 94% off at
 * some stations). The root follows the parent's profile (`FinSet.getRootPoints`), not y = 0.
 */

/** `EllipticalFinSet.POINTS`. Not tunable: the kernel flies a 31-point polygon. */
export const KERNEL_ELLIPSE_POINTS = 31;

export const FREEFORM_FALLBACK: [number, number][] = [
  [0, 0],
  [0.02, 0.03],
  [0.05, 0],
];

/** `MathUtil.max(length, 0.0001)`. */
const MIN_ROOT = 0.0001;

/** `x` is `(1 - cos(pi*t))/2`, not linear in `t`, as `EllipticalFinSet` builds it. */
export function ellipticalFinPoints(rootChord: number, height: number): [number, number][] {
  const len = Math.max(rootChord, MIN_ROOT);
  const n = KERNEL_ELLIPSE_POINTS;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (n - 1 - i)) / (n - 1);
    pts.push([((Math.cos(a) + 1) / 2) * len, Math.sin(a) * height]);
  }
  // The kernel pins the endpoints rather than trusting cos(pi) / sin(0).
  pts[0] = [0, 0];
  pts[n - 1] = [len, 0];
  return pts;
}

export function trapezoidDims(node: ComponentNode): { root: number; tip: number; sweep: number; height: number } {
  return {
    root: num(node, 'rootChord', FIN_DEFAULTS.rootChord),
    tip: num(node, 'tipChord', FIN_DEFAULTS.tipChord),
    sweep: num(node, 'sweep', FIN_DEFAULTS.sweep),
    height: num(node, 'height', FIN_DEFAULTS.height),
  };
}

/** `TrapezoidFinSet.getFinPoints()`. A tip chord at or below 0.0001 m emits a triangle. */
export function trapezoidFinPoints(node: ComponentNode): [number, number][] {
  const { root, tip, sweep, height } = trapezoidDims(node);
  return trapezoidPoints(root, tip, sweep, height);
}

export function trapezoidPoints(root: number, tip: number, sweep: number, height: number): [number, number][] {
  const pts: [number, number][] = [
    [0, 0],
    [sweep, height],
  ];
  if (tip > 0.0001) pts.push([sweep + tip, height]);
  pts.push([Math.max(root, MIN_ROOT), 0]);
  return pts;
}

/** Freeform outlines start at the origin, as `FreeformFinSet.setPoints()` stores them; tab coordinates are relative to that. */
export function finPlanformPoints(node: ComponentNode): [number, number][] | null {
  if (node.type === 'freeformfinset') {
    const ff = freeformPoints(node);
    return ff.length >= 3 ? ff : null;
  }
  if (node.type === 'ellipticalfinset') {
    return ellipticalFinPoints(finRootChord(node), finSpan(node));
  }
  if (node.type === 'trapezoidfinset') return trapezoidFinPoints(node);
  return null;
}

/** One side's area (m²). */
export function finPlanformArea(pts: readonly (readonly [number, number])[]): number {
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    twice += x0 * y1 - x1 * y0;
  }
  return Math.abs(twice) / 2;
}

/** Freeform: `last.x - first.x` (`FreeformFinSet.length`), not the furthest-aft point. */
export function finRootChord(node: ComponentNode, fallback: number = FIN_DEFAULTS.rootChord): number {
  if (node.type === 'freeformfinset') {
    const ff = freeformPoints(node);
    if (ff.length) return freeformRootChord(ff, fallback);
  }
  return num(node, 'rootChord', fallback);
}

/** Freeform with a parent: `FreeformFinSet.getSpan` over the uncanted outline. */
export function finSpan(node: ComponentNode, parent: FinParent = null): number {
  if (node.type === 'freeformfinset') {
    const stored = parent === null ? null : finOutlinePoints({ ...node, cant: 0 }, parent);
    if (stored) {
      let max = 0;
      for (const p of stored) if (Number.isFinite(p[1]) && p[1] > max) max = p[1];
      const last = stored[stored.length - 1]![1];
      return max - Math.min(Number.isFinite(last) ? last : 0, 0);
    }
    const ff = freeformPoints(node);
    if (ff.length) {
      // A loop, not `Math.max(...ff.map())`: spreading a huge outline overflows the stack.
      let max = 0;
      for (const p of ff) if (Number.isFinite(p[1]) && p[1] > max) max = p[1];
      return max;
    }
  }
  // Per-type constructor height: EllipticalFinSet() 0.05 m, TrapezoidFinSet() 0.03 m.
  return num(
    node,
    'height',
    node.type === 'ellipticalfinset' ? KERNEL_DEFAULTS.ellipticalfinset.height : FIN_DEFAULTS.height,
  );
}

/** Height clamped as `FinSet.setTabHeight()`; the span is not clamped into the root chord (the kernel does not). */
export function finTabSpan(
  node: ComponentNode,
  rootChord: number,
  parentRadius: number | null,
): { x0: number; x1: number; height: number } | null {
  const maxH = parentRadius != null && Number.isFinite(parentRadius) ? parentRadius : Infinity;
  const height = Math.min(num(node, 'tabHeight', 0), maxH);
  const length = num(node, 'tabLength', 0);
  if (!(height > 0) || !(length > 0)) return null;
  const x0 = finTabFrontEdge(node, rootChord);
  const x1 = x0 + length;
  if (!(x1 - x0 > 1e-9) || !Number.isFinite(x0)) return null;
  return { x0, x1, height };
}

/** `FinSet.getTabFrontEdge()`. */
function finTabFrontEdge(node: ComponentNode, rootChord: number): number {
  const method = typeof node['tabOffsetMethod'] === 'string' ? node['tabOffsetMethod'] : 'middle';
  return tabPosition(num(node, 'tabOffset', 0), num(node, 'tabLength', 0), rootChord, method);
}

/** `AxialMethod.getAsPosition(offset, tabLength, rootChord)`. */
export function tabPosition(offset: number, tabLen: number, rootChord: number, method: string): number {
  if (method === 'top' || method === 'absolute') return offset;
  if (method === 'after') return rootChord + offset;
  if (method === 'bottom') return offset + (rootChord - tabLen);
  return offset + (rootChord - tabLen) / 2;
}

/** `AxialMethod.getAsOffset(position, tabLength, rootChord)`. */
function tabOffsetAt(position: number, tabLen: number, rootChord: number, method: string): number {
  if (method === 'top' || method === 'absolute') return position;
  if (method === 'after') return position - rootChord;
  if (method === 'bottom') return position + (tabLen - rootChord);
  return position + (tabLen - rootChord) / 2;
}

/** x from the fin front, y from the body surface under it (m). */
type Pt = [number, number];

export interface FinMount {
  /** From the parent's fore end (m); outside the part reads the nearer end. */
  radiusAt: (x: number) => number;
  length: number;
  /** From the parent's fore end (m). */
  front: number;
  /** The kernel samples the root every 2.5 mm instead of one segment. */
  curved: boolean;
}

export type FinParent = FinMount | number | null;

/** `FinSet.MAX_ROOT_DIVISIONS`. */
const MAX_ROOT_DIVISIONS = 100;
const ROOT_STEP = 0.0025;
/** `MathUtil.EPSILON`. */
const EPSILON = 1e-8;

const samePoint = (a: Pt, b: Pt): boolean => Math.abs(a[0] - b[0]) <= 1e-12 && Math.abs(a[1] - b[1]) <= 1e-12;

/** A flipped nose cone's base is its fore end. */
export function bodyRadiusAt(parent: ComponentNode, x: number): number | null {
  if (parent.type === 'bodytube') return bodyTubeRadius(parent);
  if (parent.type === 'nosecone' || parent.type === 'transition') return stationRadius(parent, x);
  return null;
}

/** `FinSet.getInstanceOffsets`: (chord / 2)(1 - cos cant). */
export function cantFrontShift(fin: ComponentNode, chord: number): number {
  return (chord / 2) * (1 - Math.cos(finCant(fin)));
}

export function finMount(fin: ComponentNode, parent: ComponentNode, parentStart: number): FinMount | null {
  if (bodyRadiusAt(parent, 0) === null) return null;
  const length = partLength(parent);
  return {
    radiusAt: (x) => bodyRadiusAt(parent, x) ?? 0,
    length,
    front: startFromPosition(positionOf(fin), axialLength(fin), length, parentStart),
    curved: parent.type !== 'bodytube' && nodeShape(parent) !== 'conical',
  };
}

export function finMountOf(tree: RocketTree, nodeId: string): FinMount | null {
  for (const stage of tree.components) {
    const hit = findWithParent(stage.children ?? [], nodeId, stage);
    if (!hit) continue;
    if (!hit.parent || !isFinSet(hit.node.type)) return null;
    return finMount(hit.node, hit.parent, parentStartOf(tree, hit.parent));
  }
  return null;
}

function resolveMount(parent: FinParent): { mount: FinMount; clamp: boolean } {
  if (parent !== null && typeof parent === 'object') return { mount: parent, clamp: true };
  const finite = typeof parent === 'number' && Number.isFinite(parent);
  const r = finite ? parent : 0;
  return { mount: { radiusAt: () => r, length: Infinity, front: 0, curved: false }, clamp: finite };
}

export function mountRadius(parent: FinParent): number | null {
  if (parent === null) return null;
  return typeof parent === 'number' ? parent : parent.radiusAt(parent.front);
}

/** `FinSet.getFinCantYOffset`, but returns 0 where the kernel takes sqrt of a negative (NaN). */
function cantYOffset(mount: FinMount, cant: number, xStart: number, xEnd: number, xCurr: number): number {
  const L = mount.length;
  if (isZero(cant) || (xStart > L && xEnd > L) || (xStart < 0 && xEnd < 0)) return 0;
  const x = Math.min(Math.max(xCurr, 0), L);
  const xCenter = (xStart + xEnd) / 2;
  const dx = x - xCenter;
  const r = mount.radiusAt(xCenter + dx * Math.abs(Math.cos(cant)));
  const dz = Math.abs(Math.sin(cant)) * dx;
  if (Math.abs(dz) >= r) return 0;
  return -(r - Math.sqrt(r * r - dz * dz));
}

/** `FinSet.getRootPoints()`. */
export function finRootPoints(fin: ComponentNode, parent: FinParent): Pt[] {
  const { mount } = resolveMount(parent);
  const xStart = mount.front;
  // A negative chord is sampled as zero (TrapezoidFinSet.java:90).
  const len = Math.max(finRootChord(fin), 0);
  const xEnd = xStart + len;
  const cant = finCant(fin);
  // End less start, as the kernel takes it: float noise can add a step.
  const interval = xEnd - xStart;
  const divisions = !isZero(cant) || mount.curved ? Math.min(MAX_ROOT_DIVISIONS, Math.ceil(interval / ROOT_STEP)) : 1;
  const step = interval / divisions;
  const points: Pt[] = [];
  // Repeated addition, as the kernel steps, to match it to the last bit.
  let x = xStart;
  for (let i = 0; i < divisions + 1; i++) {
    points.push([x, mount.radiusAt(x) + cantYOffset(mount, cant, xStart, xEnd, x)]);
    x += step;
  }
  const insertAt = (at: number, y: number) => {
    if (points.some(([px]) => Math.abs(px - at) < EPSILON)) return;
    let i = 0;
    while (i < points.length && points[i]![0] < at) i++;
    points.splice(i, 0, [at, y]);
  };
  if (xStart < 0 && xEnd > 0) insertAt(0, points[0]![1]);
  if (xEnd > mount.length && xStart < mount.length) insertAt(mount.length, points[points.length - 1]![1]);
  const last = points[points.length - 1]!;
  if (Math.abs(last[0] - mount.length) < EPSILON) last[0] = mount.length;
  const yFront = mount.radiusAt(xStart);
  if (Math.abs(xStart) + Math.abs(yFront) <= EPSILON) return points;
  return points.map(([px, py]) => [px - xStart, py - yFront]);
}

/** `getFinPoints()`, with freeform interior points raised out of the parent (`clampInteriorPoint`). */
export function finOutlinePoints(fin: ComponentNode, parent: FinParent): Pt[] | null {
  const top = finPlanformPoints(fin);
  if (!top) return null;
  const root = finRootPoints(fin, parent);
  const out = top.map(([x, y]): Pt => [x, y]);
  const { mount, clamp } = resolveMount(parent);
  if (fin.type === 'freeformfinset' && clamp) {
    const yFin = mount.radiusAt(mount.front);
    for (let i = 1; i < out.length - 1; i++) {
      const [x, y] = out[i]!;
      if (x < -mount.front || x > -mount.front + mount.length) continue;
      const yBody = mount.radiusAt(x + mount.front) - yFin;
      if (yBody > y) out[i] = [x, yBody];
    }
  }
  // An end within float noise of the root keeps its value: (front + root) - front would nudge it.
  const onto = (i: number, p: Pt) => {
    if (!samePoint(out[i]!, p)) out[i] = [p[0], p[1]];
  };
  if (root.length > 1) {
    onto(0, root[0]!);
    onto(out.length - 1, root[root.length - 1]!);
  }
  return out;
}

/** `FinSet.getTabPoints()`. */
export function finTabPoints(fin: ComponentNode, parent: FinParent): Pt[] | null {
  const { mount, clamp } = resolveMount(parent);
  const tab = finTabSpan(fin, finRootChord(fin), clamp ? mountTabLimit(fin, mount) : null);
  if (!tab) return null;
  const yFin = mount.radiusAt(mount.front);
  const yFront = mount.radiusAt(mount.front + tab.x0) - yFin;
  const yTrail = mount.radiusAt(mount.front + tab.x1) - yFin;
  const yBottom = Math.min(yFront, yTrail) - tab.height;
  return [
    [tab.x0, yFront],
    [tab.x0, yBottom],
    [tab.x1, yBottom],
    [tab.x1, yTrail],
  ];
}

function appendRoot(out: Pt[], pts: readonly Pt[]): void {
  const before = out.length;
  for (const p of pts) if (!samePoint(out[out.length - 1]!, p)) out.push(p);
  if (out.length > before && samePoint(out[0]!, out[out.length - 1]!)) out.pop();
}

/** `getFinPointsWithRoot()`, in the fin's own frame. */
export function finPointsWithRoot(fin: ComponentNode, parent: FinParent): Pt[] | null {
  const outline = finOutlinePoints(fin, parent);
  if (!outline) return null;
  const out = [...outline];
  appendRoot(out, [...finRootPoints(fin, parent)].reverse());
  return out;
}

/** The cant turns about the middle of `chord`; `angle` includes every enclosing pod or booster instance's. */
export interface FinPose {
  front: number;
  radius: number;
  chord: number;
  cant: number;
  angle: number;
}

/** `FinSet.getInstanceOffsets` (FinSet.java:1783-1791): `rotate_y(cant)` about the root midpoint, then `rotate_x(angle)`. */
export function finBodyPoint(x: number, y: number, z: number, pose: FinPose): [number, number, number] {
  const mid = pose.chord / 2;
  const cc = Math.cos(pose.cant);
  const sc = Math.sin(pose.cant);
  const ca = Math.cos(pose.angle);
  const sa = Math.sin(pose.angle);
  const r = pose.radius + y;
  const across = -(x - mid) * sc + z * cc;
  return [pose.front + mid + (x - mid) * cc + z * sc, r * ca - across * sa, r * sa + across * ca];
}

/** `FinSet.getTabPointsWithRoot` and `generateContinuousFinAndTabShape`. */
export function finCutContour(node: ComponentNode, parent: FinParent): Pt[] | null {
  const outline = finOutlinePoints(node, parent);
  if (!outline) return null;
  const back = [...finRootPoints(node, parent)].reverse();
  const len = finRootChord(node);
  const points = finTabPoints(node, parent);
  const beyond = points && ((points[0]![0] > len && points[3]![0] > len) || (points[0]![0] < 0 && points[3]![0] < 0));
  const tab = beyond ? null : points;
  const out = [...outline];
  if (!tab) {
    appendRoot(out, back);
    return out;
  }
  const x0 = tab[0]![0];
  const x1 = tab[3]![0];
  appendRoot(
    out,
    back.filter(([x]) => x > x1),
  );
  out.push(tab[3]!, tab[2]!, tab[1]!, tab[0]!);
  appendRoot(
    out,
    back.filter(([x]) => x < x0),
  );
  return out;
}

/** The tab depth limit for a planar fin set, or the body tube radius for other children. */
export function parentRadiusOf(tree: RocketTree, nodeId: string): number | null {
  for (const stage of tree.components) {
    const hit = findWithParent(stage.children ?? [], nodeId, stage);
    if (!hit) continue;
    if (!hit.parent) return null;
    if (isPlanarFinSet(hit.node.type)) return finTabLimit(hit.node, hit.parent, parentStartOf(tree, hit.parent));
    return hit.parent.type === 'bodytube' ? bodyTubeRadius(hit.parent) : null;
  }
  return null;
}

/** `FinSet.getMaxTabHeight()`. */
function finTabLimit(fin: ComponentNode, parent: ComponentNode, parentStart: number): number | null {
  const mount = finMount(fin, parent, parentStart);
  return mount ? mountTabLimit(fin, mount) : null;
}

function mountTabLimit(fin: ComponentNode, mount: FinMount): number {
  const lead = finTabFrontEdge(fin, finRootChord(fin));
  const trail = lead + num(fin, 'tabLength', 0);
  return Math.min(mount.radiusAt(mount.front + lead), mount.radiusAt(mount.front + trail));
}

/** As `FinSet.setTabOffsetMethod`. An unset method is the kernel default, middle. */
export function rebaseTabOffset(node: ComponentNode, method: string): Partial<ComponentNode> {
  const from = typeof node['tabOffsetMethod'] === 'string' ? node['tabOffsetMethod'] : 'middle';
  const tabLen = num(node, 'tabLength', 0);
  const root = axialLength(node);
  const front = tabPosition(num(node, 'tabOffset', 0), tabLen, root, from);
  return { tabOffsetMethod: method, tabOffset: tabOffsetAt(front, tabLen, root, method) };
}
