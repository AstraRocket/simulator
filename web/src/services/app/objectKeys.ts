/**
 * Copy-on-write edits to a plain object map (an override map, a settings
 * block), so a key set or cleared reads the same everywhere.
 */

/**
 * `obj` with `key` set to `value`, or with `key` removed for `null`; a new
 * object either way. Removed rather than stored as undefined: an override map
 * is spread or patched over the design and the global settings, and an
 * explicit `undefined` would shadow the value underneath with nothing.
 */
export function withKey<T extends object, K extends keyof T>(obj: T | undefined, key: K, value: T[K] | null): T {
  const next = { ...obj } as T;
  if (value === null) delete (next as Record<PropertyKey, unknown>)[key];
  else next[key] = value;
  return next;
}

/**
 * Whether `withKey(obj, key, value)` would leave `obj` saying what it already
 * says: the value is already there, or a cleared key is already absent.
 */
export function holdsKey<T extends object, K extends keyof T>(obj: T | undefined, key: K, value: T[K] | null): boolean {
  return value === null ? obj?.[key] === undefined : obj?.[key] === value;
}

/** The map, or undefined when it holds nothing: an empty override map reads as "overridden with nothing". */
export const nonEmpty = <T extends object>(obj: T): T | undefined => (Object.keys(obj).length ? obj : undefined);
