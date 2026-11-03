/**
 * What the configuration, simulation and run slices share with the editing core
 * in store.ts, and the row helpers they all use.
 *
 * A leaf module: the slices are built while store.ts loads, so anything they
 * need at run time has to live outside it.
 */

/**
 * The undo plumbing the slices record their edits through (see store.ts).
 *
 * - `beginEdit` opens a transaction for a continuous edit (typing, a slider);
 *   idempotent while one is open.
 * - `commitEdit` finalizes the open transaction into one undo entry.
 * - `recordStep` closes any open transaction, then records this change as its
 *   own atomic step.
 */
export interface EditSteps {
  beginEdit: () => void;
  commitEdit: () => void;
  recordStep: () => void;
}

/** `list` with row `id` replaced by `fn(row)`, every other row the same object. */
export const replaceById = <T extends { id: string }>(list: readonly T[], id: string, fn: (row: T) => T): T[] =>
  list.map((x) => (x.id === id ? fn(x) : x));

/** `list` with `item` just after row `id`, or first when there is no such row. */
export function insertAfter<T extends { id: string }>(list: readonly T[], id: string, item: T): T[] {
  const next = [...list];
  next.splice(list.findIndex((x) => x.id === id) + 1, 0, item);
  return next;
}
