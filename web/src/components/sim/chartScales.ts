import { polylinePath, areaPath } from '../common/svgPath';
import { seriesColor } from '../common/chartPalette';
import { hasCurve, type CatalogMotor } from '../../services/motors/motorDb';
import type { MotorSeries, XY, ChartDims } from './chartAxes';

/** Y grows downward, with 0 at the baseline. */
export function chartScales(d: ChartDims, tMax: number, fMax: number) {
  const X = (tt: number) => d.padL + (tt / tMax) * (d.width - d.padL - d.padR);
  const Y = (f: number) => d.height - d.padB - (f / fMax) * (d.height - d.padT - d.padB);
  return { X, Y };
}

export const linePath = (pts: readonly XY[], X: (t: number) => number, Y: (f: number) => number): string =>
  polylinePath(pts.map((p) => [X(p[0]), Y(p[1])]));

export const baselineArea = (
  pts: readonly XY[],
  X: (t: number) => number,
  Y: (f: number) => number,
  tMax: number,
): string =>
  areaPath(
    pts.map((p) => [X(p[0]), Y(p[1])]),
    Y(0),
    'space',
    [X(0), X(tMax)],
  );

/** First on a tie. `pts` must not be empty. */
export const highestSample = (pts: readonly XY[]): XY => pts.reduce((a, b) => (b[1] > a[1] ? b : a));

export function seriesFor(motors: readonly CatalogMotor[]): MotorSeries[] {
  return motors.filter(hasCurve).map((m, i) => ({ m, color: seriesColor(i), pts: m.curves?.[0]?.samples ?? [] }));
}
