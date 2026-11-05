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
