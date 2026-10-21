/**
 * A revision counter several components can watch: a list kept in browser
 * storage, changed in one place and shown in another. `version` is a
 * `useSyncExternalStore` snapshot, `subscribe` takes a listener and returns the
 * unsubscribe, and `bump` is called after every change.
 */
export function changeSignal(): { version: () => number; subscribe: (fn: () => void) => () => void; bump: () => void } {
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    version: () => version,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    bump: () => {
      version++;
      for (const fn of listeners) fn();
    },
  };
}
