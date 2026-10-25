import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest `value`, for a native listener or an
 * effect that must call the newest callback without re-subscribing on every
 * render. Updated in a layout effect, so an event that lands between a commit
 * and the passive effects already reads the new value.
 */
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
