// Channels share production's origin, so each needs its own prefix. `typeof`: Playwright imports this in Node.
const channel = typeof __APP_CHANNEL__ === 'string' ? __APP_CHANNEL__ : '';
export const STORAGE_PREFIX = channel ? `astrarocket-${channel}` : 'astrarocket';

/** `nsKey('designs:index')` is `astrarocket:designs:index` (storageKeys.test.ts requires this spelling here). */
export function nsKey(suffix: string): string {
  return `${STORAGE_PREFIX}:${suffix}`;
}
