import type { ReactNode } from 'react';
import { fmtNum, shortDigits } from '../../i18n/format';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { linePath, highestSample } from './chartScales';
import { YGridRows } from '../common/chartAxes';

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
      <YGridRows
        values={levels.map((f) => fMax * f)}
        Y={Y}
        x1={dims.padL}
        x2={dims.width - dims.padR}
        label={(f) => fmtNum(f * fScale, fDigits)}
      />
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
