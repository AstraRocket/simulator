import { useEffect, type RefObject } from 'react';
import { useLatestRef } from './useLatestRef';

/**
 * A native, non-passive wheel listener on `ref`'s element. React's `onWheel`
 * is passive, so the `preventDefault` that keeps the page from scrolling under
 * a zoomable view has to be attached here. Attached once per element (and while
 * `enabled`); the handler is read through a ref, so a handler that closes over
 * the view's current state never re-attaches the listener, which would be a
 * remove and add pair per wheel notch.
 */
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
