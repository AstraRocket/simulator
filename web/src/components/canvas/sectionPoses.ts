import * as THREE from 'three';
import type { Airframe } from '../../services/flight/airframe';

// Where an airframe's sections hang once it comes apart. The kernel flies it whole, so this is drawn, not simulated.
// In the plane of the hang: x aft along the axis, y to the side a loose section swings to, in meters.

export interface SectionPose {
  /** The middle of its aft end. */
  x: number;
  y: number;
  /** From nose forward, about the plane's normal. */
  angle: number;
}

export interface JointPose {
  /** Where the cord's devices are tied. */
  x: number;
  y: number;
  /** 0 holding everything up, 1 on a cord with something above it. */
  aside: number;
}

export interface AirframePose {
  sections: SectionPose[];
  joints: JointPose[];
}

const RUN_SECONDS = 0.5;
const SWAP_SECONDS = 1.4;
const TETHER = 0.12; // of the cord
const TURN = [0.12, 1.1] as const;
const CLEAR_RADII = 2.2;
const LANDED_YAW = 0.45;

const { smoothstep, lerp } = THREE.MathUtils;

export function newAirframePose(frame: Airframe): AirframePose {
  return {
    sections: frame.sections.map((s) => ({ x: s.aft, y: 0, angle: 0 })),
    joints: frame.joints.map((_, i) => ({ x: frame.sections[i]!.aft, y: 0, aside: 0 })),
  };
}

/** Joints in the order they open. */
export const openingOrder = (frame: Airframe): number[] =>
  frame.joints.map((_, i) => i).sort((a, b) => frame.joints[a]!.opens - frame.joints[b]!.opens);

const lengthOf = (frame: Airframe, k: number): number => frame.sections[k]!.aft - frame.sections[k]!.fore;

/** The middle of a posed section's fore end. */
export function foreEnd(frame: Airframe, pose: AirframePose, k: number, out: { x: number; y: number }): void {
  const s = pose.sections[k]!;
  const length = lengthOf(frame, k);
  out.x = s.x - length * Math.cos(s.angle);
  out.y = s.y - length * Math.sin(s.angle);
}

const end = { x: 0, y: 0 };

const runOut = (frame: Airframe, j: number, t: number): number =>
  frame.joints[j]!.cord * smoothstep(t - frame.joints[j]!.opens, 0, RUN_SECONDS);

/**
 * How it hangs with the first `count` joints open and the last of them holding it up: what is behind that joint nose
 * up, one under another, and what is in front turned over beside the cord.
 */
function hang(frame: Airframe, order: readonly number[], count: number, t: number, out: AirframePose): void {
  const { sections, joints } = frame;
  const open = new Set(order.slice(0, count));
  const top = order[count - 1]!;
  const last = sections.length - 1;
  Object.assign(out.sections[last]!, { x: sections[last]!.aft, y: 0, angle: 0 });
  for (let k = last - 1; k > top; k--) {
    foreEnd(frame, out, k + 1, end);
    const cord = open.has(k) ? runOut(frame, k, t) : 0;
    Object.assign(out.sections[k]!, { x: end.x - cord, y: 0, angle: 0 });
    Object.assign(out.joints[k]!, { x: end.x - cord / 2, y: 0, aside: 1 });
  }
  foreEnd(frame, out, top + 1, end);
  const { opens, cord } = joints[top]!;
  const tied = end.x - runOut(frame, top, t);
  Object.assign(out.joints[top]!, { x: tied, y: 0, aside: 0 });

  const age = Math.max(0, t - opens);
  const over = count === 1 ? smoothstep(age, TURN[0], TURN[1]) : 1;
  const swing = over * (0.5 * Math.exp(-0.6 * age) * Math.sin(4.5 * age) + 0.06 * Math.sin(1.7 * age));
  const tether = Math.min(TETHER * cord, lengthOf(frame, top)) * over;
  const clear = CLEAR_RADII * Math.max(sections[top]!.radius, sections[top + 1]!.radius) * over;
  Object.assign(out.sections[top]!, {
    x: tied + tether * Math.cos(swing),
    y: clear + tether * Math.sin(swing),
    angle: Math.PI * over + swing,
  });
  for (let k = top - 1; k >= 0; k--) {
    foreEnd(frame, out, k + 1, end);
    const drop = open.has(k) ? runOut(frame, k, t) : 0;
    const angle = out.sections[k + 1]!.angle;
    // On down from the one above, which is upside down.
    Object.assign(out.sections[k]!, { x: end.x - drop * Math.cos(angle), y: end.y - drop * Math.sin(angle), angle });
    Object.assign(out.joints[k]!, {
      x: end.x - (drop / 2) * Math.cos(angle),
      y: end.y - (drop / 2) * Math.sin(angle),
      aside: 1,
    });
  }
}

/** `lie` is how far it is down on the ground, 0 to 1; `work` is scratch. Whole before the first joint opens, and a function of flight time alone. */
export function airframePose(
  frame: Airframe,
  order: readonly number[],
  t: number,
  lie: number,
  work: AirframePose,
  out: AirframePose,
): AirframePose {
  const { sections, joints } = frame;
  sections.forEach((s, k) => Object.assign(out.sections[k]!, { x: s.aft, y: 0, angle: 0 }));
  joints.forEach((_, j) => Object.assign(out.joints[j]!, { x: sections[j]!.aft, y: 0, aside: 0 }));
  const opened = order.filter((j) => t > joints[j]!.opens).length;
  for (let count = 1; count <= opened; count++) {
    hang(frame, order, count, t, work);
    const w = count === 1 ? 1 : smoothstep(t - joints[order[count - 1]!]!.opens, 0, SWAP_SECONDS);
    out.sections.forEach((s, k) => {
      const to = work.sections[k]!;
      s.x = lerp(s.x, to.x, w);
      s.y = lerp(s.y, to.y, w);
      s.angle = lerp(s.angle, to.angle, w);
    });
    out.joints.forEach((s, j) => {
      const to = work.joints[j]!;
      s.x = lerp(s.x, to.x, w);
      s.y = lerp(s.y, to.y, w);
      s.aside = lerp(s.aside, to.aside, w);
    });
  }
  for (let k = sections.length - 2; k >= 0; k--) {
    if (t > joints[k]!.opens) {
      // Flat on the ground, each its own way.
      out.sections[k]!.angle += lie * LANDED_YAW * ((((k + 1) * 1.236068) % 2) - 1);
      continue;
    }
    // Still joined, however the two were moved.
    foreEnd(frame, out, k + 1, end);
    Object.assign(out.sections[k]!, { x: end.x, y: end.y, angle: out.sections[k + 1]!.angle });
  }
  return out;
}

/** How far ahead of its front, and behind its back, it reaches as posed, in meters. */
export function poseReach(frame: Airframe, pose: AirframePose): { above: number; below: number } {
  let least = frame.sections[0]!.fore;
  let most = frame.sections[frame.sections.length - 1]!.aft;
  const [front, back] = [least, most];
  pose.sections.forEach((s, k) => {
    foreEnd(frame, pose, k, end);
    least = Math.min(least, s.x, end.x);
    most = Math.max(most, s.x, end.x);
  });
  for (const j of pose.joints) least = Math.min(least, j.x);
  return { above: front - least, below: most - back };
}
