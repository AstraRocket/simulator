/** Needed over `JSON.stringify` because `sanitizeSims` reorders keys on load; array order is kept. */
export function stableJson(value: unknown, skip?: ReadonlySet<string>): string {
  return JSON.stringify(value, (key, v: unknown) => {
    if (skip?.has(key)) return undefined;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k]]),
    );
  });
}
