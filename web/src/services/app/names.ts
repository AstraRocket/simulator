/** User-given names match ignoring case and surrounding space. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A blank name is never taken; the caller refuses it on its own terms. */
export function nameTaken(name: string, taken: readonly string[]): boolean {
  return name.trim() !== '' && taken.some((n) => sameName(n, name));
}
