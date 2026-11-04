import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { reid } from './componentActions';
import { canHost, findNode, findParent, isRecoveryDevice, MAIN_DEVICE_KEY, syncDerived } from './treeEdit';
import { stageNodes, lineageOf, walkNodes } from '../../tree/treeWalk';

// Paste placement follows desktop swing RocketActions.

/** `parentId` is null for the design itself. */
export interface PastePlace {
  parentId: string | null;
  index: number;
}

export function canRemove(tree: RocketTree, id: string): boolean {
  const node = findNode(tree, id);
  if (!node) return false;
  return node.type !== 'stage' || stageNodes(tree).length > 1;
}

export function pastePlace(tree: RocketTree, clip: ComponentNode, selectedId: string | null): PastePlace | null {
  if (!selectedId) return canHost('rocket', clip.type) ? { parentId: null, index: tree.components.length } : null;
  const selected = findNode(tree, selectedId);
  if (!selected) return null;
  if (canHost(selected.type, clip.type)) return { parentId: selectedId, index: selected.children?.length ?? 0 };
  const parent = findParent(tree, selectedId);
  const siblings = parent ? (parent.children ?? []) : tree.components;
  if (!canHost(parent ? parent.type : 'rocket', clip.type)) return null;
  return { parentId: parent ? (parent.id as string) : null, index: siblings.findIndex((n) => n.id === selectedId) + 1 };
}

function stageOf(tree: RocketTree, id: string): ComponentNode | null {
  return lineageOf(tree.components, id).find((n) => n.type === 'stage') ?? null;
}

export interface PastedCopy {
  tree: RocketTree;
  id: string;
  origins: Map<string, string>;
}

// A stage holds at most one drogue and one picked main, so a copy drops a duplicate flag.
function insertCopy(tree: RocketTree, clip: ComponentNode, place: PastePlace): PastedCopy {
  const origins = new Map<string, string>();
  const copy = reid(structuredClone(clip), origins);
  const next = structuredClone(tree);
  const siblings = place.parentId ? (findNode(next, place.parentId)!.children ??= []) : next.components;
  siblings.splice(place.index, 0, copy);
  const id = copy.id as string;
  const stage = stageOf(next, id);
  if (stage?.children) {
    const copied = new Set([...walkNodes([copy])]);
    for (const key of ['drogue', MAIN_DEVICE_KEY]) {
      const flagged = [...walkNodes(stage.children)].filter((n) => isRecoveryDevice(n.type) && n[key] === true);
      if (flagged.some((n) => !copied.has(n)))
        for (const n of flagged) if (copied.has(n)) delete (n as Record<string, unknown>)[key];
    }
  }
  return { tree: syncDerived(next), id, origins };
}

export function pasteNode(tree: RocketTree, clip: ComponentNode, selectedId: string | null): PastedCopy | null {
  const place = pastePlace(tree, clip, selectedId);
  return place ? insertCopy(tree, clip, place) : null;
}

export function duplicateNode(tree: RocketTree, id: string): PastedCopy | null {
  const node = findNode(tree, id);
  if (!node) return null;
  const parent = findParent(tree, id);
  const place = {
    parentId: parent ? (parent.id as string) : null,
    index: (parent?.children ?? tree.components).length,
  };
  return insertCopy(tree, node, place);
}
