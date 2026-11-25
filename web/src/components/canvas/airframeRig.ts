import * as THREE from 'three';
import type { Airframe } from '../../services/flight/airframe';
import type { DrawnMotion } from './drawnMotion';
import type { Piece } from './rocketPieces';
import { airframePose, foreEnd, newAirframePose, openingOrder, poseReach, type AirframePose } from './sectionPoses';

/** A cord, from the section behind it to the one in front, by way of what is tied to it. In the rocket's frame. */
export interface Cord {
  out: boolean;
  aft: THREE.Vector3;
  tied: THREE.Vector3;
  fore: THREE.Vector3;
}

/** One copy of an assembly, the copies it is in included. */
export interface CopyPlace {
  path: string;
  matrix: THREE.Matrix4;
}

interface RigCopy extends CopyPlace {
  inverse: THREE.Matrix4;
  /** The copy's own axis from the rocket's. */
  offset: THREE.Vector3;
  shift: THREE.Vector3;
  /** Turns the copy's side to the one it comes down on. */
  roll: number;
  /** Each section's, from where it was built. */
  sections: THREE.Matrix4[];
  cords: Cord[];
}

const SPREAD_SECONDS = 2;
const ROOM = 1.15;
const { smoothstep } = THREE.MathUtils;
const step = new THREE.Matrix4();
const turn = new THREE.Matrix4();
const at = new THREE.Vector3();
const down = new THREE.Vector3();
const end = { x: 0, y: 0 };

/** Which copy of an assembly a piece is in. */
export function copyPath(piece: Piece, assemblyId: string): string | null {
  const { copies = [] } = piece;
  const depth = copies.findIndex((c) => c.id === assemblyId);
  if (depth < 0) return null;
  return copies
    .slice(0, depth + 1)
    .map((c) => `${c.id}#${c.index}`)
    .join('/');
}

export function assemblyCopies(pieces: readonly Piece[], assemblyId: string): CopyPlace[] {
  const out = new Map<string, CopyPlace>();
  for (const p of pieces) {
    const path = copyPath(p, assemblyId);
    const copy = p.copies?.find((c) => c.id === assemblyId);
    if (path != null && copy && !out.has(path)) out.set(path, { path, matrix: copy.matrix });
  }
  return [...out.values()];
}

/** On the rocket's axis. */
export const onAxis = (): CopyPlace[] => [{ path: '', matrix: new THREE.Matrix4() }];

/** Poses every copy of one airframe at a moment of the flight: `update` it, then read. */
export class AirframeRig {
  readonly copies: readonly RigCopy[];
  /** How far it reaches past its own front and back, in meters. */
  above = 0;
  below = 0;
  readonly pose: AirframePose;
  private readonly work: AirframePose;
  private readonly order: readonly number[];
  private readonly opens: number;
  private readonly isPod: boolean;

  /** `canopy` is the radius of the widest thing it comes down under, in meters, as `radius`, its airframe's. */
  constructor(
    readonly frame: Airframe,
    places: readonly CopyPlace[],
    private readonly motion: DrawnMotion,
    private readonly radius: number,
    private readonly canopy: number,
  ) {
    this.pose = newAirframePose(frame);
    this.work = newAirframePose(frame);
    this.order = openingOrder(frame);
    this.opens = Math.min(...frame.joints.map((j) => j.opens));
    this.isPod = frame.carrierId != null;
    this.copies = places.map(({ path, matrix }): RigCopy => {
      const e = matrix.elements;
      return {
        path,
        matrix,
        inverse: matrix.clone().invert(),
        offset: new THREE.Vector3(0, e[13], e[14]),
        shift: new THREE.Vector3(),
        roll: this.isPod ? 0 : motion.side - Math.atan2(e[6], e[5]),
        sections: frame.sections.map(() => new THREE.Matrix4()),
        cords: frame.joints.map(() => ({
          out: false,
          aft: new THREE.Vector3(),
          tied: new THREE.Vector3(),
          fore: new THREE.Vector3(),
        })),
      };
    });
  }

  update(t: number): void {
    const { frame, motion, pose } = this;
    const lie = motion.lie(t);
    airframePose(frame, this.order, t, lie, this.work, pose);
    const reach = poseReach(frame, pose);
    this.above = reach.above;
    this.below = reach.below;
    this.copies.forEach((copy, c) => {
      if (!this.isPod) this.moveCopy(copy, c, t, lie);
      frame.sections.forEach((s, k) => {
        const p = pose.sections[k]!;
        const m = copy.sections[k]!.identity();
        if (p.angle !== 0 || p.y !== 0 || p.x !== s.aft) {
          m.copy(copy.matrix)
            .multiply(turn.makeRotationX(copy.roll))
            // Down on the ground at its own radius.
            .multiply(step.makeTranslation(p.x, p.y, this.isPod ? 0 : (this.radius - s.radius) * lie))
            .multiply(turn.makeRotationZ(p.angle))
            .multiply(step.makeTranslation(-s.aft, 0, 0))
            .multiply(turn.makeRotationX(-copy.roll))
            .multiply(copy.inverse);
        }
        m.premultiply(step.makeTranslation(copy.shift.x, copy.shift.y, copy.shift.z));
      });
      copy.cords.forEach((cord, j) => {
        cord.out = t > frame.joints[j]!.opens;
        foreEnd(frame, pose, j + 1, end);
        this.place(copy, end, cord.aft);
        this.place(copy, pose.joints[j]!, cord.tied);
        this.place(copy, pose.sections[j]!, cord.fore);
      });
    });
  }

  /** Where the part that stays put begins at `t`, if it has come apart. */
  foreAt(t: number): number | undefined {
    const { joints, sections } = this.frame;
    for (let j = joints.length - 1; j >= 0; j--) if (t > joints[j]!.opens) return sections[j + 1]!.fore;
    return undefined;
  }

  /** Where the `nth` device on a joint's cord is tied, in the rocket's frame. */
  tie(copy: number, joint: number, nth: number, out: THREE.Vector3): THREE.Vector3 {
    const cord = this.copies[copy]!.cords[joint]!;
    return out.lerpVectors(cord.tied, cord.aft, Math.min(0.5, nth * 0.15));
  }

  /** The end of a section that is uppermost as it hangs, in the rocket's frame. */
  upperEnd(copy: number, section: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.pose.sections[section]!;
    foreEnd(this.frame, this.pose, section, end);
    return this.place(this.copies[copy]!, Math.cos(s.angle) < 0 ? s : end, out);
  }

  private place(copy: RigCopy, p: { x: number; y: number }, out: THREE.Vector3): THREE.Vector3 {
    out.set(p.x, Math.cos(copy.roll) * p.y, Math.sin(copy.roll) * p.y);
    return out.applyMatrix4(copy.matrix).add(copy.shift);
  }

  // Strap-ons share one recorded path: drawn apart as their canopies open, and side by side on the ground.
  private moveCopy(copy: RigCopy, c: number, t: number, lie: number): void {
    const out = copy.offset.length();
    copy.shift.set(0, 0, 0);
    if (out < 1e-9) return;
    const count = this.copies.length;
    // Placed evenly around, in order.
    const [first, second] = this.copies;
    const apart = first && second ? first.offset.distanceTo(second.offset) : 2 * out;
    const wanted = count > 1 ? Math.max(apart, 2 * ROOM * this.canopy) : apart;
    const spread = 1 + (wanted / apart - 1) * smoothstep(t - this.opens, 0, SPREAD_SECONDS);
    at.copy(copy.offset).multiplyScalar(spread);
    const { side } = this.motion;
    down.set(0, Math.cos(side), Math.sin(side)).multiplyScalar((c - (count - 1) / 2) * wanted);
    copy.shift.lerpVectors(at, down, lie).sub(copy.offset);
  }
}
