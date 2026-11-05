import { useLayoutEffect, useRef } from 'react';

// A layout effect, so an event between commit and the passive effects reads the new value.
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
