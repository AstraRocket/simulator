import type { GroundPoint } from '../flight/groundTrack';
import { offsetToLatLon } from '../map/geodesy';
import { degToRad } from '../../prefs/units';
import { bearingFromPad, distanceFromPad } from '../flight/groundTrack';
import { vectorAt } from '../flight/windLevels';

// Meters above sea level; `fromDeg` is where the wind blows from.
export interface WindLayer {
  altitudeM: number;
  speed: number;
  fromDeg: number;
}

// Heights are above the pad (AGL).
export interface DescentPlan {
  apogeeAglM: number;
  firstRateMs: number;
  main?: { rateMs: number; aglM: number };
}

export interface DriftInput {
  latitudeDeg: number;
  longitudeDeg: number;
  // Meters above sea level.
  padElevationM: number;
  plan: DescentPlan;
  wind: readonly WindLayer[];
  // Meters above sea level.
  groundAt?: (latitudeDeg: number, longitudeDeg: number) => number;
  speedFactor?: number;
  directionOffsetDeg?: number;
  rateFactor?: number;
}

export interface DriftResult {
  path: GroundPoint[];
  landing: GroundPoint;
  landingLatDeg: number;
  landingLonDeg: number;
  // Meters above sea level.
  groundElevationM: number;
  timeS: number;
  distanceM: number;
  bearingDeg: number;
}

const STEP_M = 10;

// Toward where the air moves, opposite to the wind's "from" heading.
export function airVelocity(wind: readonly WindLayer[], altitudeM: number, speedFactor = 1, turnDeg = 0) {
  if (wind.length === 0) return { east: 0, north: 0 };
  return vectorAt(wind, altitudeM, (l) => {
    const to = degToRad(l.fromDeg + 180 + turnDeg);
    return { east: l.speed * speedFactor * Math.sin(to), north: l.speed * speedFactor * Math.cos(to) };
  });
}

// `wind` must be sorted by altitude.
export function descentDrift(input: DriftInput): DriftResult {
  const { plan, padElevationM: pad } = input;
  const rateFactor = input.rateFactor ?? 1;
  const ground = (p: GroundPoint) => {
    if (!input.groundAt) return pad;
    const { lat, lon } = offsetToLatLon(input.latitudeDeg, input.longitudeDeg, p);
    return input.groundAt(lat, lon);
  };

  let pos: GroundPoint = { east: 0, north: 0 };
  let msl = pad + plan.apogeeAglM;
  let t = 0;
  const path: GroundPoint[] = [pos];
  let floor = ground(pos);
  // Capped so ground that keeps rising under the drift cannot hold the loop open.
  for (let n = 0; msl > floor && n < 100_000; n++) {
    const aboveFloor = msl - floor;
    const step = Math.min(STEP_M, aboveFloor);
    const aboveMain = plan.main ? msl - pad > plan.main.aglM : true;
    const rate = (aboveMain ? plan.firstRateMs : plan.main!.rateMs) * rateFactor;
    const dt = step / rate;
    const air = airVelocity(input.wind, msl - step / 2, input.speedFactor ?? 1, input.directionOffsetDeg ?? 0);
    pos = { east: pos.east + air.east * dt, north: pos.north + air.north * dt };
    msl -= step;
    t += dt;
    path.push(pos);
    floor = ground(pos);
  }

  const { lat, lon } = offsetToLatLon(input.latitudeDeg, input.longitudeDeg, pos);
  return {
    path,
    landing: pos,
    landingLatDeg: lat,
    landingLonDeg: lon,
    groundElevationM: floor,
    timeS: t,
    distanceM: distanceFromPad(pos),
    bearingDeg: bearingFromPad(pos),
  };
}
