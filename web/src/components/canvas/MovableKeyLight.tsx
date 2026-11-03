import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * Where the key light starts, and where Reset puts it back, in the camera's
 * own frame: above, to the right, and from the viewer's side.
 */
const KEY_LIGHT_HOME = new THREE.Vector3(1.5, 2.5, 2);

/** Radians the light turns per pixel of drag. */
const TURN_PER_PX = 0.01;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const turn = new THREE.Quaternion();

/**
 * A directional light fixed to the camera rather than the scene: `from` is
 * the direction it shines from as the viewer sees it (+x right, +y up, +z
 * toward the viewer). Orbiting the model turns the light with the view, so
 * whichever side faces you is lit the same way, as in desktop OpenRocket's
 * 3D view.
 */
export function ViewLight({
  from,
  color,
  intensity,
}: {
  from: RefObject<THREE.Vector3> | THREE.Vector3Tuple;
  color?: string;
  intensity: number;
}) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(({ camera }) => {
    const l = light.current;
    if (!l) return;
    if (Array.isArray(from)) l.position.set(from[0], from[1], from[2]);
    else l.position.copy(from.current);
    // The light's target stays at the origin, so its position is its direction.
    l.position.applyQuaternion(camera.quaternion);
  });
  return <directionalLight ref={light} intensity={intensity} color={color} />;
}

/**
 * The 3D view's key light, which a right-button drag swings around the model,
 * as desktop OpenRocket's 3D view does: across swings it left and right as
 * you see it, up and down raises and lowers it. It is fixed to the camera
 * (`ViewLight`), so where you put it stays put as you orbit.
 *
 * `light` holds where it shines from, so the view can put it back (Reset)
 * and show where it is (`LightBall`). OrbitControls must leave the right
 * button alone for this to have it.
 */
export function MovableKeyLight({ light, color, intensity }: { light: KeyLight; color: string; intensity: number }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const el = gl.domElement;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return;
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      light.changed(true);
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      light.dir.current.applyQuaternion(turn.setFromAxisAngle(Y_AXIS, dx * TURN_PER_PX));
      light.dir.current.applyQuaternion(turn.setFromAxisAngle(X_AXIS, dy * TURN_PER_PX));
      light.changed(true);
      invalidate();
    };
    const up = (e: PointerEvent) => {
      if (!last) return;
      last = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      light.changed(false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [gl, light, invalidate]);

  return <ViewLight from={light.dir} intensity={intensity} color={color} />;
}

/** Where the key light is, as the ball draws it: its direction, and whether it is being dragged. */
interface LightView {
  x: number;
  y: number;
  z: number;
  dragging: boolean;
}

/**
 * The key light's direction, shared by the light in the scene and the ball
 * outside it. The scene reads `dir` every frame; the ball subscribes, so a
 * drag redraws the ball and not the whole view around it.
 */
export interface KeyLight {
  dir: RefObject<THREE.Vector3>;
  /** Tell the ball the light moved, and whether a drag is still on. */
  changed: (dragging: boolean) => void;
  /** Back where it started. */
  reset: () => void;
  subscribe: (fn: () => void) => () => void;
  view: () => LightView;
}

export function keyLight(): KeyLight {
  const dir = { current: KEY_LIGHT_HOME.clone() };
  const subs = new Set<() => void>();
  const snap = (dragging: boolean): LightView => {
    const n = dir.current.clone().normalize();
    return { x: n.x, y: n.y, z: n.z, dragging };
  };
  let view = snap(false);
  const changed = (dragging: boolean) => {
    view = snap(dragging);
    subs.forEach((fn) => fn());
  };
  return {
    dir,
    changed,
    reset: () => {
      dir.current.copy(KEY_LIGHT_HOME);
      changed(false);
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    view: () => view,
  };
}

/** The ball's size, px. */
const BALL_PX = 44;

/**
 * Where the key light is: a small ball lit from the light's direction, as the
 * viewer sees it, so its bright side points at the light. A light from behind
 * the model leaves the ball mostly dark, lit at the rim. Shown while the light
 * is dragged, and fades once it is let go.
 */
export function LightBall({ light, className }: { light: KeyLight; className?: string }) {
  const { x, y, z, dragging } = useSyncExternalStore(light.subscribe, light.view);
  // The highlight sits where the light's direction meets the ball's face; a
  // light from behind pushes it out to the rim and dims it.
  const hx = 50 + 38 * x;
  const hy = 50 - 38 * y;
  const glow = Math.round(255 * (0.45 + 0.55 * Math.max(0, z)));
  return (
    <div
      aria-hidden
      className={className}
      style={{
        width: BALL_PX,
        height: BALL_PX,
        borderRadius: '50%',
        pointerEvents: 'none',
        opacity: dragging ? 1 : 0,
        transition: dragging ? 'opacity 0.1s' : 'opacity 0.8s 0.6s',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.5)',
        background: `radial-gradient(circle at ${hx}% ${hy}%, rgb(${glow},${glow},${Math.round(glow * 0.92)}) 0%, #8a8a86 28%, #2a2b2e 70%, #141518 100%)`,
      }}
    />
  );
}
