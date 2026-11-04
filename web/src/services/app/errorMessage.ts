export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function toError(e: unknown, message?: string): Error {
  return e instanceof Error ? e : new Error(message ?? errorMessage(e));
}
