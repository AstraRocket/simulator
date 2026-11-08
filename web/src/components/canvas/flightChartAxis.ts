import type { FlightSeries } from '../../engine/openRocketEngine';

// HOST_INSET is the scroll host's px-3 left inset, added back when mapping pointer x.
export const PAD_L = 44;
export const PAD_R = 12;
export const HOST_INSET = 12;
export const PANEL_H = 208;
export const EVENT_ROW_H = 12;

export const minWindow = (maxT: number) => Math.max(maxT / 500, 0.05);

// Loop, do not spread: a six-figure argument list makes `Math.max` throw RangeError.
export function maxFlightTime(branches: { series: FlightSeries }[], flightTime: number | undefined): number {
  let m = Math.max(flightTime || 1, 1);
  for (const b of branches) for (const t of b.series.time ?? []) if (t > m) m = t;
  return m;
}

export interface TimeWindow {
  t0: number;
  t1: number;
}

export function clampWindow(a: number, b: number, maxT: number): TimeWindow | null {
  const width = Math.min(Math.max(b - a, minWindow(maxT)), maxT);
  if (width >= maxT - 1e-9) return null;
  const lo = Math.min(Math.max(a, 0), maxT - width);
  return { t0: lo, t1: lo + width };
}

export function zoomWindow(t0: number, t1: number, factor: number, anchorT: number, maxT: number): TimeWindow | null {
  const nw = (t1 - t0) * factor;
  const na0 = anchorT - (anchorT - t0) * factor;
  return clampWindow(na0, na0 + nw, maxT);
}

// Clamped at read time: a shorter re-run does not change the trace list, so an effect would not fire.
export function resolveWindow(zoom: TimeWindow | null, maxT: number): { t0: number; t1: number; zoomed: boolean } {
  const t1 = zoom ? Math.min(zoom.t1, maxT) : maxT;
  const t0 = zoom ? Math.min(zoom.t0, Math.max(0, t1 - minWindow(maxT))) : 0;
  return { t0, t1, zoomed: t1 - t0 < maxT - 1e-9 };
}
