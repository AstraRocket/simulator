// What a material change does to a design: which parts are made of a
// material, and those parts moved onto another one. Custom Materials needs both,
// because desktop's material manager (`MaterialEditPanel` in 24.12) decides
// every delete and edit by whether components use the material.
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { mapTreePreserving, walkNodes } from '../../tree/treeWalk';
import { mathEquals } from '../motors/mathEquals';
import type { DocumentMaterial } from './documentMaterials';
import type { MaterialType } from './materialTypes';
import { FILLET_MATERIAL_KEYS, MATERIAL_KEYS, type MaterialKeys } from '../design/materialSlots';

/** A material as a part names it: what a usage check compares. */
export type MaterialRef = Pick<DocumentMaterial, 'name' | 'type' | 'density'> & { group?: string };

/**
 * Every place a part keeps a material of each type: a structural part's bulk
 * material and a fin's fillet bead, a recovery device's canopy or strip, and
 * the line material of shroud lines and shock cords.
 */
const SLOTS: Record<MaterialType, MaterialKeys[]> = {
  bulk: [MATERIAL_KEYS.bulk, FILLET_MATERIAL_KEYS],
  surface: [MATERIAL_KEYS.surface],
  line: [MATERIAL_KEYS.line],
};

/**
 * Whether a slot holds the material: its name and its density, as desktop's
 * `getComponentsThatUseMaterial` compares with `Material.equals`. The group is
 * left out, since only the bulk slots store one.
 */
function holds(node: ComponentNode, slot: MaterialKeys, m: MaterialRef): boolean {
  const density = node[slot.density];
  return node[slot.name] === m.name && typeof density === 'number' && mathEquals(density, m.density);
}

/** The parts of the design made of `m`, in tree order. */
export function partsUsing(tree: Pick<RocketTree, 'components'>, m: MaterialRef): ComponentNode[] {
  const slots = SLOTS[m.type];
  return [...walkNodes(tree.components)].filter((n) => slots.some((s) => holds(n, s, m)));
}

/**
 * The design with every part made of `from` made of `to` instead, sharing
 * every part that is not. Desktop gets this by editing the one `Material`
 * object its components share (`Material.loadFrom`); here each part holds its
 * own copy, so each is rewritten.
 */
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
