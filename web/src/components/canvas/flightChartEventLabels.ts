import { EVENT_ROW_H, PAD_L, PAD_R } from './flightChartAxis';
import type { EventLabel } from './FlightChartEvents';

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
