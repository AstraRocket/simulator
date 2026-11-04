import { NO_VALUE } from '../../i18n/noValue';
import { finalizeSamples } from './curveFinalize';
import { samplesImpulse } from './motorMath';

export type Sample = [number, number]; // [time s, thrust N]

/** At the final sample it keeps that thrust, or `combineCurves` drops the last trapezoid of a non-zero end. */
export function thrustAt(samples: Sample[], t: number): number {
  const n = samples.length;
  if (n === 0) return 0;
  if (t < samples[0]![0]) return 0;
  if (t > samples[n - 1]![0]) return 0;
  // Two samples at one time are a vertical step; the last holds (Cesaroni I195 starts [0, 0] then [0, 10.17]).
  let last: number | undefined;
  for (let i = 0; i < n; i++) if (samples[i]![0] === t) last = samples[i]![1];
  if (last !== undefined) return last;
  for (let i = 1; i < n; i++) {
    const [t1, f1] = samples[i]!;
    if (t <= t1) {
      const [t0, f0] = samples[i - 1]!;
      const span = t1 - t0;
      return span <= 0 ? f1 : f0 + (f1 - f0) * ((t - t0) / span);
    }
  }
  return 0;
}

/** N·s. */
export const impulse = (samples: Sample[]): number => samplesImpulse(samples);

/** Seconds. */
const END_DROP_S = 1e-6;

export interface Combined {
  samples: Sample[];
  totalImpulse: number; // N·s
  peakThrust: number; // N
  motorCount: number;
}

export function combineCurves(curves: Sample[][]): Combined {
  const usable = curves.filter((c) => c.length >= 2).map((c) => finalizeSamples(c));
  if (usable.length === 0) {
    return { samples: [], totalImpulse: 0, peakThrust: 0, motorCount: 0 };
  }
  // A terminator just after a non-zero end makes its drop vertical instead of ramping.
  const times = new Set<number>();
  for (const c of usable) {
    for (const [t] of c) times.add(t);
    const last = c[c.length - 1]!;
    if (last[1] !== 0) times.add(last[0] + END_DROP_S);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const samples: Sample[] = sorted.map((t) => [t, usable.reduce((sum, c) => sum + thrustAt(c, t), 0)]);
  // Summed per curve (exact by linearity), not integrated from the resampled points.
  const totalImpulse = usable.reduce((sum, c) => sum + impulse(c), 0);
  const peakThrust = samples.reduce((m, s) => Math.max(m, s[1]), 0);
  return { samples, totalImpulse, peakThrust, motorCount: usable.length };
}

/** Indexed by n + 2: 1/8A is n = -2, 1/2A is n = 0. */
const SUB_A_CLASSES = ['1/8A', '1/4A', '1/2A'];

/** Class n (A = 1) tops out at 2.5*2^(n-1) N-s. */
export function impulseClass(ns: number): string {
  if (!Number.isFinite(ns) || ns <= 0) return NO_VALUE;
  const n = Math.ceil(Math.log2(ns / 2.5)) + 1;
  if (n > 15) return 'O';
  if (n >= 1) return String.fromCharCode(64 + n);
  return SUB_A_CLASSES[n + 2] ?? NO_VALUE;
}
