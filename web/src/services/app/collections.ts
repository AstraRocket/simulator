/**
 * Copy-on-write membership edits, so a checkbox list, a collapsed set or a
 * ticked selection toggles an item the same way everywhere.
 */

/** A new set with `item` taken out when it is in `set`, else put in. */
export function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(item)) next.add(item);
  return next;
}

/** A new map with `key` taken out when it is in `map`, else set to `value`. */
export function toggledEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): Map<K, V> {
  const next = new Map(map);
  if (!next.delete(key)) next.set(key, value);
  return next;
}

/** The distinct values `key` reads from `items`, alphabetical; an item it reads nothing from is skipped. */
export function distinctSorted<T>(items: readonly T[], key: (item: T) => string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const v = key(item);
    if (v != null) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** `items` grouped by `key`, the groups in the order each key first appears and each in input order. */
export function groupBy<T, K>(items: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
