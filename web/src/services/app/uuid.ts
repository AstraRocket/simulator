/** `crypto.randomUUID` is missing outside secure contexts, hence the fallback. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/** Each caller keeps the shape its stored ids already have; do not unify them. */
export function shortId(prefix: string, randomChars: number, sep = ''): string {
  return `${prefix}${Date.now().toString(36)}${sep}${Math.random()
    .toString(36)
    .slice(2, 2 + randomChars)}`;
}
