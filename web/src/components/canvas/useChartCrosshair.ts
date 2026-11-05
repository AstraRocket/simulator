import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export function useChartCrosshair(t0: number, t1: number) {
  const [hoverT, setHoverT] = useState<number | null>(null);
  // Live region text; pointer moves never set it, or hovering would queue an announcement per sample.
  const [keyT, setKeyT] = useState<number | null>(null);
  const clampT = (v: number) => Math.max(t0, Math.min(t1, v));

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const span = t1 - t0;
    if (!(span > 0)) return;
    const step = (e.shiftKey ? 10 : 1) * (span / 100);
    let next: number;
    if (e.key === 'ArrowRight') next = (hoverT ?? t0) + step;
    else if (e.key === 'ArrowLeft') next = (hoverT ?? t1) - step;
    else if (e.key === 'Home') next = t0;
    else if (e.key === 'End') next = t1;
    else if (e.key === 'Escape') {
      // A second Escape is left for the window, which leaves the maximized layout.
      if (hoverT != null) e.preventDefault();
      setHoverT(null);
      setKeyT(null);
      return;
    } else return;
    e.preventDefault();
    setHoverT(clampT(next));
    setKeyT(clampT(next));
  };
  const onFocus = () => setHoverT((h) => h ?? (t0 + t1) / 2);
  const onBlur = () => {
    setHoverT(null);
    setKeyT(null);
  };

  return { hoverT, keyT, setHoverT, clampT, onKeyDown, onFocus, onBlur };
}
