import { settleLinkedDimensions } from '../design/linkedDimensions';
import type { Workspace } from './workspaceStore';
import { isRecord } from '../app/numbers';
import { upgradeDocExtra, upgradeNotes } from './docExtraUpgrade';

/** Elements are checked, not just arrays: a `null` entry later throws in `hydrate`. */
export function migrateWorkspace(w: unknown): Workspace | null {
  const c = w as Partial<Workspace> | null;
  if (
    !c ||
    c.version !== 3 ||
    !isRecord(c.tree) ||
    !isComponentList((c.tree as { components?: unknown }).components) ||
    !Array.isArray(c.sims) ||
    c.sims.length === 0 ||
    !c.sims.every(hasStringId) ||
    !Array.isArray(c.configs) ||
    c.configs.length === 0 ||
    !c.configs.every(hasStringId)
  ) {
    return null;
  }
  return settled(c as Workspace);
}

function settled(w: Workspace): Workspace {
  const tree = settleLinkedDimensions(upgradeDocExtra(w.tree));
  const notes = w.loadedMeta?.notes;
  const upgradedNotes = Array.isArray(notes) ? upgradeNotes(notes) : notes;
  const meta =
    w.loadedMeta && upgradedNotes && upgradedNotes !== notes ? { ...w.loadedMeta, notes: upgradedNotes } : w.loadedMeta;
  return tree === w.tree && meta === w.loadedMeta ? w : { ...w, tree, loadedMeta: meta };
}

const hasStringId = (v: unknown): boolean => isRecord(v) && typeof v.id === 'string';

function isComponentList(v: unknown): boolean {
  return Array.isArray(v) && v.every((n) => isRecord(n) && (n.children === undefined || isComponentList(n.children)));
}
