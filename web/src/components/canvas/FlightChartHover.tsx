import { fmtNum } from '../../i18n/format';
import { hoverValue } from './flightChartHoverValue';

// The e2e suite selects on the crosshair's `data-crosshair`.
export function CrosshairLine({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  return (
    <line
      x1={x}
      y1={top}
      x2={x}
      y2={bottom}
      data-crosshair
      className="stroke-ink-soft/40"
      vectorEffect="non-scaling-stroke"
    />
  );
}

export interface HoverSeries {
  color: string;
  xs: number[];
  ys: number[];
  t0?: number;
  t1?: number;
}

export function PanelHover({
  hoverT,
  list,
  X,
  Y,
  top,
  bottom,
  single,
  digits,
}: {
  hoverT: number;
  list: HoverSeries[];
  X: (t: number) => number;
  Y: (v: number) => number;
  top: number;
  bottom: number;
  single: boolean;
  digits: number;
}) {
  return (
    <g pointerEvents="none">
      <CrosshairLine x={X(hoverT)} top={top} bottom={bottom} />
      {list.map((s, i) => {
        const hv = hoverValue(s, hoverT);
        if (hv == null) return null;
        return (
          <g key={i}>
            <circle cx={X(hoverT)} cy={Y(hv)} r={3} fill={s.color} />
            {!single && (
              <text x={X(hoverT) + 5} y={Y(hv) - 3} className="text-[9px] tabular-nums" fill={s.color}>
                {fmtNum(hv, digits)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
