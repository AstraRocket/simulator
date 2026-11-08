import { useEffect, type RefObject } from 'react';
import { useLatestRef } from './useLatestRef';

// React's `onChange` is the native `input` event (every drag step); native `change` fires once on release.
export function useNativeChange(
  ref: RefObject<HTMLInputElement | null>,
  onChange: (el: HTMLInputElement) => void,
): void {
  const handler = useLatestRef(onChange);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listen = () => handler.current(el);
    el.addEventListener('change', listen);
    return () => el.removeEventListener('change', listen);
  }, [ref, handler]);
}
