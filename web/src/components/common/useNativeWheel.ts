import { useEffect, type RefObject } from 'react';
import { useLatestRef } from './useLatestRef';

// React's `onWheel` is passive and cannot `preventDefault` page scroll.
export function useNativeWheel(ref: RefObject<Element | null>, onWheel: (e: WheelEvent) => void, enabled = true): void {
  const handler = useLatestRef(onWheel);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const listen = (e: Event) => handler.current(e as WheelEvent);
    el.addEventListener('wheel', listen, { passive: false });
    return () => el.removeEventListener('wheel', listen);
  }, [ref, enabled, handler]);
}
