// Desktop's material manager (`MaterialEditPanel`, `CustomMaterialDialog` in 24.12).
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

export type MaterialScope = 'design' | 'library';

export interface ScopedMaterial extends DocumentMaterial {
  group: string;
  scope: MaterialScope;
}

/** Each `apply` is one undo step. */
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

const changeList = (tree: RocketTree, fn: (list: DocumentMaterial[]) => DocumentMaterial[]): RocketTree =>
  withDocumentMaterials(tree, fn(documentMaterialsOf(tree)));

const sameValues = (a: ScopedMaterial, b: ScopedMaterial): boolean =>
  a.name === b.name && a.density === b.density && a.group === b.group;

export async function saveMaterial(
  design: DesignAccess,
  old: ScopedMaterial | null,
  draft: ScopedMaterial,
): Promise<void> {
  const next = { ...draft, name: checkedMaterialName(draft.name, draft.density) };
  if (next.scope === 'library') {
    // One entry per name+type, so a save under another's name would overwrite it.
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

  // Into the browser list: parts keep the old material, so it stays in the design while used.
  const used = partsUsing(design.tree(), old).length > 0;
  if (old.scope === 'design' && !used) {
    design.apply((t) => changeList(t, (l) => withoutDocumentMaterial(l, asDocument(old))));
  } else if (old.scope === 'library' && used && !sameValues(old, next)) {
    design.apply((t) => changeList(t, (l) => withDocumentMaterial(l, asDocument(old))));
  }
}

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

/** Desktop's "Revert all": parts keep what they are made of. */
export async function deleteAllMaterials(design: DesignAccess): Promise<void> {
  for (const m of await listCustom()) await removeCustom(m.name, m.type);
  design.apply((t) => withDocumentMaterials(t, []));
}
