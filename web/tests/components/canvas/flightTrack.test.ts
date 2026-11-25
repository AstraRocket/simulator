import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FlightSeries } from '../../../src/engine/openRocketEngine';
import {
  buildTrack,
  indexAtTime,
  newTrackPose,
  trackPoseAt,
  trackPositionAt,
  trackRows,
} from '../../../src/components/canvas/flightTrack';

const series = (over: Record<string, number[]>): FlightSeries => {
  const time = over['time'] ?? [0, 1, 2, 3];
  return {
    time,
    altitude: time.map((t) => t * 10),
    velocity: time.map(() => 10),
    Px: time.map(() => 0),
    Py: time.map(() => 0),
    ...over,
  } as unknown as FlightSeries;
};
const track = (over: Record<string, number[]> = {}, deployT = Infinity) =>
  buildTrack(trackRows(series(over)), 1, deployT);
const nose = (q: THREE.Quaternion) => new THREE.Vector3(-1, 0, 0).applyQuaternion(q);
const fin = (q: THREE.Quaternion) => new THREE.Vector3(0, 1, 0).applyQuaternion(q);
const off = (v: THREE.Vector3, x: number, y: number, z: number) => v.distanceTo(new THREE.Vector3(x, y, z));

describe('indexAtTime', () => {
  it('is the last sample at or before the time, held at both ends', () => {
    const times = [0, 0.1, 0.3, 0.7, 1.5, 4, 9];
    expect([-1, 0, 0.29, 0.3, 4.5, 9, 99].map((t) => indexAtTime(times, t))).toEqual([0, 0, 1, 2, 5, 6, 6]);
  });

  it('takes the last of several samples at one time', () => {
    expect(indexAtTime([0, 1, 1, 1, 2], 1)).toBe(3);
  });

  it('handles an empty or single-sample series', () => {
    expect(indexAtTime([], 0.5)).toBe(0);
    expect(indexAtTime([3], 0.5)).toBe(0);
  });
});

describe('a position between samples', () => {
  it('lies on the line between them', () => {
    expect(trackPositionAt(track(), 1.25, new THREE.Vector3()).y).toBeCloseTo(12.5, 9);
  });

  it('holds at the ends', () => {
    expect(trackPositionAt(track(), -5, new THREE.Vector3()).y).toBe(0);
    expect(trackPositionAt(track(), 50, new THREE.Vector3()).y).toBe(30);
  });
});

describe('the attitude', () => {
  it('is the recorded one, not the path tangent', () => {
    // Climbing straight up while the nose leans 45 degrees east.
    const at = trackPoseAt(
      track({ Θ: [0, 1, 2, 3].map(() => Math.PI / 4), Φ: [0, 1, 2, 3].map(() => Math.PI / 2) }),
      1.5,
      newTrackPose(),
    );
    expect(off(nose(at.quaternion), Math.SQRT1_2, Math.SQRT1_2, 0)).toBeLessThan(1e-6);
    expect(off(at.dir, Math.SQRT1_2, Math.SQRT1_2, 0)).toBeLessThan(1e-6);
  });

  it('puts a northward heading on -z', () => {
    const at = trackPoseAt(track({ Θ: [0, 0, 0, 0], Φ: [0, 0, 0, 0] }), 1, newTrackPose());
    expect(off(nose(at.quaternion), 0, 0, -1)).toBeLessThan(1e-6);
  });

  it('turns evenly between samples', () => {
    const at = trackPoseAt(
      track({ Θ: [Math.PI / 2, 0, 0, 0], Φ: [0, 1, 2, 3].map(() => Math.PI / 2) }),
      0.5,
      newTrackPose(),
    );
    expect(off(nose(at.quaternion), Math.SQRT1_2, Math.SQRT1_2, 0)).toBeLessThan(1e-6);
  });

  it('follows the path where the run recorded none', () => {
    const at = trackPoseAt(track({ Px: [0, 10, 20, 30] }), 1, newTrackPose());
    expect(off(nose(at.quaternion), Math.SQRT1_2, Math.SQRT1_2, 0)).toBeLessThan(1e-6);
  });

  it('stands upright before a path that has not moved', () => {
    const at = trackPoseAt(track({ altitude: [0, 0, 0, 0] }), 0, newTrackPose());
    expect(off(nose(at.quaternion), 0, 1, 0)).toBeLessThan(1e-6);
  });

  it('survives an empty path', () => {
    const empty = buildTrack([], 1, Infinity);
    expect(off(nose(trackPoseAt(empty, 0, newTrackPose()).quaternion), 0, 1, 0)).toBeLessThan(1e-6);
  });
});

describe('the roll', () => {
  it('is the recorded roll rate added up, right-handed about the nose', () => {
    const still = trackPoseAt(track(), 2, newTrackPose());
    const quarter = trackPoseAt(track({ dΦ: [0, 1, 2, 3].map(() => Math.PI / 4) }), 2, newTrackPose());
    const turned = fin(still.quaternion).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    expect(off(fin(quarter.quaternion), turned.x, turned.y, turned.z)).toBeLessThan(1e-6);
    expect(off(nose(quarter.quaternion), 0, 1, 0)).toBeLessThan(1e-6);
  });

  it('interpolates through whole turns instead of taking the short way back', () => {
    const spin = track({ dΦ: [0, 1, 2, 3].map(() => 4 * Math.PI) });
    const half = trackPoseAt(spin, 0.25, newTrackPose());
    const still = trackPoseAt(track(), 0.25, newTrackPose());
    const turned = fin(still.quaternion).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    expect(off(fin(half.quaternion), turned.x, turned.y, turned.z)).toBeLessThan(1e-6);
  });

  it('adds none of its own as the nose swings through straight down', () => {
    // Elevation runs past -90 degrees by swapping the heading to the far side.
    const down = track({ Θ: [-1.4, -1.56, -1.56, -1.4], Φ: [Math.PI / 2, Math.PI / 2, -Math.PI / 2, -Math.PI / 2] });
    const before = fin(trackPoseAt(down, 1, newTrackPose()).quaternion);
    const after = fin(trackPoseAt(down, 2, newTrackPose()).quaternion);
    expect(before.angleTo(after)).toBeLessThan(0.05);
  });
});

describe('under a recovery device', () => {
  const level = { Θ: [0, 0, 0, 0, 0], Φ: [0, 0, 0, 0, 0], time: [0, 1, 2, 3, 4] };

  it('swings from its recorded attitude to hang nose up', () => {
    const t = track(level, 1);
    expect(off(nose(trackPoseAt(t, 1, newTrackPose()).quaternion), 0, 0, -1)).toBeLessThan(1e-6);
    const mid = nose(trackPoseAt(t, 1.75, newTrackPose()).quaternion);
    expect(mid.y).toBeCloseTo(Math.SQRT1_2, 6);
    expect(off(nose(trackPoseAt(t, 2.5, newTrackPose()).quaternion), 0, 1, 0)).toBeLessThan(1e-6);
    expect(off(nose(trackPoseAt(t, 4, newTrackPose()).quaternion), 0, 1, 0)).toBeLessThan(1e-6);
  });

  it('keeps its recorded attitude with no device', () => {
    expect(off(nose(trackPoseAt(track(level), 4, newTrackPose()).quaternion), 0, 0, -1)).toBeLessThan(1e-6);
  });
});
