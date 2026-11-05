import type { ReactNode } from 'react';
import { fmtNum, shortDigits } from '../../i18n/format';
import { polylinePath, areaPath } from '../common/svgPath';
import { seriesColor } from '../common/chartPalette';
import { hasCurve, type CatalogMotor } from '../../services/motors/motorDb';

export type XY = readonly [number, number];

export const CHART_HEADROOM = 1.08;

export interface ChartDims {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

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

export function ChartAxes({
  dims,
  tMax,
  fMax,
  X,
  Y,
  levels = [0, 0.5, 1],
  fScale = 1,
  fDigits = 0,
}: {
  dims: ChartDims;
  tMax: number;
  fMax: number;
  X: (t: number) => number;
  Y: (f: number) => number;
  levels?: number[];
  /** Multiplier from newtons to the unit the axis is labeled in. */
  fScale?: number;
  fDigits?: number;
}) {
  return (
    <>
      {levels.map((f) => {
        const gy = Y(fMax * f);
        return (
          <g key={f}>
            <line x1={dims.padL} y1={gy} x2={dims.width - dims.padR} y2={gy} className="stroke-line/10" />
            <text x={dims.padL - 4} y={gy + 3} textAnchor="end" className="fill-ink-faint text-[9px] tabular-nums">
              {fmtNum(fMax * f * fScale, fDigits)}
            </text>
          </g>
        );
      })}
      {[0, tMax / 2, tMax].map((tt, i) => (
        <text
          key={i}
          x={X(tt)}
          y={dims.height - 6}
          textAnchor="middle"
          className="fill-ink-faint text-[9px] tabular-nums"
        >
          {fmtNum(tt, shortDigits(tt))}
        </text>
      ))}
    </>
  );
}

/** First on a tie. `pts` must not be empty. */
export const highestSample = (pts: readonly XY[]): XY => pts.reduce((a, b) => (b[1] > a[1] ? b : a));

export function SeriesPath({
  pts,
  X,
  Y,
  color,
  strokeWidth,
  label,
  labelLift,
  labelClass,
}: {
  pts: readonly XY[];
  X: (t: number) => number;
  Y: (f: number) => number;
  color: string;
  strokeWidth: number;
  label?: string;
  /** In px. */
  labelLift: number;
  labelClass: string;
}) {
  const peak = highestSample(pts);
  return (
    <g>
      <path d={linePath(pts, X, Y)} fill="none" stroke={color} strokeWidth={String(strokeWidth)} />
      {label !== undefined && (
        <text x={X(peak[0])} y={Y(peak[1]) - labelLift} textAnchor="middle" className={labelClass} fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

export function LegendSwatch({
  color,
  width,
  strokeWidth = 2,
  dash,
  opacity,
  children,
}: {
  color: string;
  /** In px. */
  width: number;
  strokeWidth?: number;
  dash?: boolean;
  opacity?: number;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={width} height="4" aria-hidden>
        <line
          x1="0"
          y1="2"
          x2={width}
          y2="2"
          stroke={color}
          strokeWidth={String(strokeWidth)}
          strokeDasharray={dash ? '3 2' : undefined}
          strokeOpacity={opacity}
        />
      </svg>
      {children}
    </span>
  );
}

export interface MotorSeries {
  m: CatalogMotor;
  color: string;
  pts: [number, number][];
}

export function seriesFor(motors: readonly CatalogMotor[]): MotorSeries[] {
  return motors.filter(hasCurve).map((m, i) => ({ m, color: seriesColor(i), pts: m.curves?.[0]?.samples ?? [] }));
}
