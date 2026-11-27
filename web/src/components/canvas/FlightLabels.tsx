import type { RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { EventPill } from './flightScene';

// Pixels between a label and its point, out to the side of the path, away from the flight's middle.
const GAP_PX = 24;

/**
 * The event labels, as plain page elements over the canvas; `FlightLabelProjector` moves them each frame.
 * Not drei's Html: each of those is its own React root, which StrictMode's remount can leave empty for good.
 */
export function FlightLabels({
  pills,
  nowT,
  labelRefs,
}: {
  pills: readonly EventPill[];
  nowT: number;
  labelRefs: RefObject<(HTMLDivElement | null)[]>;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pills.map((pill, i) => {
        const reached = pill.parts.filter((part) => nowT >= part.time).map((part) => part.text);
        return (
          <div
            key={pill.key}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
            className="absolute left-0 top-0"
            // Placed by the projector; hidden until its first frame does.
            style={{ display: reached.length ? undefined : 'none', visibility: 'hidden' }}
          >
            <div
              data-flight-callout
              className="absolute left-0 top-0 whitespace-nowrap rounded bg-surface/85 px-1.5 py-0.5 text-[10px] font-medium text-warn-300 ring-1 ring-line/10"
            >
              {reached.join(' · ')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const at = new THREE.Vector3();
const ahead = new THREE.Vector3();
const mid = new THREE.Vector3();

/** -100, -50 or 0 percent: which edge of the label meets the anchor along one screen axis. */
const edge = (n: number) => (n > 0.35 ? 0 : n < -0.35 ? -100 : -50);

/** Inside the canvas: puts each label beside its point on screen, out from the path, and hides one behind the camera. */
export function FlightLabelProjector({
  pills,
  middle,
  labelRefs,
}: {
  pills: readonly EventPill[];
  /** `flightMiddle`'s: labels lean away from it. */
  middle: THREE.Vector3;
  labelRefs: RefObject<(HTMLDivElement | null)[]>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const px = (v: THREE.Vector3): [number, number] => [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
    const [mx, my] = px(mid.copy(middle).project(camera));
    pills.forEach((pill, i) => {
      const el = labelRefs.current[i];
      const tag = el?.firstElementChild as HTMLElement | null | undefined;
      if (!el || !tag) return;
      at.copy(pill.pos).project(camera);
      // Past the far plane or behind the eye, the projection mirrors onto the screen.
      if (at.z > 1 || at.z < -1) {
        el.style.visibility = 'hidden';
        return;
      }
      const [x, y] = px(at);
      // The path's way across the screen here, from a point a little along it.
      const [ax, ay] = px(ahead.copy(pill.pos).addScaledVector(pill.along, 0.5).project(camera));
      let tx = ax - x;
      let ty = ay - y;
      const len = Math.hypot(tx, ty);
      if (len < 1e-3) [tx, ty] = [0, 1];
      else [tx, ty] = [tx / len, ty / len];
      // Square to the path, on the side away from the flight's middle.
      let nx = -ty;
      let ny = tx;
      if (nx * (x - mx) + ny * (y - my) < 0) [nx, ny] = [-nx, -ny];
      el.style.transform = `translate3d(${x + nx * GAP_PX}px, ${y + ny * GAP_PX}px, 0)`;
      tag.style.transform = `translate(${edge(nx)}%, ${edge(ny)}%)`;
      el.style.visibility = 'visible';
    });
  });
  return null;
}

/** Circles the tracked body while it is too small to see; FlightStep shows it, `FlightRingProjector` places it. */
export function TargetRingMark({
  placeRef,
  ringRef,
}: {
  placeRef: RefObject<HTMLDivElement | null>;
  ringRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div ref={placeRef} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
        <div
          ref={ringRef}
          data-flight-ring
          className="h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-warn-300"
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

const ringAt = new THREE.Vector3();

/** Inside the canvas, after FlightStep: puts the ring where FlightStep moved its group. */
export function FlightRingProjector({
  groupRef,
  placeRef,
}: {
  groupRef: RefObject<THREE.Group | null>;
  placeRef: RefObject<HTMLDivElement | null>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const group = groupRef.current;
    const el = placeRef.current;
    if (!group || !el) return;
    group.getWorldPosition(ringAt).project(camera);
    if (ringAt.z > 1 || ringAt.z < -1) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.transform = `translate3d(${((ringAt.x + 1) / 2) * size.width}px, ${((1 - ringAt.y) / 2) * size.height}px, 0)`;
    el.style.visibility = 'visible';
  });
  return null;
}
