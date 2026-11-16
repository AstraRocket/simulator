import { useRef, useState, type RefObject } from 'react';
import type { R3fHandles } from './useRocketExport';
import type { keyLight } from './keyLight';

/** The opening camera too, so Reset lands where the view first opened. */
export const sideCameraPos = (center: number, camDist: number): [number, number, number] => [center, 0, camDist * 1.05];

export function useCameraViews({
  r3f,
  lamp,
  totalLen,
  center,
  camDist,
}: {
  r3f: RefObject<R3fHandles | null>;
  lamp: ReturnType<typeof keyLight>;
  totalLen: number;
  center: number;
  camDist: number;
}) {
  const controls = useRef<import('three-stdlib').OrbitControls | null>(null);
  const [preset, setPreset] = useState<'side' | 'aft'>('side');
  const sidePos = sideCameraPos(center, camDist);
  const aftPos: [number, number, number] = [totalLen + camDist * 0.9, 0, 0];
  const moveCam = (pos: [number, number, number]) => {
    const st = r3f.current;
    const c = controls.current;
    if (!st || !c) return;
    st.camera.position.set(pos[0], pos[1], pos[2]);
    c.target.set(center, 0, 0);
    c.update();
  };
  const showView = (which: 'side' | 'aft') => {
    setPreset(which);
    moveCam(which === 'side' ? sidePos : aftPos);
  };
  const resetView = () => {
    lamp.reset();
    moveCam(preset === 'side' ? sidePos : aftPos);
  };
  return { controls, preset, showView, resetView };
}
