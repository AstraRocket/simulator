// Mirrors `PinkNoiseWindModel` turbulence intensity; display only, the bridge flies average and deviation.
import { isZero } from '../motors/mathEquals';

// Zero average answers 0 or 1 rather than dividing, as the kernel does.
export function turbulenceIntensity(average: number, stdDev: number): number {
  if (isZero(average)) return isZero(stdDev) ? 0 : 1;
  return stdDev / average;
}

export function hasIntensity(average: number): boolean {
  return !isZero(average);
}

export function stdDevForIntensity(average: number, intensity: number): number {
  // `setStandardDeviation` floors at zero.
  return Math.max(intensity * average, 0);
}

// As `PinkNoiseWindModel.setAverage`; untouched from zero, where the stand-in intensity of 1 would explode it.
export function retuneStdDev(was: number, wasStdDev: number, now: number): number {
  if (!hasIntensity(was)) return wasStdDev;
  return stdDevForIntensity(now, turbulenceIntensity(was, wasStdDev));
}

export type TurbulenceLevel = 'none' | 'veryLow' | 'low' | 'medium' | 'high' | 'veryHigh' | 'extreme';

// OpenRocket's `getIntensityDescription` thresholds.
export function turbulenceLevel(intensity: number): TurbulenceLevel {
  if (intensity < 0.001) return 'none';
  if (intensity < 0.05) return 'veryLow';
  if (intensity < 0.1) return 'low';
  if (intensity < 0.15) return 'medium';
  if (intensity < 0.2) return 'high';
  if (intensity < 0.25) return 'veryHigh';
  return 'extreme';
}
