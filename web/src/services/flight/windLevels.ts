import type { LaunchConditions, WindLevel } from '../design/orkTree';
import { degToRad, radToDeg } from '../../prefs/units';

// Degrees, due east: `SimulationOptions` defaults rod and wind direction to PI/2.
export const DEFAULT_HEADING_DEG = 90;

// The kernel throws on duplicate altitudes, so a missing altitude must not default to 0.
const KEYS = ['altitudeM', 'speed', 'directionDeg', 'stddev'] as const;

export function isUsableLevel(l: unknown): l is WindLevel {
  return !!l && typeof l === 'object' && KEYS.every((k) => Number.isFinite((l as Record<string, unknown>)[k]));
}

// Exact equality, because that is what the kernel compares.
export function duplicateAltitudeRows(levels: readonly WindLevel[]): number[] {
  const seen = new Set<number>();
  const dupes: number[] = [];
  levels.forEach((l, i) => {
    if (seen.has(l.altitudeM)) dupes.push(i);
    else seen.add(l.altitudeM);
  });
  return dupes;
}

export function usableWindLevels(levels: readonly unknown[]): WindLevel[] {
  const kept = levels.filter(isUsableLevel);
  const drop = new Set(duplicateAltitudeRows(kept));
  return kept.filter((_, i) => !drop.has(i));
}

export interface PadWind {
  speedMs: number;
  // Degrees clockwise from north, in [0, 360).
  headingDeg: number;
}

export interface WindVector {
  east: number;
  north: number;
}

// Interpolated in components so the angle never wraps. `levels` must be sorted and non-empty.
export function vectorAt<L extends { altitudeM: number }>(
  levels: readonly L[],
  h: number,
  vec: (l: L) => WindVector,
): WindVector {
  if (h <= levels[0]!.altitudeM) return vec(levels[0]!);
  const last = levels[levels.length - 1]!;
  if (h >= last.altitudeM) return vec(last);
  let i = 0;
  while (levels[i + 1]!.altitudeM < h) i++;
  const a = vec(levels[i]!);
  const b = vec(levels[i + 1]!);
  const f = (h - levels[i]!.altitudeM) / (levels[i + 1]!.altitudeM - levels[i]!.altitudeM);
  return { east: a.east + (b.east - a.east) * f, north: a.north + (b.north - a.north) * f };
}

// As `MultiLevelPinkNoiseWindModel.getWindVelocity`: vector blend, negative speed points the other way.
export function padLevelWind(
  launch: Pick<LaunchConditions, 'windLevels' | 'windAltitudeReference' | 'launchAltitudeM'>,
): PadWind | undefined {
  const levels = [...(launch.windLevels ?? [])].sort((a, b) => a.altitudeM - b.altitudeM);
  if (!levels.length) return undefined;
  const h = launch.windAltitudeReference === 'agl' ? 0 : (launch.launchAltitudeM ?? 0);
  const norm = (deg: number) => ((deg % 360) + 360) % 360;
  const i = levels.findIndex((l) => l.altitudeM >= h);
  const near = i < 0 ? levels[levels.length - 1]! : levels[i]!;
  if (i <= 0 || near.altitudeM === h) {
    return near.speed < 0
      ? { speedMs: -near.speed, headingDeg: norm(near.directionDeg + 180) }
      : { speedMs: near.speed, headingDeg: norm(near.directionDeg) };
  }
  const lo = levels[i - 1]!;
  const { east, north } = vectorAt(levels, h, (l) => {
    const rad = degToRad(l.directionDeg);
    return { east: l.speed * Math.sin(rad), north: l.speed * Math.cos(rad) };
  });
  const speedMs = Math.hypot(east, north);
  // Two winds that cancel leave no heading; the lower level's typed one stands in.
  const deg = speedMs > 0 ? radToDeg(Math.atan2(east, north)) : lo.directionDeg;
  return { speedMs, headingDeg: norm(deg) };
}

// A negative single wind keeps its typed heading: the bridge sets heading after speed, overriding the flip.
export function surfaceWind(launch: LaunchConditions): { speedMs: number; headingDeg: number } {
  const pad = padLevelWind(launch);
  if (pad) return { speedMs: pad.speedMs, headingDeg: pad.headingDeg };
  return { speedMs: Math.abs(launch.windAverage ?? 0), headingDeg: launch.windDirectionDeg ?? DEFAULT_HEADING_DEG };
}

// As the kernel's `resetLevels`.
export function levelFromAverage(c: {
  windAverage?: number | null;
  windStdDev?: number | null;
  windDirectionDeg?: number | null;
}): WindLevel {
  const orZero = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : 0);
  return {
    altitudeM: 0,
    speed: orZero(c.windAverage),
    directionDeg: c.windDirectionDeg ?? DEFAULT_HEADING_DEG,
    stddev: orZero(c.windStdDev),
  };
}
