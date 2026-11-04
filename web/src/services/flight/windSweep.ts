import type { RocketTree } from '../../engine/openRocketEngine';
import type { WindLevel } from '../design/orkTree';
import type { CompleteLaunch } from './requiredLaunch';
import { MAX_WIND_SPEED_MS } from './safetyLimits';
import type { SimInputs } from './simulations';
import { DEFAULT_HEADING_DEG, surfaceWind } from './windLevels';
import { hasIntensity, retuneStdDev } from './windTurbulence';
import { norm360 } from './groundTrack';

export const MAX_SWEEP_FLIGHTS = 200;

const MAX_SPEED_STEPS = 12;
const MAX_HEADING_STEPS = 36;

// m/s; degrees clockwise from north.
export interface SweepPoint {
  speedMs: number;
  headingDeg: number;
}

// Speeds are absolute m/s at the pad; headings are an arc centered on the flight's own wind.
export interface WindSweepSpec {
  speedMinMs: number;
  speedMaxMs: number;
  speedSteps: number;
  headingSteps: number;
  // Degrees; 360 is the whole compass.
  headingSpanDeg: number;
}

// Meters east and north of the pad.
export interface SweepLanding {
  branch: number;
  east: number;
  north: number;
  speedMs: number;
  headingDeg: number;
}

export interface DriftSweep {
  simId: string;
  tree: RocketTree;
  // Compared by reference (`sameSimInputs`).
  inputs: SimInputs;
  key: string;
  spec: WindSweepSpec;
  asked: number;
  flown: number;
  landings: SweepLanding[];
}

// Headings, not speeds, are trimmed to fit MAX_SWEEP_FLIGHTS: the envelope's shape comes from the speeds.
export function normalizeSweepSpec(spec: WindSweepSpec): WindSweepSpec {
  // Only NaN falls back; an infinity clamps to the end it came from.
  const clampInt = (v: number, lo: number, hi: number) =>
    Number.isNaN(v) ? lo : Math.max(lo, Math.min(hi, Math.round(v)));
  const clampSpeed = (v: number) => (Number.isNaN(v) ? 0 : Math.max(0, Math.min(MAX_WIND_SPEED_MS, v)));

  const a = clampSpeed(spec.speedMinMs);
  const b = clampSpeed(spec.speedMaxMs);
  // A zero-width band would otherwise weight each heading several times in the ellipse.
  const speedSteps = a === b ? 1 : clampInt(spec.speedSteps, 1, MAX_SPEED_STEPS);
  const headingSpanDeg = Math.max(0, Math.min(360, Number.isFinite(spec.headingSpanDeg) ? spec.headingSpanDeg : 360));
  let headingSteps = clampInt(spec.headingSteps, 1, MAX_HEADING_STEPS);
  headingSteps = Math.max(1, Math.min(headingSteps, Math.floor(MAX_SWEEP_FLIGHTS / speedSteps)));

  return {
    speedMinMs: Math.min(a, b),
    speedMaxMs: Math.max(a, b),
    speedSteps,
    headingSteps,
    headingSpanDeg,
  };
}

export function sweepFlightCount(spec: WindSweepSpec): number {
  const s = normalizeSweepSpec(spec);
  return s.speedSteps * s.headingSteps;
}

export function defaultSweepSpec(surfaceWindMs: number): WindSweepSpec {
  const base = Number.isFinite(surfaceWindMs) ? Math.max(0, surfaceWindMs) : 0;
  const hi = base > 0.5 ? base * 1.5 : 4;
  const lo = base > 0.5 ? base * 0.5 : 0;
  return normalizeSweepSpec({
    speedMinMs: lo,
    speedMaxMs: hi,
    speedSteps: 4,
    headingSteps: 8,
    headingSpanDeg: 360,
  });
}

export function sweepSpeeds(spec: WindSweepSpec): number[] {
  const s = normalizeSweepSpec(spec);
  if (s.speedSteps <= 1) return [s.speedMinMs];
  const step = (s.speedMaxMs - s.speedMinMs) / (s.speedSteps - 1);
  return Array.from({ length: s.speedSteps }, (_, i) => s.speedMinMs + i * step);
}

// A full compass excludes one end (0 and 360 are one heading); a partial arc lands on both ends.
export function sweepHeadings(spec: WindSweepSpec, baseHeadingDeg: number): number[] {
  const s = normalizeSweepSpec(spec);
  const base = Number.isFinite(baseHeadingDeg) ? baseHeadingDeg : DEFAULT_HEADING_DEG;
  if (s.headingSteps <= 1) return [norm360(base)];
  if (s.headingSpanDeg >= 360) {
    return Array.from({ length: s.headingSteps }, (_, i) => norm360(base + (i * 360) / s.headingSteps));
  }
  const start = base - s.headingSpanDeg / 2;
  const step = s.headingSpanDeg / (s.headingSteps - 1);
  return Array.from({ length: s.headingSteps }, (_, i) => norm360(start + i * step));
}

export function sweepPoints(spec: WindSweepSpec, baseHeadingDeg: number): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (const speedMs of sweepSpeeds(spec)) {
    for (const headingDeg of sweepHeadings(spec, baseHeadingDeg)) out.push({ speedMs, headingDeg });
  }
  return out;
}

// Turbulence keeps its intensity, not its m/s, as `LevelWindModel.setSpeed` does.
export function sweepLaunch(base: CompleteLaunch, point: SweepPoint): CompleteLaunch {
  const levels = base.windLevels;
  if (levels?.length) {
    // Scaling every level scales the pad blend equally, so the pad flies the cell's wind exactly.
    const surface = surfaceWind(base);
    const turn = point.headingDeg - surface.headingDeg;
    const ratio = hasIntensity(surface.speedMs) ? point.speedMs / surface.speedMs : null;
    const next: WindLevel[] = levels.map((l) => {
      const speed = ratio == null ? point.speedMs : l.speed * ratio;
      return {
        ...l,
        speed,
        stddev: retuneStdDev(l.speed, l.stddev, speed),
        directionDeg: norm360(l.directionDeg + turn),
      };
    });
    return { ...base, windLevels: next };
  }
  return {
    ...base,
    windAverage: point.speedMs,
    windStdDev: retuneStdDev(base.windAverage, base.windStdDev, point.speedMs),
    windDirectionDeg: point.headingDeg,
  };
}
