// localStorage throws when site data is blocked.
export function readLocalJson<T>(key: string, valid: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
