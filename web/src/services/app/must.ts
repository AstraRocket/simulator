/** For a value the code already guarantees where the compiler cannot see why: fails loudly if that stops being true. */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}
