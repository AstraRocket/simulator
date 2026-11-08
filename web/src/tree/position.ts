import type { ComponentNode, ComponentPosition, RocketTree } from '../engine/openRocketEngine';
import { assemblyChainLength, isAssembly } from './assembly.js';
import { isChainType } from './componentKinds';
import { FIN_DEFAULTS, kernelLength } from './kernelDefaults';
import { num, positionOf } from './nodeProps';

/** "start" is a child's leading edge from its parent's leading edge (m). */

/** `FreeformFinSet.length = last.x - first.x`, not the furthest-aft point. */
export function freeformRootChord(
  pts: [number, number][] | undefined,
  fallback: number = FIN_DEFAULTS.rootChord,
): number {
  const p = pts ?? [];
  const first = p[0];
  const last = p[p.length - 1];
  const root = first && last && Number.isFinite(first[0]) && Number.isFinite(last[0]) ? last[0] - first[0] : 0;
  return root > 0 ? root : fallback;
}

/** `FreeformFinSet.SNAP_LARGER_THAN` (m). */
export const FREEFORM_SNAP_LARGER_THAN = 2.5;

/** As `FreeformFinSet.setPoints()` stores it: translated by -p0, then snapped. */
export function normalizeFreeformPoints(pts: [number, number][] | undefined): [number, number][] {
  const p = pts ?? [];
  const p0 = p[0];
  if (!p0 || !Number.isFinite(p0[0]) || !Number.isFinite(p0[1])) return p;
  const cap = FREEFORM_SNAP_LARGER_THAN;
  // A point past the cap both ways keeps its x: the kernel's second `set` overwrites the first.
  const snap = (x: number, y: number): [number, number] => (y > cap ? [x, cap] : x > cap ? [cap, y] : [x, y]);
  const moved = p0[0] !== 0 || p0[1] !== 0;
  const out = p.map(([x, y]): [number, number] => (moved ? snap(x - p0[0], y - p0[1]) : snap(x, y)));
  return !moved && out.every(([x, y], i) => x === p[i]![0] && y === p[i]![1]) ? p : out;
}

export function freeformPoints(n: ComponentNode): [number, number][] {
  return n.type === 'freeformfinset' ? normalizeFreeformPoints(n['points'] as [number, number][] | undefined) : [];
}

/** Not the positioning extent ({@link axialLength}). */
export function partLength(n: ComponentNode): number {
  return num(n, 'length', kernelLength(n.type) ?? 0);
}

export function axialLength(n: ComponentNode): number {
  if (n.type === 'freeformfinset') {
    return freeformRootChord(freeformPoints(n));
  }
  if (n.type === 'trapezoidfinset' || n.type === 'ellipticalfinset') {
    return num(n, 'rootChord', FIN_DEFAULTS.rootChord);
  }
  if (isAssembly(n.type)) return assemblyChainLength(n);
  // A recovery device's packed length is stored in `length`; there is no `packedLength` key.
  return partLength(n);
}

export function axialChain(tree: RocketTree): ComponentNode[] {
  return tree.components.flatMap((n) => (n.type === 'stage' ? (n.children ?? []) : [n]));
}

export function motorSeatStart(mount: ComponentNode, mountStart: number, mountLen: number, motorLen: number): number {
  return mountStart + mountLen - motorLen + num(mount, 'motorOverhang', 0);
}

export function axialStart(child: ComponentNode, childLen: number, pStart: number, pLen: number): number {
  return pStart + startFromPosition(positionOf(child), childLen, pLen, pStart);
}

/** `pStart` is read only by `absolute`, which the kernel measures from the nose tip. */
export function startFromPosition(pos: ComponentPosition, childLen: number, pLen: number, pStart: number): number {
  switch (pos.method) {
    case 'middle':
      return (pLen - childLen) / 2 + pos.offset;
    case 'bottom':
      return pLen - childLen + pos.offset;
    case 'absolute':
      return pos.offset - pStart;
    // 'after' is resolved to 'top' on load (resolveFilePositions).
    case 'after':
    case 'top':
    default:
      return pos.offset;
  }
}

export interface LaidStage<T> {
  stage: ComponentNode;
  start: number;
  length: number;
  placed: T[];
}

/** Chain members stack, ignoring position; a non-chain stage child takes no axial space. */
export function layStages<T>(
  tree: RocketTree,
  place: (n: ComponentNode, start: number, length: number) => T,
): LaidStage<T>[] {
  let x = 0;
  return tree.components.map((stage) => {
    const kids = stage.type === 'stage' ? (stage.children ?? []) : [stage];
    const start = x;
    const length = kids.reduce((sum, n) => sum + (isChainType(n.type) ? partLength(n) : 0), 0);
    const placed = kids.map((n) => {
      if (isChainType(n.type)) {
        const len = partLength(n);
        const out = place(n, x, len);
        x += len;
        return out;
      }
      const own = axialLength(n);
      return place(n, axialStart(n, own, start, length), own);
    });
    return { stage, start, length, placed };
  });
}

/** Stack from the front whatever their method (`SymmetricComponent.isAfter()` is always true). */
export function stacksInParent(parent: ComponentNode, child: ComponentNode): boolean {
  return isAssembly(parent.type) && isChainType(child.type);
}

/** `isAfter()` is false (FinSet.java:159, InnerTube.java:176, LaunchLug.java:134, MassObject.java:53, TubeFinSet.java:216). */
const NOT_AFTER: ReadonlySet<string> = new Set([
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
  'innertube',
  'launchlug',
  'parachute',
  'streamer',
  'shockcord',
  'masscomponent',
  'tubefinset',
]);

/** Rewrites 'after' into a parent-relative 'top' offset; 'absolute' stays, as in desktop. */
export function resolveFilePositions(tree: RocketTree): RocketTree {
  let changed = false;

  const fixChildren = (parent: ComponentNode, pStart: number, pLen: number): ComponentNode => {
    if (!parent.children?.length) return parent;
    let prevEndRel = 0;
    let chained = 0;
    const children = parent.children.map((child) => {
      let next = child;
      const pos = positionOf(child);
      if (stacksInParent(parent, child)) {
        const len = partLength(child);
        const relStart = chained;
        chained += len;
        prevEndRel = relStart + len;
        if (pos.method === 'after') {
          changed = true;
          next = {
            ...child,
            position: {
              method: 'top',
              offset: relStart,
              ork: { method: 'after', offset: pos.offset, resolved: relStart },
            },
          };
        }
        return fixChildren(next, pStart + relStart, len);
      }
      if (pos.method === 'after') {
        changed = true;
        // isAfter(): previous sibling's aft end, offset forced to 0; NOT_AFTER: parent's aft end plus offset.
        const resolved = NOT_AFTER.has(String(child.type)) ? pLen + pos.offset : prevEndRel;
        next = {
          ...child,
          position: { method: 'top', offset: resolved, ork: { method: 'after', offset: pos.offset, resolved } },
        };
      }
      const cLen = axialLength(next);
      const relStart = startFromPosition(positionOf(next), cLen, pLen, pStart);
      prevEndRel = relStart + cLen;
      return fixChildren(next, pStart + relStart, cLen);
    });
    return { ...parent, children };
  };

  // Via layStages: a parent length of 0 would put a `middle` child forward of the nose.
  const components = layStages(tree, fixChildren).map(({ stage, placed }) =>
    stage.type === 'stage' ? { ...stage, children: placed } : placed[0]!,
  );
  return changed ? { ...tree, components } : tree;
}
