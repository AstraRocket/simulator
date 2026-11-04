import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { HOST_INSET, PAD_L, clampWindow, resolveWindow, zoomWindow, type TimeWindow } from './flightChartAxis';
import { useNativeWheel } from '../common/useNativeWheel';

export function useChartZoom(hostRef: RefObject<HTMLDivElement | null>, maxT: number, iw: number) {
  const [zoom, setZoom] = useState<TimeWindow | null>(null);
  const { t0, t1, zoomed } = resolveWindow(zoom, maxT);
  // Stable so the per-panel path memo can key on it; hover re-renders every pointer move.
  const X = useCallback((tt: number) => PAD_L + ((tt - t0) / (t1 - t0)) * iw, [t0, t1, iw]);
  const invX = (px: number) => t0 + ((px - PAD_L) / iw) * (t1 - t0);
  const localX = (clientX: number) => {
    const host = hostRef.current;
    return host ? clientX - host.getBoundingClientRect().left - HOST_INSET : 0;
  };

  const zoomAt = (factor: number, anchorT: number) => setZoom(zoomWindow(t0, t1, factor, anchorT, maxT));
  const reset = () => setZoom(null);

  // Native non-passive listener so ctrl/pinch-wheel can preventDefault.
  useNativeWheel(hostRef, (e) => {
    const el = hostRef.current;
    if (!el || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const px = e.clientX - el.getBoundingClientRect().left - HOST_INSET;
    zoomAt(e.deltaY > 0 ? 1.2 : 1 / 1.2, invX(px));
  });

  const drag = useRef<{ x: number; t0: number; t1: number } | null>(null);
  const startPan = (e: ReactPointerEvent): boolean => {
    if (!zoomed) return false;
    drag.current = { x: e.clientX, t0, t1 };
    hostRef.current?.setPointerCapture?.(e.pointerId);
    return true;
  };
  const pan = (e: ReactPointerEvent): boolean => {
    if (!drag.current) return false;
    const span = drag.current.t1 - drag.current.t0;
    const dt = ((e.clientX - drag.current.x) / iw) * span;
    setZoom(clampWindow(drag.current.t0 - dt, drag.current.t1 - dt, maxT));
    return true;
  };
  const endPan = (e: ReactPointerEvent) => {
    if (drag.current) {
      drag.current = null;
      hostRef.current?.releasePointerCapture?.(e.pointerId);
    }
  };
  const isPanning = () => drag.current !== null;

  return { t0, t1, zoomed, X, invX, localX, zoomAt, reset, startPan, pan, endPan, isPanning };
}
