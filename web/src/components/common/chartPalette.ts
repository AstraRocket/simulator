import { token } from './colorTokens';

/** Fixed CVD-safe order; do not reorder. */
export const CATEGORICAL: readonly string[] = [
  token('chart-1'),
  token('chart-2'),
  token('chart-3'),
  token('chart-4'),
  token('chart-5'),
  token('chart-6'),
  token('chart-7'),
  token('chart-8'),
];

const OVERFLOW = token('ink-muted');

const MOTOR_SLOTS = 6;

export const seriesColor = (i: number): string => (i < MOTOR_SLOTS ? (CATEGORICAL[i] ?? OVERFLOW) : OVERFLOW);
