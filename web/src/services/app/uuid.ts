/**
 * RFC-4122 v4 UUID. Uses `crypto.randomUUID()` where available and falls back
 * to a `Math.random()` template for older environments. Generic: used for
 * `.ork` component `<id>`s, simulation ids, and anywhere a globally-unique id is
 * needed. (Distinct from orkTree's `freshId()`, which mints short sequential
 * node ids like `c1` for parts read from a file, not UUIDs.)
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/**
 * A short id for something kept in this browser (a design, a tab, a saved part):
 * `prefix`, the time in base 36, `sep`, then `randomChars` base-36 random
 * characters. Collision-free enough per browser, and sorted roughly by age.
 * Each caller keeps the shape its stored ids already have.
 */
export function shortId(prefix: string, randomChars: number, sep = ''): string {
  return `${prefix}${Date.now().toString(36)}${sep}${Math.random()
    .toString(36)
    .slice(2, 2 + randomChars)}`;
}
