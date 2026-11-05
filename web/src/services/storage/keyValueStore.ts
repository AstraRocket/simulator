import { toError } from '../app/errorMessage';
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  /** Rejects on a failed read instead of answering null. */
  getChecked?(key: string): Promise<string | null>;
  /** Resolves false when refused (quota, blocked). */
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** Atomic across tabs; returning null removes the key. */
  update(key: string, fn: (raw: string | null) => string | null): Promise<boolean>;
}

export class LocalStorageKeyValueStore implements KeyValueStore {
  get(key: string): Promise<string | null> {
    try {
      return Promise.resolve(localStorage.getItem(key));
    } catch {
      return Promise.resolve(null);
    }
  }

  getChecked(key: string): Promise<string | null> {
    try {
      return Promise.resolve(localStorage.getItem(key));
    } catch (e) {
      return Promise.reject(toError(e, 'localStorage read failed'));
    }
  }

  set(key: string, value: string): Promise<boolean> {
    try {
      localStorage.setItem(key, value);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      // best-effort
    }
    return Promise.resolve();
  }

  /** Atomic within this tab only. */
  async update(key: string, fn: (raw: string | null) => string | null): Promise<boolean> {
    let current: string | null;
    try {
      current = localStorage.getItem(key);
    } catch {
      return false;
    }
    const next = fn(current);
    if (next === null) {
      await this.remove(key);
      return true;
    }
    return await this.set(key, next);
  }
}
