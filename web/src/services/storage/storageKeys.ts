/**
 * The app's storage namespace. Every `localStorage` key and the IndexedDB
 * database name are built from this and nowhere else.
 *
 * `storageKeys.test.ts` holds the one-home property: no file but this one spells
 * a key, which is this prefix followed by a colon. The bare project name is free
 * to appear anywhere - it is the package name and the product name - and only the
 * `prefix:` form is a storage key.
 *
 * The beta site is served from the same origin as production, so it shares
 * localStorage and IndexedDB with it. A beta build therefore takes its own
 * prefix (`astrarocket-beta`): its designs and settings never reach
 * production's, and a beta schema version can never be one production's
 * `indexedDB.open` refuses.
 *
 * `typeof` because the Playwright specs import this in Node, where no build
 * defines the channel; they test the production build.
 */
const channel = typeof __APP_CHANNEL__ === 'string' ? __APP_CHANNEL__ : '';
export const STORAGE_PREFIX = channel ? `astrarocket-${channel}` : 'astrarocket';

/**
 * A namespaced key: `nsKey('designs:index')` is `astrarocket:designs:index`.
 *
 * Takes the part after the colon, so no caller writes the prefix or the
 * separator and none can disagree about either.
 */
export function nsKey(suffix: string): string {
  return `${STORAGE_PREFIX}:${suffix}`;
}
