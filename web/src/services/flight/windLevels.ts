import type { LaunchConditions, WindLevel } from '../design/orkTree';
import { degToRad, radToDeg } from '../../prefs/units';

/**
 * The default compass heading (degrees) for the launch rod and the wind: due
 * east, the kernel's own (`SimulationOptions` defaults `launchRodDirection`
 * and `windDirection` to PI/2). Shared with the launch panel so every
 * fallback heading reads the same value.
 */
export const DEFAULT_HEADING_DEG = 90;

/**
 * What a multilevel wind profile has to be true of before the kernel will take
 * it, asked in one place so the editor, the .ork reader, the stored defaults
 * and the run gate cannot disagree about it.
 *
 * The kernel keys its levels on altitude: `MultiLevelPinkNoiseWindModel`
 * binary-searches the sorted list to insert one and throws
 * `Wind level already exists for altitude: 0.0` on a collision. So an altitude
 * is a level's identity, not a dimension with a sensible zero, and the two
 * faults that follow from that are the ones handled here:
 *
 *   - Two levels at one altitude. Refused when the run starts, after the
 *     design was built (the bridge refuses the repeat before the kernel's
 *     `addWindLevel` would), for something the profile editor lets the user
 *     type.
 *   - A level whose altitude is missing or unreadable. Defaulting it to 0 does
 *     not mean "ground level" harmlessly: it either replaces the real surface
 *     wind or collides with it and takes the whole run down.
 */

/** The four numbers a level carries; all of them have to be real. */
const KEYS = ['altitudeM', 'speed', 'directionDeg', 'stddev'] as const;

/** Whether this is a level at all: an object carrying four finite numbers. */
export function isUsableLevel(l: unknown): l is WindLevel {
  return !!l && typeof l === 'object' && KEYS.every((k) => Number.isFinite((l as Record<string, unknown>)[k]));
}

/**
 * The row indices whose altitude repeats an earlier row's, in order.
 *
 * Exact equality, because that is what the kernel compares: two levels a
 * nanometer apart are two levels to it, and rounding them together here would
 * report a fault the run does not have. The first row at a given altitude is
 * not in the list (it is the one that gets in), so the indices returned are
 * exactly the rows to flag or to drop.
 */
export function duplicateAltitudeRows(levels: readonly WindLevel[]): number[] {
  const seen = new Set<number>();
  const dupes: number[] = [];
  levels.forEach((l, i) => {
    if (seen.has(l.altitudeM)) dupes.push(i);
    else seen.add(l.altitudeM);
  });
  return dupes;
}

/**
 * The levels of this profile the kernel can actually build: every number
 * finite, one level per altitude, first row wins a collision.
 *
 * For the paths that have no user to tell (a stored preference read back, an
 * .ork someone else wrote), where the choice is between dropping a level and
 * failing the run. The editor does not use this: a row the user is typing into
 * gets flagged, not deleted underneath them.
 */
export function usableWindLevels(levels: readonly unknown[]): WindLevel[] {
  const kept = levels.filter(isUsableLevel);
  const drop = new Set(duplicateAltitudeRows(kept));
  return kept.filter((_, i) => !drop.has(i));
}

/** The mean wind at one altitude: speed (m/s, never negative) and heading (degrees). */
export interface PadWind {
  speedMs: number;
  /** Degrees clockwise from north, in [0, 360). */
  headingDeg: number;
}

/**
 * The mean wind a multilevel profile blows at the pad, or undefined without a
 * profile.
 *
 * Read the way the kernel's `MultiLevelPinkNoiseWindModel.getWindVelocity`
 * reads it: levels in altitude order (they are not kept sorted here), the
 * nearest level held outside them, and the two levels either side blended as
 * velocity vectors rather than as a speed and a heading separately. A negative
 * speed is the same vector pointing the other way, which is how
 * `PinkNoiseWindModel.setAverage` flies it.
 *
 * The pad is at the launch altitude in an MSL profile and at 0 in an AGL one:
 * the altitude the kernel samples the wind at when the rocket leaves the pad.
 * Upstream's `SimulationOptions.getLaunchRodDirection` reads the launch
 * altitude whatever the reference, which in an AGL profile is a wind aloft.
 */
/** A horizontal vector, east and north. */
export interface WindVector {
  east: number;
  north: number;
}

/**
 * A profile's vector at height `h`, interpolated linearly in its components
 * between the two levels around it, so a backing or veering wind turns the
 * short way without the angle wrapping; held at the end values outside the
 * profile. `levels` must be sorted by altitude and not empty; `vec` reads one
 * level as a vector, in whatever convention the caller flies.
 */
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
    // On a level, or outside the profile where the nearest level holds.
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

/**
 * The wind at the pad as speed and heading: the profile's at the pad when one
 * is flown (`padLevelWind`), else the single wind. A negative single wind flies
 * as its magnitude from the typed heading: the bridge sets the heading after
 * the speed, which overrides the kernel's flip. A blank speed reads as calm:
 * the callers (the safety limits, the sweep's centering) never fly from it,
 * and the run refuses an incomplete launch long before. The one reading of the
 * pad wind, so the limit, the sweep and the rod's "into the wind" agree.
 */
export function surfaceWind(launch: LaunchConditions): { speedMs: number; headingDeg: number } {
  const pad = padLevelWind(launch);
  if (pad) return { speedMs: pad.speedMs, headingDeg: pad.headingDeg };
  return { speedMs: Math.abs(launch.windAverage ?? 0), headingDeg: launch.windDirectionDeg ?? DEFAULT_HEADING_DEG };
}

/**
 * One level at altitude 0 carrying the single (average) wind: its speed,
 * direction and deviation. What turning Multilevel on seeds from the
 * simulation's own wind, and what a profile reset leaves, as the kernel's
 * `resetLevels` does through `addInitialLevel`. A blank or unreadable value is
 * calm air, not a NaN that would fail the level check.
 */
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
