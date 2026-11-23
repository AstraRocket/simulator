import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

/** OrbitControls' default: a drag the height of the view turns the camera a full circle. */
const TURN_PER_HEIGHT = 2 * Math.PI;

const offset = new THREE.Vector3();
const right = new THREE.Vector3();
const turn = new THREE.Quaternion();

interface Target {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * Left-drag (or one finger) turns the camera about its own up and right axes, with no poles: the rocket tumbles
 * end over end as freely as it spins, as in desktop OpenRocket's 3D view. OrbitControls keeps panning (Shift- or
 * Ctrl-drag, two fingers) and zoom; its own rotation is off, since it holds the camera's up fixed and stops at the
 * poles.
 */
export function TumbleRotate({ controls }: { controls: RefObject<Target | null> }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Set<number>();
    let last: { id: number; x: number; y: number } | null = null;

    const down = (e: PointerEvent) => {
      pointers.add(e.pointerId);
      // A second finger is OrbitControls' pinch and pan; a modifier is its pan.
      if (pointers.size > 1 || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) {
        last = null;
        return;
      }
      last = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // Keeps turning when the drag leaves the canvas, as OrbitControls did.
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const c = controls.current;
      if (!last || e.pointerId !== last.id || !c) return;
      const k = TURN_PER_HEIGHT / (el.clientHeight || 1);
      const dx = (e.clientX - last.x) * k;
      const dy = (e.clientY - last.y) * k;
      last = { id: e.pointerId, x: e.clientX, y: e.clientY };
      offset.subVectors(camera.position, c.target);
      right.crossVectors(camera.up, offset).normalize();
      // Drag right swings the camera left around the rocket, drag down lifts it over: the model follows the hand.
      turn.setFromAxisAngle(camera.up, -dx);
      offset.applyQuaternion(turn);
      turn.setFromAxisAngle(right, -dy);
      offset.applyQuaternion(turn);
      camera.up.applyQuaternion(turn).normalize();
      camera.position.copy(c.target).add(offset);
      camera.lookAt(c.target);
      c.update();
      invalidate();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (last?.id !== e.pointerId) return;
      last = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
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
  }, [gl, camera, controls, invalidate]);

  return null;
}
