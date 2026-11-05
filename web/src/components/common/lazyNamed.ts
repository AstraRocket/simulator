import { lazy, type ComponentType } from 'react';

/** Browsers word a failed chunk fetch differently with no distinct error type, so the message is all there is. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    /dynamically imported module|module script failed|MIME type|Loading chunk/i.test(error.message)
  );
}

// `any` is React.lazy's own constraint; the real props type is kept through T.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<K extends string, T extends ComponentType<any>>(load: () => Promise<Record<K, T>>, key: K) {
  return lazy(() => load().then((m) => ({ default: m[key] })));
}
