import { useEffect, useRef } from 'react';

// `iframe` is listed so Tab reaches the Help dialog's content.
const FOCUSABLE = [
  'a[href]',
  'iframe',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
]
  .map((s) => `${s}:not([tabindex="-1"])`)
  .join(',');

export interface FocusTrapOptions {
  onEscape?: () => void;
}

const SURFACE = 'data-modal-surface';

let opened = 0;

// Open order, not document order (Help mounts early) and not z-index (jsdom cannot compute it from Tailwind).
export const topmostSurface = (): Element | null => {
  let top: Element | null = null;
  let topAt = -1;
  for (const el of document.querySelectorAll(`[${SURFACE}]`)) {
    const at = Number(el.getAttribute(SURFACE)) || 0;
    if (at >= topAt) {
      top = el;
      topAt = at;
    }
  }
  return top;
};

export const hasOpenSurface = (): boolean => topmostSurface() !== null;

// Attach the ref to the panel, not the backdrop.
export function useFocusTrap<T extends HTMLElement>(active: boolean, { onEscape }: FocusTrapOptions = {}) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.setAttribute(SURFACE, String(++opened));

    const focusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // React applies `autoFocus` during commit, before this effect; do not override it.
    if (!panel.contains(document.activeElement)) {
      const first = focusable()[0];
      if (first) first.focus();
      else {
        panel.tabIndex = -1;
        panel.focus();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = focusable();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = els[0]!;
      const lastEl = els[els.length - 1]!;
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === firstEl || !panel.contains(current)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (current === lastEl || !panel.contains(current)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    // Tab inside an iframe never reaches the keydown above, so focus can escape.
    const onFocusIn = (e: FocusEvent) => {
      if (topmostSurface() !== panel || panel.contains(e.target as Node)) return;
      const first = focusable()[0];
      if (first) first.focus();
      else panel.focus();
    };

    panel.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      panel.removeAttribute(SURFACE);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  // Separate so an inline `onEscape` does not re-run the trap and re-pull focus.
  useEffect(() => {
    if (!active || !onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const panel = ref.current;
      if (panel && topmostSurface() !== panel) return;
      onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);

  return ref;
}
