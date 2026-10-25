import type { ComponentNode, RocketTree } from '../engine/openRocketEngine';

/**
 * Shared walks over a component tree. Every search stops at the first match in
 * its stated order, so a design that somehow carries a duplicate id resolves
 * to the same node everywhere.
 */

/** Every node under `nodes`, depth first, each parent before its children. */
export function* walkNodes(nodes: readonly ComponentNode[]): Generator<ComponentNode> {
  for (const n of nodes) {
    yield n;
    if (n.children) yield* walkNodes(n.children);
  }
}

/** The first node with this id in {@link walkNodes} order, or null. */
export function findNode(nodes: readonly ComponentNode[], id: string): ComponentNode | null {
  for (const n of walkNodes(nodes)) if (n.id === id) return n;
  return null;
}

/**
 * The first node with this id in {@link walkNodes} order, with its parent.
 * A node in `nodes` itself reports `parent` as given (null by default).
 */
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

/**
 * The array that holds the node with this id, and its index there, or null.
 *
 * Each level is searched in full before any child level under it, so a match
 * among `nodes` wins over one deeper down. `siblings` is the tree's own array,
 * not a copy: a caller that owns the tree may splice it in place.
 */
export function findSiblings(nodes: ComponentNode[], id: string): { siblings: ComponentNode[]; index: number } | null {
  const index = nodes.findIndex((n) => n.id === id);
  if (index >= 0) return { siblings: nodes, index };
  for (const n of nodes) {
    const hit = n.children ? findSiblings(n.children, id) : null;
    if (hit) return hit;
  }
  return null;
}

/**
 * `nodes` with the node `id` replaced by `fn(node)`: one node in its place, or
 * several fanned out from it. The node is the one {@link findNode} finds (depth
 * first, the first match). Only the arrays and parents on the path to it are
 * copied, so every untouched subtree keeps its identity, and `nodes` itself
 * comes back when there is no such node.
 */
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

/**
 * The node `id` and every node above it, nearest first: the node, its parent,
 * and so on to the top-level node holding it. One walk, where stepping up with
 * `findParent` searches the whole tree once per level. Empty when there is no
 * such node; the node is the one {@link findNode} finds.
 */
export function lineageOf(nodes: readonly ComponentNode[], id: string): ComponentNode[] {
  for (const n of nodes) {
    if (n.id === id) return [n];
    if (!n.children) continue;
    const below = lineageOf(n.children, id);
    if (below.length) return [...below, n];
  }
  return [];
}

/** The node's position when {@link mapTreePreserving} calls its function. */
export interface MapContext {
  /** Index among its siblings. */
  index: number;
  /** The original sibling array, before any of it was mapped. */
  siblings: ComponentNode[];
  /**
   * The parent as mapped: in `pre` order its own function has already run;
   * in `post` order it is the original parent. Null at the top level.
   */
  parent: ComponentNode | null;
}

/**
 * Map every node in the tree, sharing whatever did not change.
 *
 * `fn` returns the node itself to leave it alone, or a new object. An array
 * comes back as the same array when no element in it changed, and a node whose
 * subtree did not change keeps its identity, so memos keyed on untouched parts
 * stay valid.
 *
 * The order decides what `fn` sees:
 * - `pre`: `fn` runs on a node first, and its children are then mapped under
 *   the result. A child sees its parent's resolved values.
 * - `post`: the children are mapped first, and `fn` runs on a node that
 *   already carries its mapped children.
 */
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

/**
 * Every node `pred` accepts, in pre-order (tree order), that carries an id:
 * what the flight configurations key their overrides by, so a node without one
 * cannot be addressed and is left out.
 */
export function collectNodes(nodes: readonly ComponentNode[], pred: (n: ComponentNode) => boolean): ComponentNode[] {
  const out: ComponentNode[] = [];
  for (const n of walkNodes(nodes)) if (typeof n.id === 'string' && pred(n)) out.push(n);
  return out;
}

/**
 * Top-level stage nodes, in desktop order ([0] = top sustainer … [last] =
 * bottom booster). Here rather than in `treeEdit`, so a file writer or the
 * report can list them without pulling in the part catalogs.
 */
export function stageNodes(tree: RocketTree): ComponentNode[] {
  return tree.components.filter((n) => n.type === 'stage');
}
