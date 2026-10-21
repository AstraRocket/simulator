// The rules of Custom Materials, which are desktop's material manager
// (`MaterialEditPanel` and `CustomMaterialDialog` in 24.12) applied to the two
// lists this app keeps: the design's own materials (desktop's document
// materials, saved in the `.ork`) and the user's custom materials in this
// browser (desktop's application database).
//
// - Edit: a material that ends up in the design moves every part made of the
//   old one onto it, as desktop edits the one `Material` its parts share. One
//   that ends up in the browser list leaves the parts alone, and if parts use
//   the old one, the old one stays in the design so they keep a listed material.
// - Delete: a design material that parts use is refused. A browser material
//   that parts use is deleted and kept in the design instead.
// - Delete all: both lists, as desktop's "Revert all" removes every
//   user-defined material. Parts keep what they are made of.
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { KeyedError } from '../../i18n/keyedError';
import {
  documentMaterialsOf,
  withDocumentMaterial,
  withDocumentMaterials,
  withoutDocumentMaterial,
  type DocumentMaterial,
} from './documentMaterials';
import { addCustom, checkedMaterialName, listCustom, removeCustom } from './materials';
import { partsUsing, withMaterialReplaced } from './materialEdits';

/** Which list a material is in. */
export type MaterialScope = 'design' | 'library';

export interface ScopedMaterial extends DocumentMaterial {
  group: string;
  scope: MaterialScope;
}

/** The open design, read and changed as one undo step per change. */
export interface DesignAccess {
  tree: () => RocketTree;
  apply: (change: (tree: RocketTree) => RocketTree) => void;
}

const asDocument = ({ name, type, density, group }: ScopedMaterial): DocumentMaterial => ({
  name,
  type,
  density,
  ...(group ? { group } : {}),
});

/** The tree with its own material list changed by `fn`. */
const changeList = (tree: RocketTree, fn: (list: DocumentMaterial[]) => DocumentMaterial[]): RocketTree =>
  withDocumentMaterials(tree, fn(documentMaterialsOf(tree)));

const sameValues = (a: ScopedMaterial, b: ScopedMaterial): boolean =>
  a.name === b.name && a.density === b.density && a.group === b.group;

/**
 * Save `next`, a new material when `old` is null, else an edit of `old`.
 * Throws a keyed error for a blank name or a density that is not above zero,
 * and the store's error for a refused write, with nothing changed.
 */
export async function saveMaterial(
  design: DesignAccess,
  old: ScopedMaterial | null,
  draft: ScopedMaterial,
): Promise<void> {
  const next = { ...draft, name: checkedMaterialName(draft.name, draft.density) };
  if (next.scope === 'library') {
    // The browser list holds one material per name and type, so a save under
    // another entry's name would overwrite that entry.
    const isOld = (m: { name: string; type: string }) =>
      old?.scope === 'library' && m.name === old.name && m.type === old.type;
    if ((await listCustom()).some((m) => m.name === next.name && m.type === next.type && !isOld(m))) {
      throw new KeyedError('errors.material.nameTaken', { name: next.name });
    }
    await addCustom(next.name, next.type, next.density, next.group);
    if (old?.scope === 'library' && old.name !== next.name) await removeCustom(old.name, old.type);
  }

  if (!old) {
    if (next.scope === 'design') design.apply((t) => changeList(t, (l) => withDocumentMaterial(l, asDocument(next))));
    return;
  }

  if (next.scope === 'design') {
    if (old.scope === 'library') await removeCustom(old.name, old.type);
    design.apply((t) =>
      changeList(withMaterialReplaced(t, old, next), (l) =>
        withDocumentMaterial(withoutDocumentMaterial(l, asDocument(old)), asDocument(next)),
      ),
    );
    return;
  }

  // Into the browser list: the parts keep the old material, and it stays in
  // (or joins) the design for them while they use it.
  const used = partsUsing(design.tree(), old).length > 0;
  if (old.scope === 'design' && !used) {
    design.apply((t) => changeList(t, (l) => withoutDocumentMaterial(l, asDocument(old))));
  } else if (old.scope === 'library' && used && !sameValues(old, next)) {
    design.apply((t) => changeList(t, (l) => withDocumentMaterial(l, asDocument(old))));
  }
}

/**
 * Delete `m`. A design material some parts are made of is refused, and the
 * parts are returned so the caller can name them; nothing else is.
 */
export async function deleteMaterial(design: DesignAccess, m: ScopedMaterial): Promise<ComponentNode[] | null> {
  const users = partsUsing(design.tree(), m);
  if (m.scope === 'design') {
    if (users.length) return users;
    design.apply((t) => changeList(t, (l) => withoutDocumentMaterial(l, asDocument(m))));
    return null;
  }
  await removeCustom(m.name, m.type);
  if (users.length) design.apply((t) => changeList(t, (l) => withDocumentMaterial(l, asDocument(m))));
  return null;
}

/** Delete every custom material in this browser and every material of the design's own. */
export async function deleteAllMaterials(design: DesignAccess): Promise<void> {
  for (const m of await listCustom()) await removeCustom(m.name, m.type);
  design.apply((t) => withDocumentMaterials(t, []));
}
