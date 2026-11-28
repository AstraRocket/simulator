import { useCallback, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { ColoredTrack } from './flightScene';
import type { FlightBody } from '../../services/flight/flightBodies';
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

// Scene units, in which the apogee stands 24 high.
const DASH = { dashed: true, dashSize: 0.35, gapSize: 0.25 } as const;

/** Each branch's path from where it parts from the stack; dashed past the engine's last sample, as estimated. */
export function FlightTrails({
  tracks,
  bodies,
  duration,
  progressRef,
}: {
  tracks: readonly ColoredTrack[];
  bodies: readonly FlightBody[];
  duration: number;
  progressRef: RefObject<number>;
}) {
  const clock = { duration, progressRef };
  return tracks.map((track, i) => (
    <group key={i}>
      <FlightTrail
        track={track}
        from={i === 0 ? -Infinity : (bodies[i]?.separatedAt ?? -Infinity)}
        to={track.estimatedFromT}
        {...clock}
      />
      {Number.isFinite(track.estimatedFromT) && (
        <FlightTrail track={track} from={track.estimatedFromT} dashed {...clock} />
      )}
    </group>
  ));
}

/** The path flown so far, from the first sample at `from`, over a faint one of the whole flight. */
export function FlightTrail({
  track,
  from,
  to = Infinity,
  dashed = false,
  duration,
  progressRef,
}: {
  track: ColoredTrack;
  from: number;
  /** The last sample drawn is the last at or before it. */
  to?: number;
  /** For a stretch that is estimated, not flown by the engine. */
  dashed?: boolean;
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
  const end = useMemo(() => {
    let i = track.times.length;
    while (i > 0 && track.times[i - 1]! > to) i--;
    return i;
  }, [track, to]);
  const points = useMemo(() => track.scenePts.slice(first, end), [track, first, end]);
  const colors = useMemo(() => track.colors.slice(first, end), [track, first, end]);
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
  const dash = dashed ? DASH : {};
  return (
    <>
      <Line
        points={points}
        vertexColors={colors}
        lineWidth={2}
        transparent
        opacity={AHEAD_OPACITY}
        depthWrite={false}
        {...dash}
      />
      <Line ref={attachFlown} points={points} vertexColors={colors} lineWidth={3} {...dash} />
      <Line ref={attachHead} points={HEAD} lineWidth={3} />
    </>
  );
}
