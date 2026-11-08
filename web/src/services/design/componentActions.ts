import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { clusterCount, clusterPlacesOf, isClusterPattern } from '../../tree/cluster';
import { finPlanformPoints } from '../../tree/finPlanform';
import { countOf, num } from '../../tree/nodeProps';
import { findNode, replaceNode } from '../../tree/treeWalk';
import { scaleNode } from '../../tree/scaleRocket';
import { syncDerived } from './treeEdit';
import { uuid } from '../app/uuid';

// Returning the same tree when nothing changes lets the store skip the undo step.

const CONVERTIBLE = new Set(['trapezoidfinset', 'ellipticalfinset']);

const PLANFORM_KEYS = ['rootChord', 'tipChord', 'sweep', 'height'] as const;

const SPLITTABLE: Record<string, { count: string; angle: string }> = {
  trapezoidfinset: { count: 'finCount', angle: 'rotation' },
  ellipticalfinset: { count: 'finCount', angle: 'rotation' },
  freeformfinset: { count: 'finCount', angle: 'rotation' },
  tubefinset: { count: 'finCount', angle: 'rotation' },
  podset: { count: 'instanceCount', angle: 'angleOffset' },
  parallelstage: { count: 'instanceCount', angle: 'angleOffset' },
};

/** `origins` maps each new id to its source id. */
export function reid(node: ComponentNode, origins?: Map<string, string>): ComponentNode {
  const out: ComponentNode = { ...node, id: uuid() };
  if (origins && typeof node.id === 'string') origins.set(out.id as string, node.id);
  if (node.children) out.children = node.children.map((c) => reid(c, origins));
  return out;
}

function keepFirstId(copies: ComponentNode[], id: string, origins?: Map<string, string>): void {
  if (origins && typeof copies[0]!.id === 'string') origins.delete(copies[0]!.id);
  copies[0]!.id = id;
}

function replaceInPlace(tree: RocketTree, id: string, replacements: ComponentNode[]): RocketTree {
  const components = replaceNode(tree.components, id, () => replacements);
  return components === tree.components ? tree : syncDerived({ ...tree, components });
}

export const canConvertToFreeform = (node: ComponentNode | null | undefined): boolean =>
  !!node && CONVERTIBLE.has(node.type);

export function convertToFreeform(tree: RocketTree, id: string): RocketTree {
  const node = findNode(tree.components, id);
  if (!node || !canConvertToFreeform(node)) return tree;
  const points = finPlanformPoints(node);
  if (!points || points.length < 3) return tree;
  const out: ComponentNode = { ...node, type: 'freeformfinset', points };
  for (const k of PLANFORM_KEYS) delete out[k];
  return replaceInPlace(tree, id, [out]);
}

export const splitCount = (node: ComponentNode | null | undefined): number => {
  if (!node) return 1;
  const spec = SPLITTABLE[node.type];
  return spec ? countOf(node, spec.count, 1) : 1;
};

export const canSplit = (node: ComponentNode | null | undefined): boolean => splitCount(node) > 1;

export function splitInstances(
  tree: RocketTree,
  id: string,
  baseName: string,
  origins?: Map<string, string>,
): RocketTree {
  const node = findNode(tree.components, id);
  const spec = node ? SPLITTABLE[node.type] : undefined;
  if (!node || !spec) return tree;
  const count = splitCount(node);
  if (count < 2) return tree;
  const angle = num(node, spec.angle, 0);
  const override = node['overrideMass'];
  const copies = Array.from({ length: count }, (_, i) => {
    const copy = reid(node, origins);
    copy[spec.count] = 1;
    copy[spec.angle] = angle + (i * 2 * Math.PI) / count;
    copy.name = baseName + ' #' + String(i + 1);
    if (typeof override === 'number') copy['overrideMass'] = override / count;
    return copy;
  });
  // Keep the original id so the selection does not empty under the button.
  keepFirstId(copies, id, origins);
  return replaceInPlace(tree, id, copies);
}

export const canSplitCluster = (node: ComponentNode | null | undefined): boolean =>
  !!node && node.type === 'innertube' && clusterCount(node['cluster'] as string | undefined) > 1;

export function splitCluster(
  tree: RocketTree,
  id: string,
  baseName: string,
  origins?: Map<string, string>,
): RocketTree {
  const node = findNode(tree.components, id);
  if (!node || !canSplitCluster(node)) return tree;
  const places = clusterPlacesOf(node);
  const copies = places.map((p, i) => {
    const copy = reid(node, origins);
    copy['cluster'] = 'single';
    copy['clusterScale'] = 1;
    copy['clusterRotation'] = 0;
    copy['radialPosition'] = p.radialPosition;
    copy['radialDirection'] = p.radialDirection;
    copy.name = baseName + ' #' + String(i + 1);
    return copy;
  });
  if (!copies.length) return tree;
  keepFirstId(copies, id, origins);
  return replaceInPlace(tree, id, copies);
}

// Resets spacing and roll only, not the pattern, as desktop does.
export function resetCluster(tree: RocketTree, id: string): RocketTree {
  const node = findNode(tree.components, id);
  if (!node || node.type !== 'innertube' || !isClusterPattern(node['cluster'])) return tree;
  if (num(node, 'clusterScale', 1) === 1 && num(node, 'clusterRotation', 0) === 0) return tree;
  return replaceInPlace(tree, id, [{ ...node, clusterScale: 1, clusterRotation: 0 }]);
}

// Deliberately does not recurse into children.
export function scaleComponent(tree: RocketTree, id: string, factor: number): RocketTree {
  if (!(factor > 0) || !Number.isFinite(factor) || factor === 1) return tree;
  const node = findNode(tree.components, id);
  if (!node) return tree;
  const scaled = scaleNode(node, factor);
  return replaceInPlace(tree, id, [node.children ? { ...scaled, children: node.children } : scaled]);
}
