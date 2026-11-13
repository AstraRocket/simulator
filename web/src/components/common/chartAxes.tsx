import type { ReactNode } from 'react';

/** Horizontal gridlines across `x1`..`x2`, each labeled left of the plot. */
export function YGridRows({
  values,
  Y,
  x1,
  x2,
  label,
}: {
  values: readonly number[];
  Y: (v: number) => number;
  x1: number;
  x2: number;
  label: (v: number) => ReactNode;
}) {
  return (
    <>
      {values.map((v, i) => {
        const gy = Y(v);
        return (
          <g key={i}>
            <line x1={x1} y1={gy} x2={x2} y2={gy} className="stroke-line/10" />
            <text x={x1 - 4} y={gy + 3} textAnchor="end" className="fill-ink-faint text-[9px] tabular-nums">
              {label(v)}
            </text>
          </g>
        );
      })}
    </>
  );
}

export interface PlotFrame {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

/** Left and bottom axes with end values and unit symbols; values are muted, symbols faint. */
export function LAxes({
  frame,
  xLo,
  xHi,
  xSym,
  yLo,
  yHi,
  ySym,
}: {
  frame: PlotFrame;
  xLo: ReactNode;
  xHi: ReactNode;
  xSym: ReactNode;
  yLo?: ReactNode;
  yHi?: ReactNode;
  ySym: ReactNode;
}) {
  const { width: W, height: H, padL, padR, padT, padB } = frame;
  const base = H - padB;
  return (
    <>
      <line x1={padL} y1={padT} x2={padL} y2={base} className="stroke-ink-dim" />
      <line x1={padL} y1={base} x2={W - padR} y2={base} className="stroke-ink-dim" />
      {yHi !== undefined && (
        <text x={padL - 4} y={padT + 8} textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
          {yHi}
        </text>
      )}
      {yLo !== undefined && (
        <text x={padL - 4} y={base} textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
          {yLo}
        </text>
      )}
      <text x={4} y={(base + padT) / 2} className="fill-ink-faint text-[10px]">
        {ySym}
      </text>
      <text x={padL} y={base + 13} textAnchor="start" className="fill-ink-muted text-[10px] tabular-nums">
        {xLo}
      </text>
      <text x={W - padR} y={base + 13} textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
        {xHi}
      </text>
      <text x={(padL + W - padR) / 2} y={H - 4} textAnchor="middle" className="fill-ink-faint text-[10px]">
        {xSym}
      </text>
    </>
  );
}
