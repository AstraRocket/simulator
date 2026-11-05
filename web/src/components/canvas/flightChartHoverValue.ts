import { lerpAt } from '../../services/flight/interpolate';
import type { HoverSeries } from './FlightChartHover';

// Null outside the stage's own span, so a landed booster shows no clamped dot.
export function hoverValue(s: Pick<HoverSeries, 'xs' | 'ys' | 't0' | 't1'>, hoverT: number): number | null {
  return s.t0 != null && s.t1 != null && hoverT >= s.t0 && hoverT <= s.t1 ? lerpAt(s.xs, s.ys, hoverT) : null;
}
