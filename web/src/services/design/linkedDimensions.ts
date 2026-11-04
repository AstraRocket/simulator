import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { num } from '../../tree/nodeProps';
import { mapTreePreserving } from '../../tree/treeWalk';
import { COMPONENT_DEFAULTS } from './componentDefaults';

/**
 * Outer's floor is the inner (the kernel would pull the inner down instead): the panel writes per
 * keystroke, so typing 54 over a 25 mm bore would pass through 5 and drag the bore with it.
 */
export interface DimensionBounds {
  min?: (node: ComponentNode) => number;
  max?: (node: ComponentNode) => number;
}

const RB = COMPONENT_DEFAULTS.railbutton;

export const RAIL_BUTTON_FALLBACK = {
  outerDiameter: RB.outerDiameter,
  innerDiameter: RB.innerDiameter,
  height: RB.height,
  baseHeight: RB.baseHeight,
  flangeHeight: RB.flangeHeight,
  screwHeight: RB.screwHeight,
} as const;

type RailKey = keyof typeof RAIL_BUTTON_FALLBACK;

const rail = (node: ComponentNode, key: RailKey): number => num(node, key, RAIL_BUTTON_FALLBACK[key]);

export const RAIL_BUTTON_BOUNDS: Partial<Record<RailKey, DimensionBounds>> = {
  outerDiameter: { min: (n) => Math.max(0, rail(n, 'innerDiameter')) },
  innerDiameter: { max: (n) => rail(n, 'outerDiameter') },
  height: { min: (n) => rail(n, 'baseHeight') + rail(n, 'flangeHeight') },
  baseHeight: { max: (n) => Math.max(0, rail(n, 'height') - rail(n, 'flangeHeight')) },
  flangeHeight: { max: (n) => Math.max(0, rail(n, 'height') - rail(n, 'baseHeight')) },
};

export const RING_BOUNDS: Record<'outerRadius' | 'innerRadius', DimensionBounds> = {
  outerRadius: { min: (n) => Math.max(0, num(n, 'innerRadius')) },
  innerRadius: { max: (n) => num(n, 'outerRadius') },
};

/** Lower bound first, as the kernel's setters do. */
export function clampToBounds(node: ComponentNode, bounds: DimensionBounds | undefined, v: number): number {
  if (!bounds) return v;
  const lo = bounds.min?.(node);
  const hi = bounds.max?.(node);
  let out = v;
  if (lo !== undefined) out = Math.max(out, lo);
  if (hi !== undefined) out = Math.min(out, hi);
  return out;
}

/** Desktop loader order (`RailButtonSaver`): outer, inner, total, base, flange; do not reorder. */
export function settleRailButtonLoad(read: Partial<Record<RailKey, number>>): Record<RailKey, number> {
  let od: number = RB.outerDiameter;
  let id: number = RB.innerDiameter;
  let total: number = RB.height;
  let base: number = RB.baseHeight;
  let flange: number = RB.flangeHeight;
  if (read.outerDiameter !== undefined) {
    od = read.outerDiameter;
    id = Math.min(id, od);
  }
  if (read.innerDiameter !== undefined) id = Math.min(read.innerDiameter, od);
  if (read.height !== undefined) total = Math.max(read.height, base + flange);
  if (read.baseHeight !== undefined) base = Math.min(Math.max(read.baseHeight, 0), total - flange);
  if (read.flangeHeight !== undefined) flange = Math.min(Math.max(read.flangeHeight, 0), total - base);
  return {
    outerDiameter: od,
    innerDiameter: id,
    height: total,
    baseHeight: base,
    flangeHeight: flange,
    screwHeight: read.screwHeight ?? RB.screwHeight,
  };
}

export const settleRingOuterLoad = (outer: number, inner: number): number => Math.max(outer, inner);

/** `ComponentFactory`'s order; differs from the load order above. */
function settleRailButtonBuild(node: ComponentNode): Partial<Record<RailKey, number>> {
  const od = rail(node, 'outerDiameter');
  const id = Math.min(rail(node, 'innerDiameter'), od);
  const total = Math.max(rail(node, 'height'), 0);
  const base = Math.min(Math.max(rail(node, 'baseHeight'), 0), total);
  const flange = Math.min(Math.max(rail(node, 'flangeHeight'), 0), total - base);
  const settled = { innerDiameter: id, height: total, baseHeight: base, flangeHeight: flange };
  const patch: Partial<Record<RailKey, number>> = {};
  for (const [k, v] of Object.entries(settled) as [RailKey, number][]) if (v !== rail(node, k)) patch[k] = v;
  return patch;
}

function settleRingBuild(node: ComponentNode): { outerRadius?: number } {
  if (node['outerRadiusAuto'] === true) return {};
  const outer = node['outerRadius'];
  const inner = node['innerRadius'];
  if (typeof outer !== 'number' || typeof inner !== 'number') return {};
  const raised = settleRingOuterLoad(outer, Math.max(inner, 0));
  return raised === outer ? {} : { outerRadius: raised };
}

export function settleLinkedDimensions(tree: RocketTree): RocketTree {
  const components = mapTreePreserving(
    tree.components,
    (n) => {
      const patch =
        n.type === 'railbutton' ? settleRailButtonBuild(n) : n.type === 'centeringring' ? settleRingBuild(n) : {};
      return Object.keys(patch).length ? { ...n, ...patch } : n;
    },
    'pre',
  );
  return components === tree.components ? tree : { ...tree, components };
}
