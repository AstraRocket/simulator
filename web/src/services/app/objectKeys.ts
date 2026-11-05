/** Deletes rather than sets undefined: an explicit `undefined` would shadow the spread value underneath. */
export function withKey<T extends object, K extends keyof T>(obj: T | undefined, key: K, value: T[K] | null): T {
  const next = { ...obj } as T;
  if (value === null) delete (next as Record<PropertyKey, unknown>)[key];
  else next[key] = value;
  return next;
}

export function holdsKey<T extends object, K extends keyof T>(obj: T | undefined, key: K, value: T[K] | null): boolean {
  return value === null ? obj?.[key] === undefined : obj?.[key] === value;
}

export const nonEmpty = <T extends object>(obj: T): T | undefined => (Object.keys(obj).length ? obj : undefined);
