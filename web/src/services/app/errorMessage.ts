/** What went wrong, as text, from anything a `catch` can hold. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Anything a `catch` can hold, as an `Error`: the error itself, else a new one
 * carrying `message` or, without one, the value as text.
 */
export function toError(e: unknown, message?: string): Error {
  return e instanceof Error ? e : new Error(message ?? errorMessage(e));
}
