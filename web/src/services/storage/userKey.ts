import { useSyncExternalStore } from 'react';
import { nsKey } from './storageKeys';

/** Kept outside settings so no settings copy, saved design or crash file can carry the key. */
export interface UserKeyStore {
  read: () => string | undefined;
  write: (key: string) => boolean;
  use: () => string | undefined;
}

export function userKeyStore(suffix: string): UserKeyStore {
  const storageKey = nsKey(suffix);
  const listeners = new Set<() => void>();
  const read = (): string | undefined => {
    try {
      const v = localStorage.getItem(storageKey)?.trim();
      return v ? v : undefined;
    } catch {
      return undefined;
    }
  };
  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey || e.key === null) onChange();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onStorage);
    };
  };
  return {
    read,
    write: (key) => {
      try {
        const v = key.trim();
        if (v) localStorage.setItem(storageKey, v);
        else localStorage.removeItem(storageKey);
      } catch {
        return false;
      }
      for (const l of listeners) l();
      return true;
    },
    use: () => useSyncExternalStore(subscribe, read, () => undefined),
  };
}
