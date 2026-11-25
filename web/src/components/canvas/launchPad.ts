import * as THREE from 'three';
import { extentCenter, extentLength, type BodySpan } from './bodyMotion';
import { newTrackPose, trackPoseAt, type FlightTrack } from './flightTrack';
import { piecesBounds, type Piece } from './rocketPieces';

/** Meters. */
export interface LaunchRod {
  /** On the ground, from the pad's middle. */
  foot: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  radius: number;
}

const MIN_ROD_RADIUS = 0.0015;
const ROD_SHARE = 0.004; // of the rocket's length

/** The airframe's radius: its nose cone, tubes and transitions, without the fins. */
export function airframeRadius(pieces: readonly Piece[]): number {
  const box = piecesBounds(pieces.filter((p) => p.translucent));
  return box.isEmpty() ? 0.01 : Math.max(0.005, (box.max.y - box.min.y) / 2);
}

/** Where the rod passes the rocket's axis: through its first launch lug or rail button, else beside the airframe. */
function guideOffset(pieces: readonly Piece[], radius: number): { y: number; z: number } {
  const guide = pieces.find((p) => /^(lug|button)\d/.test(p.key));
  if (!guide) return { y: radius, z: 0 };
  const at = piecesBounds([guide]).getCenter(new THREE.Vector3());
  return { y: at.y, z: at.z };
}

/** Along the attitude the flight recorded at launch. */
export function launchRod(track: FlightTrack, span: BodySpan, pieces: readonly Piece[], rodLengthM: number): LaunchRod {
  const pose = trackPoseAt(track, track.times[0] ?? 0, newTrackPose());
  const rocketLength = extentLength(span);
  const radius = Math.max(MIN_ROD_RADIUS, rocketLength * ROD_SHARE);
  const { y, z } = guideOffset(pieces, airframeRadius(pieces) + radius * 1.5);
  const dir = pose.dir.clone();
  // As `placeCarrier` stands it: its aft end on the ground.
  const foot = new THREE.Vector3(span.aft - extentCenter(span), y, z).applyQuaternion(pose.quaternion);
  foot.y += (rocketLength / 2) * Math.abs(dir.y);
  if (dir.y > 0.1) foot.addScaledVector(dir, -foot.y / dir.y);
  foot.y = 0;
  return { foot, dir, length: rodLengthM, radius };
}
