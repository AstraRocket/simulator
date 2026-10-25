/**
 * Reading a persisted workspace: shape-check it, and settle what the current
 * build derives from it.
 *
 * Every path that reads stored bytes goes through {@link migrateWorkspace} -
 * boot, the unload journal, and File > Open - so nothing downstream ever sees a
 * shape this build cannot read.
 */
import { settleLinkedDimensions } from '../design/linkedDimensions';
import type { Workspace } from './workspaceStore';
import { isRecord } from '../app/numbers';

/**
 * Accept a stored workspace of the current version, or null.
 *
 * Null covers a truncated or hand-edited blob, and a version this build does not
 * know: `tree.components` that is not an array would crash `buildTree` deep in
 * the kernel rather than fail cleanly here, and a workspace written by a newer
 * build (an installed PWA can have an older one cached) must be refused rather
 * than half-read. The caller decides what a refusal means - the boot path
 * detaches rather than overwriting the design it could not read.
 *
 * The elements are checked too, not just the arrays: a `null` simulation,
 * configuration or component passes an array check and then throws in the
 * readers that dereference every entry (re-attaching flights, `hydrate`), after
 * the boot path has already taken its claim on the stored design.
 */
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
    // Every simulation's motors live in `configs`, so a blob without one is
    // not a workspace.
    !Array.isArray(c.configs) ||
    c.configs.length === 0 ||
    !c.configs.every(hasStringId)
  ) {
    return null;
  }
  return settled(c as Workspace);
}

/**
 * The workspace with its rail buttons and centering rings held as the kernel
 * builds them, so the panel shows what flies. A workspace with nothing to change
 * comes back as the same object.
 */
function settled(w: Workspace): Workspace {
  const tree = settleLinkedDimensions(w.tree);
  return tree === w.tree ? w : { ...w, tree };
}

/** A simulation or configuration: an object carrying its id. */
const hasStringId = (v: unknown): boolean => isRecord(v) && typeof v.id === 'string';

/** Components are objects, and a component's `children`, when present, are components too. */
function isComponentList(v: unknown): boolean {
  return Array.isArray(v) && v.every((n) => isRecord(n) && (n.children === undefined || isComponentList(n.children)));
}
