import { useCallback, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { ColoredTrack } from './flightScene';
import { indexAtTime, trackPositionAt } from './flightTrack';

type TrailLine = ComponentRef<typeof Line>;

// Rewritten each frame from the last sample passed to where the rocket is.
const HEAD: [number, number, number][] = [
  [0, 0, 0],
  [0, 1, 0],
];

// Hidden through the ref, not `visible`: drei's Line spreads props onto the material, which would never draw.
const hide = (line: TrailLine | null) => {
  if (!line) return;
  line.visible = false;
  line.frustumCulled = false;
};

const AHEAD_OPACITY = 0.22;

/** The path flown so far, from the first sample at `from`, over a faint one of the whole flight. */
export function FlightTrail({
  track,
  from,
  duration,
  progressRef,
}: {
  track: ColoredTrack;
  from: number;
  duration: number;
  progressRef: RefObject<number>;
}) {
  const first = useMemo(
    () =>
      Math.max(
        0,
        track.times.findIndex((t) => t >= from),
      ),
    [track, from],
  );
  const points = useMemo(() => track.scenePts.slice(first), [track, first]);
  const colors = useMemo(() => track.colors.slice(first), [track, first]);
  const flownRef = useRef<TrailLine>(null);
  const headRef = useRef<TrailLine>(null);
  const tip = useMemo(() => new THREE.Vector3(), []);
  // Stable, or React re-runs them (hiding the trail again) on every HUD tick.
  const attachFlown = useCallback((line: TrailLine | null) => {
    flownRef.current = line;
    hide(line);
  }, []);
  const attachHead = useCallback((line: TrailLine | null) => {
    headRef.current = line;
    hide(line);
  }, []);

  useFrame(() => {
    const flown = flownRef.current;
    const head = headRef.current;
    if (!flown || !head) return;
    const t = progressRef.current * duration;
    const i = t >= from ? indexAtTime(track.times, t) - first : -1;
    flown.visible = i >= 1;
    (flown.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(0, Math.min(i, points.length - 1));
    const at = points[i];
    const color = colors[i];
    head.visible = at != null && color != null && i < points.length - 1;
    if (!at || !color || !head.visible) return;
    trackPositionAt(track, t, tip);
    const ends = (head.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data;
    ends.set([at.x, at.y, at.z, tip.x, tip.y, tip.z]);
    ends.needsUpdate = true;
    (head.material as unknown as THREE.LineBasicMaterial).color.setRGB(...color);
  });

  if (points.length < 2) return null;
  return (
    <>
      <Line
        points={points}
        vertexColors={colors}
        lineWidth={2}
        transparent
        opacity={AHEAD_OPACITY}
        depthWrite={false}
      />
      <Line ref={attachFlown} points={points} vertexColors={colors} lineWidth={3} />
      <Line ref={attachHead} points={HEAD} lineWidth={3} />
    </>
  );
}
