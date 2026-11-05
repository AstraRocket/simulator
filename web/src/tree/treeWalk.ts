import type { ComponentNode, RocketTree } from '../engine/openRocketEngine';

export function* walkNodes(nodes: readonly ComponentNode[]): Generator<ComponentNode> {
  for (const n of nodes) {
    yield n;
    if (n.children) yield* walkNodes(n.children);
  }
}

export function findNode(nodes: readonly ComponentNode[], id: string): ComponentNode | null {
  for (const n of walkNodes(nodes)) if (n.id === id) return n;
  return null;
}

export function findWithParent(
  nodes: readonly ComponentNode[],
  id: string,
  parent: ComponentNode | null = null,
): { node: ComponentNode; parent: ComponentNode | null } | null {
  for (const n of nodes) {
    if (n.id === id) return { node: n, parent };
    const hit = n.children ? findWithParent(n.children, id, n) : null;
    if (hit) return hit;
  }
  return null;
}

/** `siblings` is the tree's own array, not a copy. */
export function findSiblings(nodes: ComponentNode[], id: string): { siblings: ComponentNode[]; index: number } | null {
  const index = nodes.findIndex((n) => n.id === id);
  if (index >= 0) return { siblings: nodes, index };
  for (const n of nodes) {
    const hit = n.children ? findSiblings(n.children, id) : null;
    if (hit) return hit;
  }
  return null;
}

export function replaceNode(
  nodes: readonly ComponentNode[],
  id: string,
  fn: (node: ComponentNode) => ComponentNode | ComponentNode[],
): ComponentNode[] {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.id === id) {
      const r = fn(n);
      return [...nodes.slice(0, i), ...(Array.isArray(r) ? r : [r]), ...nodes.slice(i + 1)];
    }
    if (!n.children) continue;
    const kids = replaceNode(n.children, id, fn);
    if (kids !== n.children) {
      const out = nodes.slice();
      out[i] = { ...n, children: kids };
      return out;
    }
  }
  return nodes as ComponentNode[];
}

/** Nearest first. */
export function lineageOf(nodes: readonly ComponentNode[], id: string): ComponentNode[] {
  for (const n of nodes) {
    if (n.id === id) return [n];
    if (!n.children) continue;
    const below = lineageOf(n.children, id);
    if (below.length) return [...below, n];
  }
  return [];
}

export interface MapContext {
  index: number;
  /** The original siblings, before any were mapped. */
  siblings: ComponentNode[];
  /** Already mapped in `pre` order; the original parent in `post` order. */
  parent: ComponentNode | null;
}

export function mapTreePreserving(
  nodes: ComponentNode[],
  fn: (node: ComponentNode, ctx: MapContext) => ComponentNode,
  order: 'pre' | 'post',
  parent: ComponentNode | null = null,
): ComponentNode[] {
  let changed = false;
  const out = nodes.map((n, index) => {
    let node = n;
    if (order === 'pre') node = fn(node, { index, siblings: nodes, parent });
    if (node.children) {
      const kids = mapTreePreserving(node.children, fn, order, order === 'pre' ? node : n);
      if (kids !== node.children) node = { ...node, children: kids };
    }
    if (order === 'post') node = fn(node, { index, siblings: nodes, parent });
    if (node !== n) changed = true;
    return node;
  });
  return changed ? out : nodes;
}

export function collectNodes(nodes: readonly ComponentNode[], pred: (n: ComponentNode) => boolean): ComponentNode[] {
  const out: ComponentNode[] = [];
  for (const n of walkNodes(nodes)) if (typeof n.id === 'string' && pred(n)) out.push(n);
  return out;
}

/** [0] = top sustainer, [last] = bottom booster. */
export function stageNodes(tree: RocketTree): ComponentNode[] {
  return tree.components.filter((n) => n.type === 'stage');
}
