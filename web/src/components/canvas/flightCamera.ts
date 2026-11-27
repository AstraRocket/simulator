import * as THREE from 'three';
import { extentCenter, extentLength, type Placement } from './bodyMotion';
import { trackPositionAt, type FlightTrack } from './flightTrack';

/** `overview` draws the rocket large enough to see; the others draw it at its true size. */
const FLIGHT_VIEWS = ['overview', 'follow', 'pad', 'chase', 'onboard'] as const;
export type FlightView = (typeof FLIGHT_VIEWS)[number];

/** `director` picks among the views as the flight goes. */
export const CAMERA_CHOICES = [...FLIGHT_VIEWS, 'director'] as const;
export type CameraChoice = (typeof CAMERA_CHOICES)[number];

/** Views the mouse orbits; the rest place the camera themselves. */
export const isOrbitView = (v: FlightView): boolean => v === 'overview' || v === 'follow';

export interface CameraPose {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  /** Degrees, vertical. */
  fov: number;
  near: number;
}

export const BASE_FOV = 42;
const ONBOARD_FOV = 75;
const UP = new THREE.Vector3(0, 1, 0);

export const newCameraPose = (): CameraPose => ({
  eye: new THREE.Vector3(0, 22, 48),
  target: new THREE.Vector3(),
  up: UP.clone(),
  fov: BASE_FOV,
  near: 0.1,
});

export function copyPose(from: CameraPose, out: CameraPose): CameraPose {
  out.eye.copy(from.eye);
  out.target.copy(from.target);
  out.up.copy(from.up);
  out.fov = from.fov;
  out.near = from.near;
  return out;
}

const halfTan = (fov: number): number => Math.tan(THREE.MathUtils.degToRad(fov) / 2);

/** Sizes and distances change by ratio, so a zoom across three orders of magnitude moves evenly. */
export const blendRatio = (from: number, to: number, u: number): number =>
  from > 0 && to > 0 ? from * Math.pow(to / from, u) : from + (to - from) * u;

const fromDir = new THREE.Vector3();
const toDir = new THREE.Vector3();
const swing = new THREE.Quaternion();
const part = new THREE.Quaternion();

export function blendPose(from: CameraPose, to: CameraPose, u: number, out: CameraPose): CameraPose {
  if (u >= 1) return copyPose(to, out);
  const fromDist = fromDir.subVectors(from.eye, from.target).length();
  const toDist = toDir.subVectors(to.eye, to.target).length();
  const floor = Math.min(from.eye.y, to.eye.y);
  swing.setFromUnitVectors(fromDir.normalize(), toDir.normalize());
  part.identity().slerp(swing, u);
  out.target.lerpVectors(from.target, to.target, u);
  out.eye
    .copy(fromDir)
    .applyQuaternion(part)
    .multiplyScalar(blendRatio(fromDist, toDist, u))
    .add(out.target);
  // Between two views above the ground, never through it.
  out.eye.y = Math.max(out.eye.y, floor);
  out.up.lerpVectors(from.up, to.up, u);
  if (out.up.lengthSq() < 1e-6) out.up.copy(to.up);
  out.up.normalize();
  out.fov = THREE.MathUtils.radToDeg(2 * Math.atan(blendRatio(halfTan(from.fov), halfTan(to.fov), u)));
  out.near = Math.min(from.near, to.near);
  return out;
}

// From the south, looking north: north is straight ahead, east to the right, as on a map.
const OVERVIEW_DIR = new THREE.Vector3(0, 0.62, 1.81).normalize();
const OVERVIEW_MARGIN = 1.2;
const corner = new THREE.Vector3();
const basis = new THREE.Matrix4();
const across = new THREE.Vector3();
const above = new THREE.Vector3();
const toward = new THREE.Vector3();

/** Frames the whole box, whatever the window's shape. */
export function overviewPose(box: THREE.Box3, aspect: number, out: CameraPose): CameraPose {
  box.getCenter(out.target);
  basis.lookAt(OVERVIEW_DIR, across.set(0, 0, 0), UP).extractBasis(across, above, toward);
  const tanV = halfTan(BASE_FOV);
  const tanH = tanV * Math.max(aspect, 0.1);
  let distance = 0;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.sub(out.target);
    const wide = Math.abs(corner.dot(across)) / tanH;
    const tall = Math.abs(corner.dot(above)) / tanV;
    distance = Math.max(distance, corner.dot(toward) + Math.max(wide, tall));
  }
  distance *= OVERVIEW_MARGIN;
  out.eye.copy(OVERVIEW_DIR).multiplyScalar(distance).add(out.target);
  out.up.copy(UP);
  out.fov = BASE_FOV;
  out.near = distance * 0.005;
  return out;
}

// South of the rocket, facing north, as the overview.
const FOLLOW_OFFSET = new THREE.Vector3(0, 0.32, 1.14).multiplyScalar(3.4);

/** The starting offset from what it follows, `length` long. */
export const followOffset = (length: number, out: THREE.Vector3): THREE.Vector3 =>
  out.copy(FOLLOW_OFFSET).multiplyScalar(length);

export function followPose(point: THREE.Vector3, offset: THREE.Vector3, out: CameraPose): CameraPose {
  out.target.copy(point);
  out.eye.addVectors(point, offset);
  out.up.copy(UP);
  out.fov = BASE_FOV;
  out.near = offset.length() * 0.01;
  return out;
}

const PAD_MIN_AWAY_M = 3;
const PAD_LENGTHS_AWAY = 4;
const EYE_HEIGHT_M = 1.7;

/** Off to one side of the way the flight drifts, so it does not pass overhead. */
export function padEye(track: FlightTrack, rocketLength: number, unitsPerMeter: number): THREE.Vector3 {
  const pad = track.scenePts[0] ?? new THREE.Vector3();
  const end = track.scenePts[track.scenePts.length - 1] ?? pad;
  const side = new THREE.Vector3(end.z - pad.z, 0, pad.x - end.x);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 1);
  const away = Math.max(PAD_MIN_AWAY_M * unitsPerMeter, PAD_LENGTHS_AWAY * rocketLength);
  // Toward the overview's side.
  side.setLength(side.dot(OVERVIEW_DIR) < 0 ? -away : away);
  return side.add(pad).setY(pad.y + Math.min(EYE_HEIGHT_M * unitsPerMeter, away / 2));
}

/** A lens that narrows to hold what it watches at its size on the pad. `zoom` widens it. */
export function padPose(
  eye: THREE.Vector3,
  point: THREE.Vector3,
  padDistance: number,
  zoom: number,
  out: CameraPose,
): CameraPose {
  out.eye.copy(eye);
  out.target.copy(point);
  out.up.copy(UP);
  const distance = Math.max(eye.distanceTo(point), 1e-9);
  const tan = halfTan(BASE_FOV) * Math.min(1, padDistance / distance) * zoom;
  out.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.min(tan, 1.2)));
  out.near = padDistance * 0.02;
  return out;
}

const TRAVEL_SPAN_S = 0.4;
const ahead = new THREE.Vector3();

/** The direction of travel, over a short span so a wobble does not shake the camera. */
export function travelAt(track: FlightTrack, t: number, out: THREE.Vector3): THREE.Vector3 {
  trackPositionAt(track, t - TRAVEL_SPAN_S, out);
  out.subVectors(trackPositionAt(track, t + TRAVEL_SPAN_S, ahead), out);
  return out.lengthSq() < 1e-12 ? out.copy(UP) : out.normalize();
}

const CHASE_NEAREST = 2.6; // rocket lengths
// Off the line of travel, so straight up and straight down still have a level horizon.
const CHASE_SIDE = new THREE.Vector3(0.48, 0, 0.88).normalize();

export function chasePose(point: THREE.Vector3, travel: THREE.Vector3, length: number, out: CameraPose): CameraPose {
  const distance = length * 3.2;
  out.eye
    .copy(travel)
    .multiplyScalar(-0.9 * distance)
    .addScaledVector(CHASE_SIDE, 0.42 * distance)
    .add(point);
  out.eye.y = Math.max(out.eye.y, length * 0.1);
  // Held up by the ground, as at launch: back away along it instead.
  const short = CHASE_NEAREST * length - out.eye.distanceTo(point);
  if (short > 0) out.eye.addScaledVector(CHASE_SIDE, short);
  out.target.copy(point).addScaledVector(travel, length * 0.25);
  out.up.copy(UP);
  out.fov = BASE_FOV;
  out.near = distance * 0.01;
  return out;
}

/** On the side of the body near its front, looking back down it. `fore` is where the part still there begins. */
export function onboardPose(
  place: Placement,
  radius: number,
  modelScale: number,
  out: CameraPose,
  fore = place.span.fore,
): CameraPose {
  const { span, quaternion, position } = place;
  const length = extentLength(span);
  const local = (x: number, y: number, v: THREE.Vector3) =>
    v
      .set(x - extentCenter(span), y, 0)
      .multiplyScalar(modelScale)
      .applyQuaternion(quaternion)
      .add(position);
  local(Math.max(span.fore + length * 0.25, fore + (span.aft - fore) * 0.1), radius * 3.2, out.eye);
  local(span.aft + length, radius * 1.2, out.target);
  out.up.set(0, 1, 0).applyQuaternion(quaternion);
  out.fov = ONBOARD_FOV;
  out.near = radius * modelScale * 0.1;
  return out;
}

/** How much of the view's height something `size` across fills. */
export const viewFraction = (size: number, distance: number, fov: number): number =>
  size / Math.max(2 * distance * halfTan(fov), 1e-12);

/** Which way the top of the view lies over the ground, degrees clockwise from north. */
export function headingDeg(camera: THREE.Camera, work: THREE.Vector3): number {
  camera.getWorldDirection(work);
  // Straight up or down, the view's own up says.
  if (Math.hypot(work.x, work.z) < 0.05) {
    const down = work.y < 0;
    work.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (!down) work.negate();
  }
  return THREE.MathUtils.radToDeg(Math.atan2(work.x, -work.z));
}
