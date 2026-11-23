import type { FlightResult } from '../../../engine/openRocketEngine';
import { landingPoint } from '../groundTrack';

// Worker-safe: no i18n, no store. The semantics are desktop's `rocketoptimization` package.

/** Desktop's `rocketoptimization/parameters`, in its dialog's order. */
export const OPT_GOALS = [
  'apogee',
  'maxVelocity',
  'maxAcceleration',
  'stability',
  'groundHitVelocity',
  'deploymentVelocity',
  'landingDistance',
  'flightTime',
] as const;
export type OptGoal = (typeof OPT_GOALS)[number];

export const OPT_AIMS = ['maximize', 'minimize', 'seek'] as const;
export type OptAim = (typeof OPT_AIMS)[number];

/** Calibers, or the CP-to-CG distance in meters (desktop's "absolute" stability). */
export type StabilityUnit = 'calibers' | 'length';

/** `StabilityDomain`: a null bound is no bound. */
export interface StabilityLimits {
  min: number | null;
  max: number | null;
  unit: StabilityUnit;
}

/** Launch CG with the motors, CP at the default Mach; meters from the nose tip. */
export interface OptStatic {
  cp: number;
  cg: number;
  calibers: number;
}

/** SI; NaN where the flight has no such figure. */
export interface OptFigures {
  apogee: number;
  maxVelocity: number;
  maxAcceleration: number;
  groundHitVelocity: number;
  deploymentVelocity: number;
  landingDistance: number;
  flightTime: number;
}

/** One design point, as the worker returns it. */
export interface OptPoint {
  static: OptStatic;
  /** `getDistanceToDomain`: above zero is outside the limits, NaN is unknown. */
  distance: number;
  /** Null when not flown: outside the limits, or a stability goal, which needs no flight. */
  figures: OptFigures | null;
}

export function stabilityOf(s: OptStatic, unit: StabilityUnit): number {
  return unit === 'length' ? s.cp - s.cg : s.calibers;
}

const finite = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

export function flightFigures(result: FlightResult): OptFigures {
  const s = result.summary;
  const landed = landingPoint(result.series);
  return {
    apogee: finite(s.maxAltitude),
    maxVelocity: finite(s.maxVelocity),
    maxAcceleration: finite(s.maxAcceleration),
    groundHitVelocity: finite(s.groundHitVelocity),
    deploymentVelocity: finite(s.deploymentVelocity),
    landingDistance: landed ? Math.hypot(landed.east, landed.north) : NaN,
    flightTime: finite(s.flightTime),
  };
}

/** `StabilityDomain.getDistanceToDomain`: how far outside, zero or below when inside. */
export function domainDistance(limits: StabilityLimits | null, s: OptStatic): number {
  if (!limits || (limits.min == null && limits.max == null)) return -1;
  const v = stabilityOf(s, limits.unit);
  if (!Number.isFinite(v)) return NaN;
  if (limits.min != null && limits.min - v > 0) return limits.min - v;
  if (limits.max != null && v - limits.max > 0) return v - limits.max;
  return 0;
}

export function goalFigure(goal: OptGoal, point: OptPoint, unit: StabilityUnit): number {
  if (goal === 'stability') return stabilityOf(point.static, unit);
  return point.figures ? point.figures[goal] : NaN;
}

/** `RocketOptimizationFunction.OUTSIDE_DOMAIN_SCALE`. */
const OUTSIDE_DOMAIN_SCALE = 1.0e200;

/**
 * The value the search minimizes (`RocketOptimizationFunction.evaluate`): any point outside the limits
 * scores worse than every point inside, and an unknown one worst of all.
 */
export function pointScore(point: OptPoint | null, goal: OptGoal, aim: OptAim, target: number, unit: StabilityUnit) {
  if (!point || Number.isNaN(point.distance)) return Number.MAX_VALUE;
  if (point.distance > 0) return Math.min(Number.MAX_VALUE, (point.distance + 1) * OUTSIDE_DOMAIN_SCALE);
  const v = goalFigure(goal, point, unit);
  if (!Number.isFinite(v)) return Number.MAX_VALUE;
  if (aim === 'maximize') return -v;
  if (aim === 'minimize') return v;
  return Math.abs(v - target);
}

export const feasible = (point: OptPoint | null): boolean => !!point && point.distance <= 0;
