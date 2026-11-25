import * as THREE from 'three';
import type { FlightSeries } from '../../engine/openRocketEngine';
import { isFiniteNumber } from '../../services/app/numbers';
import { groundPointAt } from '../../services/flight/groundTrack';

// Kernel Px is east, Py north; with three.js +y up, north is -z (on +z the scene mirrors).
export function sceneFromEnu(east: number, up: number, north: number): THREE.Vector3 {
  return new THREE.Vector3(east, up, -north);
}

/** One branch's flight, in scene units. The arrays run in step, one entry per drawn sample. */
export interface FlightTrack {
  scenePts: THREE.Vector3[];
  times: number[];
  alts: number[];
  vels: number[];
  /** Turns world up onto the nose, carrying no roll: each sample is the last turned the shortest way. */
  tilts: THREE.Quaternion[];
  /** Radians about the rocket's axis, unwrapped. */
  rolls: number[];
  /** When it starts to hang nose up under its recovery device; Infinity for a flight that never does. */
  deployT: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const NOSE_AXIS = new THREE.Vector3(-1, 0, 0);
const STAND_UPRIGHT = new THREE.Quaternion().setFromUnitVectors(NOSE_AXIS, UP);

// Not from the kernel, which holds the attitude a rocket deploys in all the way to the ground.
const HANG_SECONDS = 1.5;

interface TrackRow {
  t: number;
  a: number;
  v: number;
  east: number;
  north: number;
  /** The recorded nose direction, or null where the run recorded none. */
  nose: THREE.Vector3 | null;
  rollRate: number;
}

// Θ is the elevation above the horizon, Φ the heading clockwise from north.
function recordedNose(series: FlightSeries, i: number): THREE.Vector3 | null {
  const elevation = series['Θ']?.[i];
  const heading = series['Φ']?.[i];
  if (elevation == null || heading == null || !Number.isFinite(elevation + heading)) return null;
  const level = Math.cos(elevation);
  return sceneFromEnu(level * Math.sin(heading), Math.sin(elevation), level * Math.cos(heading));
}

export function trackRows(series: FlightSeries): TrackRow[] {
  const time = series.time ?? [];
  const alt = series.altitude ?? [];
  const vel = series.velocity ?? [];
  // A run that records no ground position flies up the axis; one that does drops a sample missing it,
  // as the ground track does, rather than drawing it at the pad.
  const tracked = !!series.Px && !!series.Py;
  const rows: TrackRow[] = [];
  for (let i = 0; i < time.length; i++) {
    if (!Number.isFinite(time[i]) || !Number.isFinite(alt[i])) continue;
    const ground = groundPointAt(series, i);
    if (tracked && !ground) continue;
    const rollRate = series['dΦ']?.[i];
    rows.push({
      t: time[i]!,
      a: alt[i]!,
      v: Number.isFinite(vel[i]) ? vel[i]! : 0,
      east: ground?.east ?? 0,
      north: ground?.north ?? 0,
      nose: recordedNose(series, i),
      rollRate: isFiniteNumber(rollRate) ? rollRate : 0,
    });
  }
  return rows;
}

export const hasAttitude = (rows: readonly TrackRow[]): boolean => rows.some((r) => r.nose != null);

function pathTangent(pts: readonly THREE.Vector3[], i: number): THREE.Vector3 {
  const tangent = new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!);
  return tangent.lengthSq() < 1e-8 ? tangent.set(0, 1, 0) : tangent.normalize();
}

export function buildTrack(rows: readonly TrackRow[], unitsPerMeter: number, deployT: number): FlightTrack {
  const s = unitsPerMeter;
  const scenePts = rows.map((r) => sceneFromEnu(r.east * s, r.a * s, r.north * s));
  const tilts: THREE.Quaternion[] = [];
  const rolls: number[] = [];
  const turn = new THREE.Quaternion();
  let last = UP;
  rows.forEach((r, i) => {
    const nose = r.nose ?? pathTangent(scenePts, i);
    turn.setFromUnitVectors(last, nose);
    const before = tilts[i - 1];
    tilts.push(before ? turn.clone().multiply(before).normalize() : turn.clone());
    last = nose;
    const prev = rows[i - 1];
    rolls.push(prev ? rolls[i - 1]! + ((prev.rollRate + r.rollRate) / 2) * (r.t - prev.t) : 0);
  });
  return {
    scenePts,
    times: rows.map((r) => r.t),
    alts: rows.map((r) => r.a),
    vels: rows.map((r) => r.v),
    tilts,
    rolls,
    deployT,
  };
}

/** The last sample at or before `t`, or the first. */
export function indexAtTime(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface TrackPose {
  position: THREE.Vector3;
  /** Turns the model, nose on local -X, to the attitude it flies in. */
  quaternion: THREE.Quaternion;
  /** The nose's direction. */
  dir: THREE.Vector3;
}

export const newTrackPose = (): TrackPose => ({
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion().copy(STAND_UPRIGHT),
  dir: new THREE.Vector3(0, 1, 0),
});

const turned = new THREE.Quaternion();
const hung = new THREE.Quaternion();

export function trackPositionAt(track: FlightTrack, t: number, out: THREE.Vector3): THREE.Vector3 {
  const i = indexAtTime(track.times, t);
  const at = track.scenePts[i];
  if (!at) return out.set(0, 0, 0);
  const next = track.scenePts[i + 1];
  return next ? out.lerpVectors(at, next, fractionAt(track.times, i, t)) : out.copy(at);
}

function fractionAt(times: readonly number[], i: number, t: number): number {
  const span = times[i + 1]! - times[i]!;
  return span > 0 ? THREE.MathUtils.clamp((t - times[i]!) / span, 0, 1) : 0;
}

/** Interpolated between samples. Writes into `out`: called every frame. */
export function trackPoseAt(track: FlightTrack, t: number, out: TrackPose): TrackPose {
  const i = indexAtTime(track.times, t);
  const tilt = track.tilts[i];
  trackPositionAt(track, t, out.position);
  if (!tilt) {
    out.quaternion.copy(STAND_UPRIGHT);
    out.dir.copy(UP);
    return out;
  }
  const next = track.tilts[i + 1];
  let roll = track.rolls[i]!;
  out.quaternion.copy(tilt);
  if (next) {
    const u = fractionAt(track.times, i, t);
    out.quaternion.slerp(next, u);
    roll += (track.rolls[i + 1]! - roll) * u;
  }
  out.dir.copy(UP).applyQuaternion(out.quaternion);
  if (t >= track.deployT) {
    const hang = THREE.MathUtils.smoothstep(t, track.deployT, track.deployT + HANG_SECONDS);
    turned.setFromUnitVectors(out.dir, UP);
    hung.identity().slerp(turned, hang);
    out.quaternion.premultiply(hung);
    out.dir.applyQuaternion(hung);
  }
  turned.setFromAxisAngle(UP, roll);
  out.quaternion.multiply(turned).multiply(STAND_UPRIGHT);
  return out;
}
