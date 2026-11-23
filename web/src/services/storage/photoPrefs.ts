import { photoSettingsMap, readPhotoSettings, type PhotoSettings } from '../design/photoSettings';
import { readLocalJson, writeLocalJson } from './localPref';

// Photo Studio's settings belong to the browser, not to a design: every design is shot the same way until they change.
// Kept in desktop's key/value form so the same reader checks them.

const KEY = 'astra.photoStudio';

const isMap = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v as Record<string, unknown>).every((x) => typeof x === 'string');

let current: PhotoSettings | null = null;
const listeners = new Set<() => void>();

export function photoPrefs(): PhotoSettings {
  current ??= readPhotoSettings(readLocalJson(KEY, isMap, {}));
  return current;
}

export function setPhotoPrefs(s: PhotoSettings): void {
  current = s;
  writeLocalJson(KEY, photoSettingsMap(s));
  for (const cb of listeners) cb();
}

export function subscribePhotoPrefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
