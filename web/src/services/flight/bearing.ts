import type { LaunchConditions } from '../design/orkTree';
import { magneticDeclinationDeg } from '../map/magneticDeclination';
import { norm360 } from './groundTrack';
import { DEFAULT_HEADING_DEG, surfaceWind } from './windLevels';

const DEG = Math.PI / 180;

/** Which north the launch panel's bearings are typed against. Stored bearings are always true. */
export type NorthReference = 'true' | 'magnetic';
export const NORTH_REFERENCES = ['true', 'magnetic'] as const satisfies readonly NorthReference[];

/** The 16-point index of a bearing: 0 is N, 4 is E, 8 is S, 12 is W. */
export const compassPointIndex = (deg: number): number => Math.round(norm360(deg) / 22.5) % 16;

/** Degrees magnetic north lies east of true north at the site, today; null with no usable position. */
export function siteDeclination(l: Pick<LaunchConditions, 'latitudeDeg' | 'longitudeDeg'>, when?: Date): number | null {
  if (l.latitudeDeg == null || l.longitudeDeg == null) return null;
  return magneticDeclinationDeg(l.latitudeDeg, l.longitudeDeg, 0, when);
}

/** Where the rod leans, true degrees, and by how much from vertical; never negative. */
export interface RodLean {
  headingDeg: number;
  angleDeg: number;
}

/**
 * As `SimulationOptions.getLaunchRodDirection`: into the wind, the rod leans toward where the pad wind comes from,
 * and a negative angle leans it the other way.
 */
export function rodLean(l: LaunchConditions): RodLean {
  const heading = l.launchIntoWind ? surfaceWind(l).headingDeg : (l.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG);
  const typed = l.launchRodAngleDeg;
  const angle = typeof typed === 'number' && Number.isFinite(typed) ? typed : 0;
  return angle < 0
    ? { headingDeg: norm360(heading + 180), angleDeg: -angle }
    : { headingDeg: norm360(heading), angleDeg: angle };
}

/**
 * The lean split against the wind: `intoDeg` in the vertical plane the wind blows along (positive toward where it
 * comes from), `acrossDeg` out of it, both from vertical.
 */
export function leanAgainstWind(lean: RodLean, windFromDeg: number): { intoDeg: number; acrossDeg: number } {
  const a = lean.angleDeg * DEG;
  const off = (lean.headingDeg - windFromDeg) * DEG;
  return {
    intoDeg: Math.atan2(Math.sin(a) * Math.cos(off), Math.cos(a)) / DEG,
    acrossDeg: Math.asin(Math.sin(a) * Math.sin(off)) / DEG,
  };
}

/** Below this the pad wind has no direction worth drawing. */
export const CALM_MS = 0.05;

/** Where the pad wind comes from, true degrees; null in calm air. */
export function padWindFromDeg(l: LaunchConditions): number | null {
  const w = surfaceWind(l);
  return w.speedMs < CALM_MS ? null : w.headingDeg;
}

/** The declination to mark, when the panel reads magnetic and the site has one. */
export function shownDeclination(pref: NorthReference, latitudeDeg?: number | null, longitudeDeg?: number | null) {
  return pref === 'magnetic'
    ? siteDeclination({ latitudeDeg: latitudeDeg ?? null, longitudeDeg: longitudeDeg ?? null })
    : null;
}

export const trueToMagnetic = (trueDeg: number, declinationDeg: number): number => norm360(trueDeg - declinationDeg);
export const magneticToTrue = (magDeg: number, declinationDeg: number): number => norm360(magDeg + declinationDeg);
