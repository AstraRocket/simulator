import type { CatalogMotor } from './motorDb';
import { CATALOG_TO_SI } from './catalogUnits';

export const G0 = 9.80665;

/** [time (s), thrust (N)] */
export type ThrustSample = readonly [number, number];

export const avgThrustOf = (m: CatalogMotor): number => m.avgThrust ?? (m.burn > 0 ? m.impulse / m.burn : 0);

/** Seconds. */
export const ispOf = (m: CatalogMotor): number =>
  m.propWeightG ? m.impulse / (m.propWeightG * CATALOG_TO_SI * G0) : NaN;

/** Percent. */
export const massFracOf = (m: CatalogMotor): number => (m.propWeightG && m.mass ? (m.propWeightG / m.mass) * 100 : NaN);

export function cumulativeImpulse(times: ArrayLike<number>, thrusts: ArrayLike<number>): number[] {
  if (times.length === 0) return [];
  const out = [0];
  for (let i = 1; i < times.length; i++) {
    out.push(out[i - 1]! + ((times[i]! - times[i - 1]!) * (thrusts[i]! + thrusts[i - 1]!)) / 2);
  }
  return out;
}

export function trapezoidImpulse(times: ArrayLike<number>, thrusts: ArrayLike<number>): number {
  let impulse = 0;
  for (let i = 1; i < times.length; i++) {
    impulse += ((times[i]! - times[i - 1]!) * (thrusts[i]! + thrusts[i - 1]!)) / 2;
  }
  return impulse;
}

export const specSamples = (m: { times: readonly number[]; thrusts: readonly number[] }): [number, number][] =>
  m.times.map((t, i) => [t, m.thrusts[i] ?? 0]);

export const samplesImpulse = (samples: readonly ThrustSample[]): number =>
  trapezoidImpulse(
    samples.map((s) => s[0]),
    samples.map((s) => s[1]),
  );

export function curveStats(samples: readonly ThrustSample[]): {
  impulse: number;
  burn: number;
  avg: number;
  max: number;
} {
  const impulse = samplesImpulse(samples);
  const burn = samples.length ? samples[samples.length - 1]![0] : 0;
  const avg = burn > 0 ? impulse / burn : 0;
  let max = 0;
  for (const s of samples) if (s[1] > max) max = s[1];
  return { impulse, burn, avg, max };
}
