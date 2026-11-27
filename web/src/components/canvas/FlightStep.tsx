import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { carrierAt, type FlightBody } from '../../services/flight/flightBodies';
import {
  extentCenter,
  extentLength,
  liftOnPad,
  newPlacement,
  placeCarrier,
  placedNose,
  type BodySpan,
  type PadLift,
} from './bodyMotion';
import type { AirframeRig } from './airframeRig';
import { applyDrawn, worldOf, type DrawnMotion } from './drawnMotion';
import type { FlightScene } from './flightScene';
import { headingDeg, viewFraction } from './flightCamera';
import { FlightCameraRig, type Orbit, type Shot } from './flightCameraRig';
import type { HungDevice } from './hungDevices';
import { deviceTurn, reachAbove } from './recoveryMotion';

const HUD_INTERVAL_MS = 100;
const MAX_STEP_SECONDS = 0.25; // a hidden tab's first frame spans the whole time it was hidden
const MAX_CAMERA_STEP_SECONDS = 0.05;
// Smaller than this share of the view's height, the tracked body gets a ring.
const RING_BELOW = 0.03;

/** Advances playback each frame, places the bodies and moves the camera. Draws nothing. */
export function FlightStep({
  scene,
  bodies,
  spans,
  shotAt,
  still,
  playing,
  speed,
  loop,
  progressRef,
  modelRefs,
  hung,
  deviceRefs,
  rigs,
  drawn,
  radius,
  ringRef,
  ringLabelRef,
  scaleRef,
  padRef,
  padLift,
  dialRef,
  onTick,
  onEnd,
}: {
  scene: FlightScene;
  bodies: readonly FlightBody[];
  spans: readonly (readonly BodySpan[])[];
  shotAt: (t: number) => Shot;
  /** Cuts between views instead of moving. */
  still: boolean;
  playing: boolean;
  speed: number;
  loop: boolean;
  progressRef: RefObject<number>;
  modelRefs: RefObject<(THREE.Group | null)[]>;
  hung: readonly HungDevice[];
  /** In step with `hung`. */
  deviceRefs: RefObject<(THREE.Group | null)[]>;
  /** None with effects off. */
  rigs: readonly AirframeRig[];
  /** In step with the tracks; none with effects off. */
  drawn: readonly DrawnMotion[];
  /** The airframe's, in meters. */
  radius: number;
  ringRef: RefObject<THREE.Group | null>;
  ringLabelRef: RefObject<HTMLDivElement | null>;
  /** Told each frame's scene units per meter of rocket. */
  scaleRef: RefObject<number>;
  padRef: RefObject<THREE.Group | null>;
  /** How the pad's deflector holds the rocket up, as FlightPad draws it. */
  padLift: PadLift;
  /** The compass rose. */
  dialRef: RefObject<SVGGElement | null>;
  onTick: (progress: number) => void;
  onEnd: () => void;
}) {
  const orbit = useThree((s) => s.controls) as Orbit | null;
  const canvas = useThree((s) => s.gl.domElement);
  const places = useMemo(() => bodies.map(newPlacement), [bodies]);
  const padAt = scene.scenePts[0];
  const rig = useMemo(() => new FlightCameraRig(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const hudAt = useRef(0);

  useEffect(() => {
    const zoom = (e: WheelEvent) => {
      if (rig.zoomPad(e.deltaY)) e.preventDefault();
    };
    canvas.addEventListener('wheel', zoom, { passive: false });
    // The pad camera's drag: OrbitControls is off in it, so the two never both take a drag.
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button === 0) last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      if (rig.walkPad(e.clientX - last.x, e.clientY - last.y)) e.preventDefault();
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      last = null;
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('wheel', zoom);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [canvas, rig]);

  useFrame(({ camera }, dt) => {
    const { tracks, duration } = scene;
    let p = progressRef.current;
    let ended = false;
    if (playing && duration > 0) {
      p += (Math.min(dt, MAX_STEP_SECONDS) * speed) / duration;
      if (p >= 1) {
        if (loop) p %= 1;
        else {
          p = 1;
          ended = true;
        }
      }
      progressRef.current = p;
    }

    const nowT = p * duration;
    const shot = shotAt(nowT);
    rig.begin(shot, Math.min(dt, MAX_CAMERA_STEP_SECONDS), still);
    const { scale } = rig;
    scaleRef.current = scale;
    padRef.current?.scale.setScalar(scale);
    for (const rig of rigs) rig.update(nowT);
    const reaching = (body: number, way: 'above' | 'below') => {
      let most = 0;
      for (const r of rigs) if (r.frame.body === body) most = Math.max(most, r[way]);
      return most;
    };
    bodies.forEach((_body, i) => {
      const carrier = carrierAt(bodies, i, nowT);
      const track = tracks[carrier];
      const place = places[i];
      if (!track || !place) return;
      placeCarrier(track, spans[carrier] ?? [], nowT, scale, place);
      if (padAt) liftOnPad(place, padAt, padLift, nowT, scale);
      const motion = drawn[carrier];
      if (motion) applyDrawn(place, motion, track, nowT, scale, radius, reaching(carrier, 'below'));
      const model = modelRefs.current[i];
      if (!model) return;
      model.position.copy(place.position);
      model.quaternion.copy(place.quaternion);
      model.scale.setScalar(scale);
      model.children[0]?.position.setX(-extentCenter(place.span));
    });

    hung.forEach((d, i) => {
      const group = deviceRefs.current[i];
      const at = places[d.body];
      if (!group || !at) return;
      // On the ground it lies beside what it brought down, or, with that left standing, is gone.
      group.visible = nowT >= d.from && (nowT <= d.to || drawn.length > 0);
      if (!group.visible) return;
      group.scale.setScalar(scale);
      if (d.tie) worldOf(at, d.tie(group.position), scale);
      else placedNose(at, scale, group.position);
      deviceTurn(hung, i, nowT, at.dir, group.quaternion, d.aside());
    });

    const place = places[shot.tracked];
    const track = tracks[carrierAt(bodies, shot.tracked, nowT)];
    if (place && track && camera instanceof THREE.PerspectiveCamera) {
      const above = reachAbove(hung, shot.tracked, nowT) + reaching(shot.tracked, 'above');
      const own = rigs.find((r) => r.frame.body === shot.tracked && r.frame.carrierId == null);
      rig.show(place, above, track, nowT, camera, orbit, own?.foreAt(nowT));
      ringRef.current?.position.copy(place.position);
      const size = extentLength(place.span) * scale;
      dialRef.current?.setAttribute('transform', `rotate(${-headingDeg(camera, ahead)})`);
      const small = viewFraction(size, camera.position.distanceTo(place.position), camera.fov) < RING_BELOW;
      if (ringLabelRef.current) ringLabelRef.current.style.display = small ? '' : 'none';
    }

    if (ended) {
      hudAt.current = performance.now();
      onTick(p);
      onEnd();
    } else if (playing) {
      const now = performance.now();
      if (now - hudAt.current >= HUD_INTERVAL_MS) {
        hudAt.current = now;
        onTick(p);
      }
    }
  });
  return null;
}
