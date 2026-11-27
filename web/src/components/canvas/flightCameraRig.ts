import * as THREE from 'three';
import { extentLength, type Placement } from './bodyMotion';
import {
  blendPose,
  blendRatio,
  chasePose,
  copyPose,
  followOffset,
  followPose,
  isOrbitView,
  newCameraPose,
  onboardPose,
  overviewPose,
  padEye,
  padPose,
  travelAt,
  type CameraPose,
  type FlightView,
} from './flightCamera';
import type { FlightTrack } from './flightTrack';

const MOVE_SECONDS = 0.6;
const UP = new THREE.Vector3(0, 1, 0);
// A drag across the view turns the pad camera about half way round the pad.
const WALK_RAD_PER_PX = 0.005;
const WALK_RISE_PER_PX = 0.004;
// Enough for a canopy to clear the top of the view.
const ROOM_ABOVE = 0.65;

export interface Orbit {
  target: THREE.Vector3;
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  update: () => void;
}

/** What the rig is asked to show. A change of any of them moves the camera there. */
export interface Shot {
  view: FlightView;
  /** The director's pick: it cuts from one of them to the next. */
  directed: boolean;
  tracked: number;
  /** Counts the times the view was asked for afresh. */
  epoch: number;
  /** Everything the overview frames, in scene units. */
  bounds: THREE.Box3;
  /** The first branch's, whose pad and drift place the pad camera. */
  track: FlightTrack;
  unitsPerMeter: number;
  /** Scene units per meter of rocket. */
  overviewScale: number;
  rocketLengthM: number;
  bodyRadiusM: number;
}

const scaleFor = (s: Shot): number => (s.view === 'overview' ? s.overviewScale : s.unitsPerMeter);

/**
 * Moves the camera between views and keeps it in the one shown. Each frame: `begin`, which sets `scale`, then
 * place the bodies at that scale, then `show`.
 */
export class FlightCameraRig {
  /** Scene units per meter of rocket, mid-move included. */
  scale = 0;
  readonly pose: CameraPose = newCameraPose();
  private readonly goal = newCameraPose();
  private readonly from = newCameraPose();
  private fromScale = 0;
  private elapsed = Infinity;
  private shot: Shot | null = null;
  private readonly offset = new THREE.Vector3();
  private framed = false;
  private settled = false;
  private readonly lastPoint = new THREE.Vector3();
  private lastRoom = 0;
  // Of what it followed when framed: the same whichever way a separation is scrubbed across.
  private framedLength = 1;
  private readonly travel = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private padZoom = 1;
  private readonly walk = new THREE.Vector3();

  /** Whether it did: only the pad camera has a lens to zoom. */
  zoomPad(wheel: number): boolean {
    if (this.shot?.view !== 'pad') return false;
    this.padZoom = THREE.MathUtils.clamp(this.padZoom * Math.exp(wheel * 0.001), 0.1, 8);
    return true;
  }

  /**
   * Whether it did: a drag walks the pad camera around the pad, and up or down, still turning to follow the rocket.
   * The pad camera keeps no orbit of its own, since it stands still on the ground and turns.
   */
  walkPad(dxPx: number, dyPx: number): boolean {
    const pad = this.shot?.view === 'pad' ? this.shot.track.scenePts[0] : undefined;
    if (!pad) return false;
    const off = this.walk.subVectors(this.eye, pad).applyAxisAngle(UP, -dxPx * WALK_RAD_PER_PX);
    const away = Math.max(Math.hypot(off.x, off.z), 1e-6);
    off.y = THREE.MathUtils.clamp(off.y + dyPx * away * WALK_RISE_PER_PX, away * 0.01, away * 3);
    this.eye.copy(pad).add(off);
    return true;
  }

  begin(shot: Shot, dt: number, still: boolean): void {
    const last = this.shot;
    const anew = !last || last.view !== shot.view || last.epoch !== shot.epoch || last.track !== shot.track;
    if (anew || (last.tracked !== shot.tracked && shot.view !== 'overview')) {
      copyPose(this.pose, this.from);
      this.fromScale = this.scale;
      const cut = last?.directed && shot.directed && last.view !== shot.view;
      this.elapsed = !last || still || cut ? Infinity : 0;
      if (anew) {
        this.padZoom = 1;
        this.eye = padEye(shot.track, shot.rocketLengthM * shot.unitsPerMeter, shot.unitsPerMeter);
      }
      this.settled = false;
      this.framed &&= !anew;
    }
    this.shot = shot;
    this.elapsed += dt;
    this.scale = blendRatio(this.fromScale, scaleFor(shot), this.progress);
  }

  private get progress(): number {
    return THREE.MathUtils.smoothstep(this.elapsed, 0, MOVE_SECONDS);
  }

  /** `above` is how far what it hangs from reaches over it, in meters; `fore` is where what is left of it begins. */
  show(
    place: Placement,
    above: number,
    track: FlightTrack,
    t: number,
    camera: THREE.PerspectiveCamera,
    orbit: Orbit | null,
    fore = place.span.fore,
  ): void {
    const { shot, goal } = this;
    if (!shot) return;
    const room = ROOM_ABOVE * above;
    const own = Math.max(extentLength(place.span), 1e-3);
    const length = (own + room) * scaleFor(shot);
    const u = this.progress;
    const moving = u < 1;
    const free = isOrbitView(shot.view) && orbit != null;
    if (!this.framed) {
      this.framed = true;
      this.framedLength = own;
      followOffset(length, this.offset);
      if (shot.view === 'overview') overviewPose(shot.bounds, camera.aspect, goal);
    }
    if (!this.settled || !free) {
      if (shot.view === 'follow') followPose(place.position, this.offset, goal);
      else if (shot.view !== 'overview') this.frame(shot, place, track, t, length, fore);
      blendPose(this.from, goal, u, this.pose);
      camera.position.copy(this.pose.eye);
      camera.up.copy(this.pose.up);
      camera.lookAt(this.pose.target);
      if (orbit) {
        orbit.target.copy(this.pose.target);
        orbit.enabled = free && !moving;
        const distance = goal.eye.distanceTo(goal.target);
        orbit.minDistance = shot.view === 'follow' ? length * 0.6 : distance * 0.02;
        orbit.maxDistance = shot.view === 'follow' ? Math.max(distance * 200, 200) : distance * 5;
        // Looking up from the ground is fine; the eye is kept above it below.
        orbit.maxPolarAngle = Math.PI * 0.95;
        if (orbit.enabled) orbit.update();
      }
      this.lens(camera, this.pose.fov, this.pose.near);
      this.settled = !moving;
    } else if (orbit) {
      this.ride(shot, place, length, (this.framedLength + room) / (this.framedLength + this.lastRoom), camera, orbit);
    }
    this.lastPoint.copy(place.position);
    this.lastRoom = room;
  }

  private frame(shot: Shot, place: Placement, track: FlightTrack, t: number, length: number, fore: number): void {
    const { goal } = this;
    if (shot.view === 'pad') {
      const pad = shot.track.scenePts[0] ?? this.eye;
      padPose(this.eye, place.position, this.eye.distanceTo(pad), this.padZoom, goal);
    } else if (shot.view === 'chase') {
      chasePose(place.position, travelAt(track, t, this.travel), length, goal);
    } else {
      onboardPose(place, shot.bodyRadiusM, this.scale, goal, fore);
    }
  }

  // The mouse has the camera: carry it along with what it follows, and keep it out of the ground.
  private ride(
    shot: Shot,
    place: Placement,
    length: number,
    back: number,
    camera: THREE.PerspectiveCamera,
    orbit: Orbit,
  ): void {
    if (shot.view === 'follow') {
      this.lastPoint.subVectors(place.position, this.lastPoint);
      camera.position.add(this.lastPoint);
      orbit.target.add(this.lastPoint);
      // Back from a canopy as it opens, whatever the zoom.
      if (back !== 1) camera.position.sub(orbit.target).multiplyScalar(back).add(orbit.target);
    }
    camera.position.y = Math.max(camera.position.y, length * 0.05);
    camera.lookAt(orbit.target);
    const { pose } = this;
    pose.eye.copy(camera.position);
    pose.target.copy(orbit.target);
    this.offset.subVectors(camera.position, orbit.target);
    pose.near = this.offset.length() * (shot.view === 'follow' ? 0.01 : 0.005);
    this.lens(camera, pose.fov, pose.near);
  }

  private lens(camera: THREE.PerspectiveCamera, fov: number, near: number): void {
    const far = Math.max(1000, this.shot?.bounds.max.length() ?? 0) * 4;
    if (camera.fov === fov && camera.near === near && camera.far === far) return;
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}
