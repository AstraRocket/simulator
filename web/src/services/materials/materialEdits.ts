import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { mapTreePreserving, walkNodes } from '../../tree/treeWalk';
import { mathEquals } from '../motors/mathEquals';
import type { DocumentMaterial } from './documentMaterials';
import type { MaterialType } from './materialTypes';
import { FILLET_MATERIAL_KEYS, MATERIAL_KEYS, type MaterialKeys } from '../design/materialSlots';

export type MaterialRef = Pick<DocumentMaterial, 'name' | 'type' | 'density'> & { group?: string };

const SLOTS: Record<MaterialType, MaterialKeys[]> = {
  bulk: [MATERIAL_KEYS.bulk, FILLET_MATERIAL_KEYS],
  surface: [MATERIAL_KEYS.surface],
  line: [MATERIAL_KEYS.line],
};

// Name and density, as `getComponentsThatUseMaterial` compares; not group.
function holds(node: ComponentNode, slot: MaterialKeys, m: MaterialRef): boolean {
  const density = node[slot.density];
  return node[slot.name] === m.name && typeof density === 'number' && mathEquals(density, m.density);
}

export function partsUsing(tree: Pick<RocketTree, 'components'>, m: MaterialRef): ComponentNode[] {
  const slots = SLOTS[m.type];
  return [...walkNodes(tree.components)].filter((n) => slots.some((s) => holds(n, s, m)));
}

// Desktop edits one shared `Material` object (`Material.loadFrom`); here each part holds its own copy.
export function withMaterialReplaced<T extends Pick<RocketTree, 'components'>>(
  tree: T,
  from: MaterialRef,
  to: MaterialRef,
): T {
  const slots = SLOTS[from.type];
  const components = mapTreePreserving(
    tree.components,
    (node) => {
      let next = node;
      for (const s of slots) {
        if (!holds(next, s, from)) continue;
        next = { ...next, [s.name]: to.name, [s.density]: to.density };
        if (s.group) next = { ...next, [s.group]: to.group || undefined };
      }
      return next;
    },
    'pre',
  );
  return components === tree.components ? tree : { ...tree, components };
}
