import * as THREE from 'three';
import type { KeyLight } from './MovableKeyLight';

// In the camera's frame.
const KEY_LIGHT_HOME = new THREE.Vector3(1.5, 2.5, 2);

export interface LightView {
  x: number;
  y: number;
  z: number;
  dragging: boolean;
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
