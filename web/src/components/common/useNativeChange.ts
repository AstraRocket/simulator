import { useEffect, type RefObject } from 'react';
import { useLatestRef } from './useLatestRef';

/**
 * Listen for the native `change` event on an input: it fires once, when the
 * user lets go of a slider or closes a color picker, where React's `onChange`
 * is the native `input` event and fires on every step of the drag. For a value
 * worth committing once (a setting write, an undo step). The handler is read
 * through a ref, so the listener is attached once.
 */
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
