import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { useLatestRef } from './useLatestRef';

// Escape is taken in capture and marked `defaultPrevented` so other window listeners know it was spent.
export function usePopoverDismiss(
  open: boolean,
  close: () => void,
  wrapRef: RefObject<Element | null>,
  returnRef: RefObject<HTMLElement | null>,
): void {
  const closeRef = useLatestRef(close);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
      returnRef.current?.focus();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, wrapRef, returnRef, closeRef]);
}

const MENU_ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

// An item that closes the menu uses `closeAndRestore`, since closing unmounts the focused item.
export function useMenuPopover<T extends HTMLElement = HTMLButtonElement>({
  shown,
}: {
  shown?: (item: HTMLElement) => boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<T>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  usePopoverDismiss(open, () => setOpen(false), wrapRef, triggerRef);

  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu || menu.contains(document.activeElement)) return;
    menu.querySelector<HTMLElement>(MENU_ITEMS)?.focus();
  }, [open]);

  const onMenuKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      const menu = menuRef.current;
      if (!menu) return;
      if (e.key === 'Tab') {
        setOpen(false); // no preventDefault: focus proceeds out of the menu
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      e.stopPropagation();
      const all = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEMS));
      const items = shown ? all.filter(shown) : all;
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const to =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : e.key === 'ArrowDown'
              ? (i + 1) % items.length
              : i < 0
                ? items.length - 1
                : (i - 1 + items.length) % items.length;
      items[to]?.focus();
    },
    [shown],
  );

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  const closeAndRestore = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  return { open, toggle, close, closeAndRestore, wrapRef, triggerRef, menuRef, onMenuKeyDown };
}
