// A leaf module: the slices are built while store.ts loads, so their runtime needs live outside it.

export interface EditSteps {
  /** Idempotent while a transaction is open. */
  beginEdit: () => void;
  commitEdit: () => void;
  recordStep: () => void;
}

export const replaceById = <T extends { id: string }>(list: readonly T[], id: string, fn: (row: T) => T): T[] =>
  list.map((x) => (x.id === id ? fn(x) : x));

/** First when there is no row `id`. */
export function insertAfter<T extends { id: string }>(list: readonly T[], id: string, item: T): T[] {
  const next = [...list];
  next.splice(list.findIndex((x) => x.id === id) + 1, 0, item);
  return next;
}
