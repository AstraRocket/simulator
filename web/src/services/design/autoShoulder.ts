import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { boreAt, endAt } from './discGeometry';
import { noseConeAftRadius, num } from '../../tree/nodeProps';
import { KERNEL_AUTO_RADIUS } from '../../tree/kernelDefaults';
import { COMPONENT_DEFAULTS } from './componentDefaults';
import { mapTreePreserving, type MapContext } from '../../tree/treeWalk';
import { isZero, mathEquals } from '../motors/mathEquals';
import { symmetricNeighbors, type Neighbors } from './autoRadius';

// Auto shoulders need an explicit flag: an absent shoulder already means "no shoulder".

/** `side`: -1 follows the part above, +1 below. */
const shoulderKeys = (prefix: string, side: -1 | 1) => ({
  auto: `${prefix}Auto`,
  length: `${prefix}Length`,
  radius: `${prefix}Radius`,
  thickness: `${prefix}Thickness`,
  capped: `${prefix}Capped`,
  side,
});

const SHOULDERS: Record<string, readonly ReturnType<typeof shoulderKeys>[]> = {
  nosecone: [shoulderKeys('shoulder', 1)],
  transition: [shoulderKeys('foreShoulder', -1), shoulderKeys('aftShoulder', 1)],
};

const neighborOf = (
  neighbors: Map<ComponentNode, Neighbors>,
  node: ComponentNode,
  side: -1 | 1,
): { node: ComponentNode; offers: number } | null => {
  const n = neighbors.get(node);
  const found = n ? (side === -1 ? n.previous : n.next) : null;
  return found && n ? { node: found, offers: side === -1 ? n.previousOffers : n.nextOffers } : null;
};

// Mirrors `Transition.setForeShoulderLength` / `setAftShoulderLength`; the bridge sets none of this itself.
export function shoulderSeed(
  before: ComponentNode,
  after: ComponentNode,
  edit: Partial<ComponentNode>,
  components: readonly ComponentNode[],
): Partial<ComponentNode> {
  const out: Record<string, unknown> = {};
  const free = (k: string) => !(k in edit);
  let neighbors: Map<ComponentNode, Neighbors> | null = null;
  for (const s of SHOULDERS[after.type] ?? []) {
    const was = num(before, s.length, 0);
    const now = num(after, s.length, 0);
    if (isZero(was) && !isZero(now)) {
      const side = sideOf(after, s.side);
      neighbors ??= symmetricNeighbors(components);
      const found = neighborOf(neighbors, before, side);
      const neighbor = found?.node ?? null;
      const solid = neighbor?.['filled'] === true;
      const open = neighbor
        ? endAt(solid ? { ...neighbor, filled: false } : neighbor, side === -1 ? 'aft' : 'fore')
        : null;
      // A nose cone's tip offers no end to plug.
      if (!neighbor || open) {
        // `SymmetricComponent.getThickness`: a solid part's wall is its widest radius.
        const own =
          after['filled'] === true
            ? solidWall(after)
            : num(after, 'thickness', COMPONENT_DEFAULTS[after.type as 'nosecone' | 'transition'].thickness);
        const wall = !neighbor ? own : solid ? solidWall(neighbor) : open!.wall;
        // An offer of -1 (nothing fixed beyond an auto tube) would seed a negative shoulder.
        const outer = !neighbor ? KERNEL_AUTO_RADIUS : found!.offers >= 0 ? found!.offers : open!.outer;
        const end = shoulderEnd(after, s.side);
        const radius = Math.max(0, outer - wall);
        if (free(s.thickness) && isZero(num(after, s.thickness, 0))) out[s.thickness] = wall;
        if (free(s.radius) && isZero(num(after, s.radius, 0)))
          out[s.radius] = end === null ? radius : Math.min(radius, end);
      }
      if (free(s.capped)) out[s.capped] = true;
    } else if (!isZero(was) && isZero(now)) {
      if (free(s.radius)) out[s.radius] = 0;
      if (free(s.thickness)) out[s.thickness] = 0;
      if (free(s.capped)) out[s.capped] = false;
    }
  }
  return out;
}

// The bridge sets shoulders unclamped, so the edit carries the clamp (Transition.java:121, :232, :446-457, :558-569).
export function endShoulderClamp(
  before: ComponentNode,
  after: ComponentNode,
  edit: Partial<ComponentNode>,
): Partial<ComponentNode> {
  const out: Record<string, unknown> = {};
  for (const s of SHOULDERS[after.type] ?? []) {
    const endKey = after.type === 'nosecone' || s.side === 1 ? 'aftRadius' : 'foreRadius';
    if (!(endKey in edit) || s.radius in edit || after[`${endKey}Auto`] === true) continue;
    const was = before[endKey];
    const now = after[endKey];
    // The setter returns before clamping when a fixed end is set to its own value.
    if (
      typeof now !== 'number' ||
      (typeof was === 'number' && mathEquals(was, now) && before[`${endKey}Auto`] !== true)
    )
      continue;
    const end = shoulderEnd(after, s.side);
    const radius = num(after, s.radius, 0);
    if (end === null || !(radius > end)) continue;
    out[s.radius] = end;
    if (num(after, s.thickness, 0) > end) out[s.thickness] = end;
  }
  return out;
}

const solidWall = (node: ComponentNode): number => {
  const open = { ...node, filled: false };
  return Math.max(endAt(open, 'fore')?.outer ?? 0, endAt(open, 'aft')?.outer ?? 0);
};

// `NoseCone.setFlipped` moves the aft shoulder to the fore end.
const sideOf = (node: ComponentNode, side: -1 | 1): -1 | 1 =>
  node.type === 'nosecone' && node['flipped'] === true ? -1 : side;

const shoulderEnd = (node: ComponentNode, side: -1 | 1): number | null => {
  if (node.type === 'nosecone') return noseConeAftRadius(node);
  const r = num(node, side === -1 ? 'foreRadius' : 'aftRadius', NaN);
  return Number.isFinite(r) ? r : null;
};

export function syncAutoShoulders(tree: RocketTree): RocketTree {
  let neighbors: Map<ComponentNode, Neighbors> | null = null;
  const resolve = (n: ComponentNode, { index, siblings }: MapContext): ComponentNode => {
    let node = n;
    for (const s of SHOULDERS[node.type] ?? []) {
      if (node[s.auto] !== true) continue;
      neighbors ??= symmetricNeighbors(tree.components);
      const neighbor = neighborOf(neighbors, siblings[index]!, sideOf(node, s.side))?.node ?? null;
      const bore = neighbor ? boreAt(neighbor, sideOf(node, s.side) === -1 ? 'aft' : 'fore') : null;
      // No bore to plug: keep the stored value rather than zero a typed shoulder.
      const end = shoulderEnd(node, s.side);
      const fit = bore === null ? null : end === null ? bore : Math.min(bore, end);
      if (fit !== null && node[s.radius] !== fit) node = { ...node, [s.radius]: fit };
    }
    // `ComponentFactory.settleFlippedShoulders` clamps a flipped cone's shoulder to its base.
    if (node.type === 'nosecone' && node['flipped'] === true) {
      const stated = node['shoulderRadius'];
      const base = noseConeAftRadius(node);
      if (typeof stated === 'number' && stated > base) node = { ...node, shoulderRadius: base };
    }
    return node;
  };
  const components = mapTreePreserving(tree.components, resolve, 'post');
  return components === tree.components ? tree : { ...tree, components };
}
