import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newPlacement } from '../../../src/components/canvas/bodyMotion';
import {
  BASE_FOV,
  blendPose,
  blendRatio,
  chasePose,
  headingDeg,
  isOrbitView,
  newCameraPose,
  onboardPose,
  overviewPose,
  padEye,
  padPose,
  travelAt,
  viewFraction,
} from '../../../src/components/canvas/flightCamera';
import { FlightCameraRig, type Orbit, type Shot } from '../../../src/components/canvas/flightCameraRig';
import { buildTrack, type FlightTrack } from '../../../src/components/canvas/flightTrack';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const track = (pts: [number, number, number][]): FlightTrack => ({
  ...buildTrack([], 1, Infinity),
  scenePts: pts.map((p) => V(...p)),
  times: pts.map((_, i) => i),
});
/** Where a point lands in the view, each axis -1 to 1 inside it. */
const seen = (p: THREE.Vector3, pose: ReturnType<typeof newCameraPose>, aspect: number) => {
  const cam = new THREE.PerspectiveCamera(pose.fov, aspect, pose.near, 1e4);
  cam.position.copy(pose.eye);
  cam.up.copy(pose.up);
  cam.lookAt(pose.target);
  cam.updateMatrixWorld();
  return p.clone().project(cam);
};

describe('the overview', () => {
  it.each([0.5, 1, 2.4])('frames the whole flight in a window of aspect %s, drift and all', (aspect) => {
    const box = new THREE.Box3(V(-60, 0, -3), V(2, 24, 8));
    const pose = overviewPose(box, aspect, newCameraPose());
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const at = seen(V(x, y, z), pose, aspect);
          expect(Math.max(Math.abs(at.x), Math.abs(at.y))).toBeLessThan(1);
        }
      }
    }
  });
});

describe('the pad camera', () => {
  const flight = track([
    [0, 0, 0],
    [0, 20, 0],
    [-40, 0, 0],
  ]);

  it('stands beside the drift, meters off at a small rocket and lengths off at a large one', () => {
    const near = padEye(flight, 0.02, 0.1);
    expect(near.x).toBeCloseTo(0, 9);
    expect(Math.abs(near.z)).toBeCloseTo(0.3, 9);
    expect(near.y).toBeCloseTo(0.15, 9);
    expect(Math.hypot(padEye(flight, 1, 0.1).x, padEye(flight, 1, 0.1).z)).toBeCloseTo(4, 9);
  });

  it('stands somewhere for a flight straight up and down', () => {
    expect(padEye(track([[0, 0, 0]]), 0.02, 0.1).length()).toBeGreaterThan(0);
  });

  it('narrows its lens to hold what it watches at one size', () => {
    const eye = V(0, 0, 10);
    const size = (d: number) => {
      const pose = padPose(eye, V(0, 0, 10 - d), 10, 1, newCameraPose());
      return viewFraction(1, d, pose.fov);
    };
    expect(size(300)).toBeCloseTo(size(10), 6);
    expect(padPose(eye, V(0, 0, 5), 10, 1, newCameraPose()).fov).toBeCloseTo(BASE_FOV, 6);
    expect(padPose(eye, V(0, 0, -90), 10, 0.5, newCameraPose()).fov).toBeLessThan(
      padPose(eye, V(0, 0, -90), 10, 1, newCameraPose()).fov,
    );
  });
});

describe('the chase camera', () => {
  it('rides behind the travel, above ground, and not up against the rocket on the pad', () => {
    const flying = chasePose(V(0, 50, 0), V(0, 1, 0), 1, newCameraPose());
    expect(flying.eye.y).toBeLessThan(50);
    const parked = chasePose(V(0, 0.5, 0), V(0, 1, 0), 1, newCameraPose());
    expect(parked.eye.y).toBeGreaterThan(0);
    expect(parked.eye.distanceTo(V(0, 0.5, 0))).toBeGreaterThan(2.2);
  });

  it('takes the travel from the path, and calls a stop upright', () => {
    const path = track([
      [0, 0, 0],
      [0, 0, 0],
      [10, 0, 0],
      [20, 0, 0],
    ]);
    expect(travelAt(path, 2.5, V(0, 0, 0)).x).toBeCloseTo(1, 9);
    expect(travelAt(path, 0.5, V(0, 0, 0)).y).toBe(1);
  });
});

describe('the onboard camera', () => {
  it('sits off the body looking aft, and rolls with it', () => {
    const place = newPlacement();
    place.span = { from: 0, fore: 0, aft: 1, offset: V(0, 0, 0) };
    place.position.set(0, 50, 0);
    const still = onboardPose(place, 0.05, 1, newCameraPose());
    expect(still.eye.y).toBeGreaterThan(50);
    expect(still.target.y).toBeLessThan(49);
    expect(Math.hypot(still.eye.x, still.eye.z)).toBeGreaterThan(0.1);
    place.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2));
    const rolled = onboardPose(place, 0.05, 1, newCameraPose());
    expect(rolled.eye.angleTo(still.eye)).toBeGreaterThan(0);
    expect(rolled.up.dot(still.up)).toBeCloseTo(0, 6);
  });
});

describe('the onboard camera of a body that has come apart', () => {
  it('rides on the part still there', () => {
    const place = newPlacement();
    place.span = { from: 0, fore: 0, aft: 1, offset: V(0, 0, 0) };
    place.position.set(0, 50, 0);
    expect(onboardPose(place, 0.05, 1, newCameraPose(), 0.6).eye.y).toBeLessThan(49.9);
  });
});

describe('moving between views', () => {
  const ground = { ...newCameraPose(), eye: V(0, 1, 10), target: V(0, 0, 0) };
  const far = { ...newCameraPose(), eye: V(0, 2, -1000), target: V(0, 0, 0), fov: 5 };

  it('starts and ends on the views', () => {
    const start = blendPose(ground, far, 0, newCameraPose());
    expect(start.eye.distanceTo(ground.eye)).toBeLessThan(1e-6);
    const end = blendPose(ground, far, 1, newCameraPose());
    expect(end.eye.distanceTo(far.eye)).toBe(0);
    expect(end.fov).toBe(5);
  });

  it('never goes under the lower of the two', () => {
    for (let u = 0; u <= 1; u += 0.05)
      expect(blendPose(ground, far, u, newCameraPose()).eye.y).toBeGreaterThanOrEqual(1);
  });

  it('changes size by ratio', () => {
    expect(blendRatio(0.01, 1, 0.5)).toBeCloseTo(0.1, 9);
    expect(blendRatio(0, 1, 0.5)).toBe(0.5);
  });
});

describe('the rig', () => {
  const flight = track([
    [0, 0, 0],
    [0, 24, 0],
    [5, 0, 0],
  ]);
  const shot = (over: Partial<Shot> = {}): Shot => ({
    view: 'overview',
    directed: false,
    tracked: 0,
    epoch: 0,
    bounds: new THREE.Box3(V(-1, 0, -1), V(6, 24, 1)),
    track: flight,
    unitsPerMeter: 0.05,
    overviewScale: 4,
    rocketLengthM: 0.4,
    bodyRadiusM: 0.012,
    ...over,
  });
  const setup = () => {
    const rig = new FlightCameraRig();
    const camera = new THREE.PerspectiveCamera(BASE_FOV, 1.5);
    const orbit: Orbit = {
      target: V(0, 0, 0),
      enabled: true,
      minDistance: 0,
      maxDistance: 0,
      maxPolarAngle: 0,
      update: () => {},
    };
    const place = newPlacement();
    place.span = { from: 0, fore: 0, aft: 0.4, offset: V(0, 0, 0) };
    const frame = (s: Shot, dt = 0.05, still = false, above = 0) => {
      rig.begin(s, dt, still);
      rig.show(place, above, flight, 1, camera, orbit);
    };
    return { rig, camera, orbit, place, frame };
  };

  it('opens on the overview without a move, the mouse in charge', () => {
    const { rig, orbit, frame } = setup();
    frame(shot());
    expect(rig.scale).toBe(4);
    expect(orbit.enabled).toBe(true);
    expect(orbit.target.distanceTo(V(2.5, 12, 0))).toBeLessThan(1e-6);
  });

  it('leaves the camera where the mouse put it', () => {
    const { camera, frame } = setup();
    frame(shot());
    camera.position.set(9, 9, 9);
    frame(shot());
    expect(camera.position.distanceTo(V(9, 9, 9))).toBe(0);
  });

  it('keeps the eye out of the ground', () => {
    const { camera, frame } = setup();
    frame(shot());
    camera.position.set(9, -3, 9);
    frame(shot());
    expect(camera.position.y).toBeGreaterThan(0);
  });

  it('moves to the rocket, shrinking it to true size, and hands the mouse back at the end', () => {
    const { rig, orbit, place, frame } = setup();
    place.position.set(1, 10, 0);
    frame(shot());
    frame(shot({ view: 'follow' }));
    expect(orbit.enabled).toBe(false);
    expect(rig.scale).toBeGreaterThan(0.05);
    for (let i = 0; i < 14; i++) frame(shot({ view: 'follow' }));
    expect(rig.scale).toBe(0.05);
    expect(orbit.enabled).toBe(true);
    expect(orbit.target.distanceTo(place.position)).toBeLessThan(1e-9);
  });

  it('cuts instead where motion is unwanted', () => {
    const { rig, orbit, frame } = setup();
    frame(shot(), 0.05, true);
    frame(shot({ view: 'follow' }), 0.05, true);
    expect(rig.scale).toBe(0.05);
    expect(orbit.enabled).toBe(true);
  });

  it('cuts between the director’s shots, and moves into the first', () => {
    const { rig, camera, orbit, place, frame } = setup();
    place.position.set(1, 10, 0);
    frame(shot());
    const home = camera.position.clone();
    frame(shot({ view: 'pad', directed: true }));
    expect(camera.position.distanceTo(home)).toBeLessThan(home.length() / 4);
    expect(rig.scale).toBeGreaterThan(0.05);
    frame(shot({ view: 'follow', directed: true }));
    expect(rig.scale).toBe(0.05);
    expect(orbit.target.distanceTo(place.position)).toBeLessThan(1e-9);
    expect(orbit.enabled).toBe(true);
  });

  it('carries the mouse’s own view along with what it follows', () => {
    const { camera, orbit, place, frame } = setup();
    frame(shot(), 0.05, true);
    frame(shot({ view: 'follow' }), 0.05, true);
    camera.position.set(0.5, 10, 0.5);
    frame(shot({ view: 'follow' }), 0.05, true);
    place.position.set(3, 7, -2);
    frame(shot({ view: 'follow' }), 0.05, true);
    expect(camera.position.distanceTo(V(3.5, 17, -1.5))).toBeLessThan(1e-6);
    expect(orbit.target.distanceTo(V(3, 7, -2))).toBeLessThan(1e-6);
  });

  it('is where it was after a separation is scrubbed across and back', () => {
    const { camera, orbit, place, frame } = setup();
    const away = () => camera.position.distanceTo(orbit.target);
    const whole = place.span;
    place.position.set(0, 10, 0);
    frame(shot({ view: 'follow' }), 0.05, true);
    const opening = away();
    place.span = { ...whole, aft: 0.05 };
    frame(shot({ view: 'follow' }), 0.05, true, 0.8);
    place.span = whole;
    frame(shot({ view: 'follow' }), 0.05, true, 0);
    expect(away()).toBeCloseTo(opening, 6);
  });

  it('backs off as a canopy opens over it, keeping the mouse’s zoom, and not for a stage dropped', () => {
    const { camera, orbit, place, frame } = setup();
    const away = () => camera.position.distanceTo(orbit.target);
    place.position.set(0, 10, 0);
    frame(shot({ view: 'follow' }), 0.05, true);
    const opening = away();
    camera.position.sub(orbit.target).multiplyScalar(2).add(orbit.target);
    frame(shot({ view: 'follow' }), 0.05, true, 0.8);
    expect(away()).toBeGreaterThan(opening * 4);
    frame(shot({ view: 'follow' }), 0.05, true, 0);
    expect(away()).toBeCloseTo(opening * 2, 6);
    place.span = { ...place.span, aft: 0.2 };
    frame(shot({ view: 'follow' }), 0.05, true, 0);
    expect(away()).toBeCloseTo(opening * 2, 6);
  });

  it('goes back to the opening framing when asked afresh', () => {
    const { camera, frame } = setup();
    frame(shot());
    const home = camera.position.clone();
    camera.position.set(9, 9, 9);
    frame(shot());
    frame(shot({ epoch: 1 }), 0.05, true);
    expect(camera.position.distanceTo(home)).toBeLessThan(1e-6);
  });

  it('holds the pad camera still and zooms its lens', () => {
    const { rig, camera, orbit, place, frame } = setup();
    place.position.set(0, 20, 0);
    frame(shot({ view: 'pad' }), 0.05, true);
    const at = camera.position.clone();
    const fov = camera.fov;
    expect(rig.zoomPad(-500)).toBe(true);
    place.position.set(2, 20, 0);
    frame(shot({ view: 'pad' }), 0.05, true);
    expect(camera.position.distanceTo(at)).toBe(0);
    expect(camera.fov).toBeLessThan(fov);
    expect(orbit.enabled).toBe(false);
    expect(isOrbitView('pad')).toBe(false);
    frame(shot({ view: 'chase' }), 0.05, true);
    expect(rig.zoomPad(-500)).toBe(false);
  });
});

describe('the compass heading', () => {
  const looking = (to: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)) => {
    const camera = new THREE.PerspectiveCamera();
    camera.up.copy(up);
    camera.lookAt(to);
    return headingDeg(camera, new THREE.Vector3());
  };

  it('is clockwise from north, level or not', () => {
    expect(looking(new THREE.Vector3(0, 0, -1))).toBeCloseTo(0, 6);
    expect(looking(new THREE.Vector3(1, 0.5, 0))).toBeCloseTo(90, 6);
    expect(looking(new THREE.Vector3(-1, -2, 0))).toBeCloseTo(-90, 6);
  });

  it('follows the view’s own up looking straight down', () => {
    expect(looking(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0))).toBeCloseTo(90, 4);
  });
});
