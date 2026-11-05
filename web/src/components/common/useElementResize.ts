import { useEffect, type RefObject } from 'react';
import { useLatestRef } from './useLatestRef';

export function useElementResize<T extends Element>(
  ref: RefObject<T | null>,
  onResize: (rect: DOMRectReadOnly, el: T) => void,
): void {
  // So an inline callback does not re-subscribe the observer every render.
  const latest = useLatestRef(onResize);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) latest.current(entry.contentRect, el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, latest]);
}
