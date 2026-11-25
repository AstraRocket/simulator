import * as THREE from 'three';
import type { FlightBody } from '../../services/flight/flightBodies';
import { eventTime } from '../../services/flight/flightEvents';
import { windAt } from '../../services/flight/flightWind';
import { extentCenter, extentLength, type BodySpan, type Placement } from './bodyMotion';
import { newTrackPose, sceneFromEnu, trackPoseAt, type FlightTrack } from './flightTrack';

// Motion the engine does not record, drawn on top of what it does. Every one is a function of flight time alone.

/** The engine holds a tumbling body's attitude, and leaves a landed one as it came down. */
export interface DrawnMotion {
  tumbleFrom: number;
  /** Radians a second. */
  tumbleRate: number;
  tumbleAxis: THREE.Vector3;
  landsAt: number;
  /** Level: the way it lies once down. */
  lies: THREE.Vector3;
  /** About its axis, from the rocket's +Y: the side that is level once it lies. */
  side: number;
  /** How far down on the ground it is, 0 to 1. */
  lie: (t: number) => number;
}

const MIN_TUMBLE = 2;
const MAX_TUMBLE = 7;
const LIE_SECONDS = [0.9, 1.8] as const;
const LEVEL = new THREE.Vector3(0, 1, 0);
const TO_NOSE = new THREE.Vector3(-1, 0, 0);

/** `above` is how far what it hangs from reaches over it as it lands, in meters. */
export function drawnMotion(body: FlightBody, track: FlightTrack, span: BodySpan | undefined, above = 0): DrawnMotion {
  const { branch } = body;
  const landsAt = track.times.at(-1) ?? 0;
  const tumbleFrom = eventTime(branch.events, 'TUMBLE') ?? Infinity;
  let fastest = 0;
  track.times.forEach((t, i) => {
    if (t > tumbleFrom) fastest = Math.max(fastest, Math.abs(track.vels[i]!));
  });
  const length = Math.max(span ? extentLength(span) : 0, 0.05);
  const wind = windAt(branch.series, landsAt);
  const lies = wind && wind.speed > 0.2 ? sceneFromEnu(wind.east, 0, wind.north) : new THREE.Vector3(1, 0, 0);
  lies.normalize();
  const landed = trackPoseAt(track, landsAt, newTrackPose()).quaternion;
  const nose = TO_NOSE.clone().applyQuaternion(landed);
  landed.premultiply(new THREE.Quaternion().setFromUnitVectors(nose, lies)).invert();
  const side = new THREE.Vector3().crossVectors(LEVEL, lies).applyQuaternion(landed);
  const speed = Math.max(Math.abs(track.vels.at(-1) ?? 0), 0.1);
  const seconds = THREE.MathUtils.clamp(above / speed, ...LIE_SECONDS);
  return {
    tumbleFrom,
    tumbleRate: THREE.MathUtils.clamp(fastest / (3 * length), MIN_TUMBLE, MAX_TUMBLE),
    tumbleAxis: new THREE.Vector3(lies.z, 0, -lies.x),
    landsAt,
    lies,
    side: Math.atan2(side.z, side.y),
    lie: (t) => THREE.MathUtils.smoothstep(t, landsAt, landsAt + seconds),
  };
}

const turn = new THREE.Quaternion();
const whole = new THREE.Quaternion();

/** Turns a placed body as drawn. `radius` is its airframe's, and `below` how far it hangs past its back, in meters. */
export function applyDrawn(
  place: Placement,
  d: DrawnMotion,
  track: FlightTrack,
  t: number,
  modelScale: number,
  radius: number,
  below = 0,
): void {
  let turned = below > 1e-6;
  if (t > d.tumbleFrom) {
    const until = Math.min(t, track.deployT, d.landsAt);
    const along = Math.max(0, until - d.tumbleFrom);
    let angle = d.tumbleRate * (along - (1 - Math.exp(-1.5 * along)) / 1.5);
    if (t > track.deployT) {
      angle = Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - THREE.MathUtils.smoothstep(t - track.deployT, 0, 1));
    }
    rotate(place, turn.setFromAxisAngle(d.tumbleAxis, angle));
    turned = true;
  }
  if (t > d.landsAt) {
    whole.setFromUnitVectors(place.dir, d.lies);
    rotate(place, turn.identity().slerp(whole, d.lie(t)));
    turned = true;
  }
  if (!turned) return;
  const half = extentLength(place.span) / 2 + below;
  const least = half * Math.abs(place.dir.y) + radius * Math.sqrt(Math.max(0, 1 - place.dir.y ** 2));
  place.position.y = t > d.landsAt ? least * modelScale : Math.max(place.position.y, least * modelScale);
}

function rotate(place: Placement, by: THREE.Quaternion): void {
  place.quaternion.premultiply(by);
  place.dir.applyQuaternion(by).normalize();
}

/** Where a point of a placed body's rocket frame, in meters, is. Overwrites it. */
export function worldOf(place: Placement, point: THREE.Vector3, modelScale: number): THREE.Vector3 {
  point.x -= extentCenter(place.span);
  return point.applyQuaternion(place.quaternion).multiplyScalar(modelScale).add(place.position);
}
