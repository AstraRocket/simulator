import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

// In the camera's frame.
const KEY_LIGHT_HOME = new THREE.Vector3(1.5, 2.5, 2);

const TURN_PER_PX = 0.01; // radians

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const turn = new THREE.Quaternion();

// `from` is in view space: +x right, +y up, +z toward the viewer.
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

// Right-button drag: OrbitControls must leave the right button free.
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

interface LightView {
  x: number;
  y: number;
  z: number;
  dragging: boolean;
}

export interface KeyLight {
  dir: RefObject<THREE.Vector3>;
  changed: (dragging: boolean) => void;
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

const BALL_PX = 44;

export function LightBall({ light, className }: { light: KeyLight; className?: string }) {
  const { x, y, z, dragging } = useSyncExternalStore(light.subscribe, light.view);
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
