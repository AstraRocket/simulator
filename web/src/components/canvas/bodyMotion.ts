import * as THREE from 'three';
import { carrierAt, type FlightBody } from '../../services/flight/flightBodies';
import { newTrackPose, trackPoseAt, type FlightTrack, type TrackPose } from './flightTrack';
import { piecesBounds, type Piece } from './rocketPieces';

/** Along the rocket's axis, in meters aft of the nose tip. */
export interface Extent {
  fore: number;
  aft: number;
}

/** What a carrier holds from `from` until its next span. */
export interface BodySpan extends Extent {
  from: number;
  /**
   * Meters from the recorded point to this span's center. Frozen at each separation, so nothing jumps when a
   * carrier loses a stage and turns about a new center.
   */
  offset: THREE.Vector3;
}

const NOTHING: Extent = { fore: Infinity, aft: -Infinity };

export function bodyPieces(bodies: readonly FlightBody[], pieces: readonly Piece[]): Piece[][] {
  const out: Piece[][] = bodies.map(() => []);
  for (const p of pieces) {
    const { id } = p;
    const owner = id == null ? 0 : bodies.findIndex((b) => b.partIds.has(id));
    out[Math.max(0, owner)]!.push(p);
  }
  return out;
}

export function pieceExtent(pieces: Piece[]): Extent {
  const box = piecesBounds(pieces);
  return box.isEmpty() ? NOTHING : { fore: box.min.x, aft: box.max.x };
}

/** The rocket-axis station a carrier turns about. */
export const extentCenter = (e: Extent): number => (e.fore + e.aft) / 2;

export const extentLength = (e: Extent): number => e.aft - e.fore;

function heldBy(bodies: readonly FlightBody[], extents: readonly Extent[], carrier: number, t: number): Extent {
  let held = NOTHING;
  bodies.forEach((_, i) => {
    if (carrierAt(bodies, i, t) !== carrier) return;
    const e = extents[i] ?? NOTHING;
    held = { fore: Math.min(held.fore, e.fore), aft: Math.max(held.aft, e.aft) };
  });
  return held.fore <= held.aft ? held : { fore: 0, aft: 0 };
}

/** Each body's spans as a carrier, in time order; none for a body that never carries itself. */
export function bodySpans(
  bodies: readonly FlightBody[],
  tracks: readonly FlightTrack[],
  extents: readonly Extent[],
): BodySpan[][] {
  const spans: BodySpan[][] = bodies.map(() => []);
  spans[0]?.push({ from: -Infinity, offset: new THREE.Vector3(), ...heldBy(bodies, extents, 0, -Infinity) });
  const separations = [...new Set(bodies.map((b) => b.separatedAt))].filter(Number.isFinite).sort((a, b) => a - b);
  const pose = newTrackPose();
  separations.forEach((t, k) => {
    const before = separations[k - 1] ?? -Infinity;
    // Added after the loop: each is measured from its old carrier's span, not one opened at this same moment.
    const opened: [number, BodySpan][] = [];
    bodies.forEach((_, i) => {
      if (carrierAt(bodies, i, t) !== i) return;
      const from = carrierAt(bodies, i, before);
      const track = tracks[from];
      const last = spans[from]?.at(-1);
      if (!track || !last) return;
      const held = heldBy(bodies, extents, i, t);
      const shift = extentCenter(held) - extentCenter(last);
      if (from === i && shift === 0) return;
      const offset = new THREE.Vector3(shift, 0, 0).applyQuaternion(trackPoseAt(track, t, pose).quaternion);
      opened.push([i, { from: t, offset: offset.add(last.offset), ...held }]);
    });
    for (const [i, span] of opened) spans[i]!.push(span);
  });
  return spans;
}

export interface Placement extends TrackPose {
  span: BodySpan;
}

const ON_THE_PAD: BodySpan = { from: -Infinity, fore: 0, aft: 0, offset: new THREE.Vector3() };

export const newPlacement = (): Placement => ({ ...newTrackPose(), span: ON_THE_PAD });

function spanAt(spans: readonly BodySpan[], t: number): BodySpan {
  let at = spans[0] ?? ON_THE_PAD;
  for (const s of spans) if (t >= s.from) at = s;
  return at;
}

/** Where a carrier is and what it holds. `modelScale` is scene units per meter of rocket. */
export function placeCarrier(
  track: FlightTrack,
  spans: readonly BodySpan[],
  t: number,
  modelScale: number,
  out: Placement,
): Placement {
  trackPoseAt(track, t, out);
  out.span = spanAt(spans, t);
  out.position.addScaledVector(out.span.offset, modelScale);
  const reach = (extentLength(out.span) / 2) * modelScale;
  out.position.y = Math.max(out.position.y, reach * Math.abs(out.dir.y));
  return out;
}

/** The fore end of what a placed carrier holds. */
export function placedNose(p: Placement, modelScale: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(p.position).addScaledVector(p.dir, (extentLength(p.span) / 2) * modelScale);
}
