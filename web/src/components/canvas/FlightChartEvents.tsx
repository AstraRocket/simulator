import { EVENT_LABEL } from '../../services/flight/simReport';
import { EVENT_ROW_H, PAD_L, PAD_R } from './flightChartAxis';

export interface EventLabel {
  x: number;
  type: string;
  row: number;
}

export function packEventLabels(
  clusters: { x: number; type: string }[],
  w: number,
  labelW: (type: string) => number,
): EventLabel[] {
  const rowRight: number[] = [];
  return clusters
    .filter((g) => g.x >= PAD_L - 2 && g.x <= w - PAD_R + 2)
    .map((g) => {
      const half = labelW(g.type) / 2;
      let row = 0;
      while (row < rowRight.length && rowRight[row]! > g.x - half) row++;
      rowRight[row] = g.x + half;
      return { x: g.x, type: g.type, row };
    });
}

export function eventStripHeight(labels: EventLabel[]): number {
  const rows = labels.reduce((m, l) => Math.max(m, l.row + 1), 0);
  return rows ? rows * EVENT_ROW_H + 4 : 0;
}

export function EventLabelStrip({
  labels,
  w,
  stripH,
  t,
}: {
  labels: EventLabel[];
  w: number;
  stripH: number;
  t: (key: string) => string;
}) {
  return (
    <svg
      viewBox={`0 0 ${w} ${stripH}`}
      width="100%"
      height={stripH}
      preserveAspectRatio="none"
      className="sticky top-0 z-10 block bg-surface"
    >
      {labels.map((l, i) => (
        <g key={i}>
          <line
            x1={l.x}
            y1={l.row * EVENT_ROW_H + EVENT_ROW_H - 2}
            x2={l.x}
            y2={stripH}
            className="stroke-warn-400/30"
            vectorEffect="non-scaling-stroke"
          />
          <text x={l.x} y={l.row * EVENT_ROW_H + 9} textAnchor="middle" className="fill-warn-400/90 text-[9px]">
            {t(EVENT_LABEL[l.type] ?? l.type)}
          </text>
        </g>
      ))}
    </svg>
  );
}
