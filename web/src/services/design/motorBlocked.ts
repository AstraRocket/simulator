import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import type { FlightConfig } from '../flight/flightConfigs';
import { axialFrames } from '../../tree/axialRebase';
import { clusterPlacesOf } from '../../tree/cluster';
import { num } from '../../tree/nodeProps';
import { motorSeatStart } from '../../tree/position';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import { hasShoulder, shouldersOf, stationRadius, type Shoulder } from '../../tree/shapeProfile';
import { COMPONENT_DEFAULTS } from './componentDefaults';
import { plateOuter, statedOrRingBore, tubeRadii } from './discGeometry';
import { findMounts } from './treeEdit';
import { collectNodes } from '../../tree/treeWalk';

// A touch, not a blockage: a motor seated flush against an engine block is the block doing its job, and catalog
// lengths and file positions round to a fraction of a millimeter.
const TOUCH_M = 1e-3;
// Across the motor, far finer: an engine block's lip is a millimeter or two, and must still stop an 18 mm motor.
const RADIAL_TOUCH_M = 1e-4;

export interface BlockedMotor {
  /** The mount. */
  node: ComponentNode;
  designation: string;
  /** What the motor runs into. */
  blocker: ComponentNode;
  /** How far into it the motor's forward end reaches, meters: how much too long it is to load. */
  overlapM: number;
}

interface Center {
  y: number;
  z: number;
}

/** A solid in the airframe a motor cannot pass: an annulus from `innerR` to `outerR`, over `[start, end]`. */
interface Obstacle {
  node: ComponentNode;
  start: number;
  end: number;
  innerR: number;
  outerR: number;
  centers: Center[];
  /** Inside a mount: centered on each motor there. */
  inMount: string | null;
  /** Checked only ahead of the mount's front: where the mount runs, it already passes it, the motor inside. */
  aheadOnly?: boolean;
  parent: string | null;
  /** The pod or side booster it rides in, whose own axis its radial place is measured from; null for the main airframe. */
  pod: string | null;
}

const at = (radialPosition: number, radialDirection: number): Center => ({
  y: radialPosition * Math.cos(radialDirection),
  z: radialPosition * Math.sin(radialDirection),
});

const ownCenter = (n: ComponentNode): Center[] => [at(num(n, 'radialPosition', 0), num(n, 'radialDirection', 0))];

const tubeCenters = (n: ComponentNode): Center[] =>
  n.type === 'innertube' ? clusterPlacesOf(n).map((p) => at(p.radialPosition, p.radialDirection)) : [{ y: 0, z: 0 }];

/** Parts a motor cannot pass. Recovery gear, wadding and mass objects pack around a motor, so are not among them. */
function obstacle(
  n: ComponentNode,
  parent: ComponentNode | null,
  frame: { start: number; length: number },
  parentStart: number,
): Omit<Obstacle, 'inMount' | 'parent' | 'pod' | 'aheadOnly'> | null {
  const span = { start: frame.start, end: frame.start + frame.length };
  const enclosing = parent ? tubeRadii(parent) : null;
  switch (n.type) {
    case 'bulkhead':
      return { node: n, ...span, innerR: 0, outerR: plateOuter(n, enclosing), centers: ownCenter(n) };
    case 'engineblock': {
      const outerR = plateOuter(n, enclosing);
      const wall = num(n, 'thickness', KERNEL_DEFAULTS.engineblock.thickness);
      return { node: n, ...span, innerR: Math.max(0, outerR - wall), outerR, centers: ownCenter(n) };
    }
    case 'centeringring': {
      const outerR = plateOuter(n, enclosing);
      return {
        node: n,
        ...span,
        innerR: statedOrRingBore(n, parent, outerR, parentStart),
        outerR,
        centers: ownCenter(n),
      };
    }
    case 'tubecoupler':
    case 'innertube': {
      const r = tubeRadii(n);
      return r ? { node: n, ...span, innerR: r.innerR, outerR: r.outerR, centers: tubeCenters(n) } : null;
    }
    default:
      return null;
  }
}

const isPod = (n: ComponentNode) => n.type === 'podset' || n.type === 'parallelstage';

/** A transition's or nose cone's shoulders: each a short tube into the next part, and a capped one a bulkhead at its end. */
function shoulderObstacles(n: ComponentNode, frame: { start: number; length: number }) {
  const out: Omit<Obstacle, 'inMount' | 'parent' | 'pod'>[] = [];
  const { fore, aft } = shouldersOf(n);
  const end = frame.start + frame.length;
  const add = (s: Shoulder, start: number, stop: number, capAtStart: boolean) => {
    if (!hasShoulder(s)) return;
    const centers = [{ y: 0, z: 0 }];
    const wall = Math.min(s.thickness, s.radius);
    out.push({ node: n, start, end: stop, innerR: s.radius - wall, outerR: s.radius, centers, aheadOnly: true });
    if (s.capped && wall > 0) {
      const [a, b] = capAtStart ? [start, start + wall] : [stop - wall, stop];
      out.push({ node: n, start: a, end: b, innerR: 0, outerR: s.radius, centers, aheadOnly: true });
    }
  };
  add(fore, frame.start - fore.length, frame.start, true);
  add(aft, end, end + aft.length, false);
  return out;
}

/** A transition or nose cone's shell, which narrows: its inner radius at a rocket station. */
interface Shell {
  node: ComponentNode;
  start: number;
  end: number;
  pod: string | null;
  innerAt: (x: number) => number;
}

function shellOf(n: ComponentNode, frame: { start: number; length: number }, pod: string | null): Shell | null {
  if (n.type !== 'nosecone' && n.type !== 'transition') return null;
  const solid = n['filled'] === true;
  const wall = num(n, 'thickness', COMPONENT_DEFAULTS[n.type].thickness);
  return {
    node: n,
    start: frame.start,
    end: frame.start + frame.length,
    pod,
    innerAt: (x) => (solid ? 0 : Math.max(0, stationRadius(n, x - frame.start) - wall)),
  };
}

// Stations a shell is read at across the stretch a motor would pass: a hundredth of it, finer than any taper.
const SHELL_STEPS = 100;

/** How far a motor's front reaches past the aft-most station of the shell too narrow for it; null when none is. */
function shellOverlap(shell: Shell, from: number, to: number, need: number): number | null {
  const lo = Math.max(from, shell.start);
  const hi = Math.min(to, shell.end);
  if (hi <= lo + TOUCH_M) return null;
  for (let i = SHELL_STEPS; i >= 0; i--) {
    const x = lo + ((hi - lo) * i) / SHELL_STEPS;
    if (shell.innerAt(x) < need - RADIAL_TOUCH_M) return x - from;
  }
  return null;
}
function obstacles(
  tree: RocketTree,
  frames: ReturnType<typeof axialFrames>,
  mountIds: Set<string>,
  pods: Map<string, string | null>,
): Obstacle[] {
  const out: Obstacle[] = [];
  const visit = (n: ComponentNode, parent: ComponentNode | null) => {
    const frame = n.id ? frames.get(n.id) : undefined;
    const parentStart = (parent?.id ? frames.get(parent.id)?.start : undefined) ?? 0;
    const o = frame ? obstacle(n, parent, frame, parentStart) : null;
    if (o) {
      out.push({
        ...o,
        inMount: parent?.id && mountIds.has(parent.id) ? parent.id : null,
        parent: parent?.id ?? null,
        pod: n.id ? (pods.get(n.id) ?? null) : null,
      });
    }
    if (frame && (n.type === 'nosecone' || n.type === 'transition')) {
      for (const s of shoulderObstacles(n, frame)) {
        out.push({ ...s, inMount: null, parent: parent?.id ?? null, pod: n.id ? (pods.get(n.id) ?? null) : null });
      }
    }
    for (const c of n.children ?? []) visit(c, n);
  };
  for (const n of tree.components) visit(n, null);
  return out;
}

/** Each part's parent, by id. */
function parentsOf(tree: RocketTree): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const visit = (n: ComponentNode, parent: string | null) => {
    if (n.id) out.set(n.id, parent);
    for (const c of n.children ?? []) visit(c, n.id ?? null);
  };
  for (const n of tree.components) visit(n, null);
  return out;
}

/** Each part's pod or side booster, by id: the nearest one it sits in, or null in the main airframe. */
function podsOf(tree: RocketTree): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const visit = (n: ComponentNode, pod: string | null) => {
    const own = isPod(n) && n.id ? n.id : pod;
    if (n.id) out.set(n.id, own);
    for (const c of n.children ?? []) visit(c, own);
  };
  for (const n of tree.components) visit(n, null);
  return out;
}

/** Whether a motor of radius `r` centered at `m` crosses the annulus around `c`. */
function crosses(m: Center, r: number, c: Center, o: Obstacle): boolean {
  const d = Math.hypot(m.y - c.y, m.z - c.z);
  return d - r < o.outerR - RADIAL_TOUCH_M && d + r > o.innerR + RADIAL_TOUCH_M;
}

/** A mount as the check reads it: where it runs, the motor seats it holds, and the frame it sits in. */
interface Seat {
  mount: ComponentNode;
  start: number;
  end: number;
  seats: Center[];
  pod: string | null;
  parent: string | null;
}

/** A motor's stretch, its fore end to its aft, and its radius. */
interface Stretch {
  fore: number;
  aft: number;
  r: number;
}

type Worst = { blocker: ComponentNode; overlapM: number } | null;

const deeper = (worst: Worst, blocker: ComponentNode, overlapM: number): Worst =>
  !worst || overlapM > worst.overlapM ? { blocker, overlapM } : worst;

/** How far the motor's front reaches into `o`; null when `o` is not in its way. */
function obstacleOverlap(o: Obstacle, s: Seat, m: Stretch): number | null {
  if (o.node === s.mount || o.end <= m.fore + TOUCH_M || o.start >= m.aft - TOUCH_M) return null;
  // Inside another mount, or off in another pod's frame: not in this motor's way.
  if ((o.inMount && o.inMount !== s.mount.id) || o.pod !== s.pod) return null;
  // A ring this mount passes through has a hole for it, wherever the cluster puts it.
  if (o.node.type === 'centeringring' && o.parent === s.parent && o.start < s.end && o.end > s.start) return null;
  const axis = { y: 0, z: 0 };
  const hit =
    o.inMount === s.mount.id
      ? crosses(axis, m.r, axis, o)
      : s.seats.some((at) => o.centers.some((c) => crosses(at, m.r, c, o)));
  if (!hit) return null;
  const reach = o.aheadOnly ? Math.min(o.end, s.start) : o.end;
  return reach > m.fore + TOUCH_M ? reach - m.fore : null;
}

function worstFor(s: Seat, m: Stretch, all: readonly Obstacle[], shells: readonly Shell[]): Worst {
  let worst: Worst = null;
  for (const o of all) {
    const overlapM = obstacleOverlap(o, s, m);
    if (overlapM !== null) worst = deeper(worst, o.node, overlapM);
  }
  // A shell narrowing ahead, read only ahead of the mount: inside it, the mount is the passage.
  for (const shell of shells) {
    if (shell.pod !== s.pod) continue;
    for (const at of s.seats) {
      const overlapM = shellOverlap(shell, m.fore, Math.min(m.aft, s.start), Math.hypot(at.y, at.z) + m.r);
      if (overlapM !== null && overlapM > TOUCH_M) worst = deeper(worst, shell.node, overlapM);
    }
  }
  return worst;
}

/**
 * Motors loaded in any configuration that run into something solid ahead of their seat (a bulkhead, an engine
 * block, a ring, coupler or tube narrower than they are, a transition or nose cone narrowing ahead, or its
 * shoulder), so could not be slid home in the real rocket. A motor merely longer than its mount, with open airframe
 * ahead, is fine. The engine flies them anyway, so this is a build check, not a flight one. Each mount and motor is
 * listed once, against what it reaches deepest into.
 */
export function blockedMotors(tree: RocketTree, configs: readonly FlightConfig[]): BlockedMotor[] {
  const mounts = findMounts(tree);
  if (!mounts.length) return [];
  const frames = axialFrames(tree);
  const pods = podsOf(tree);
  const parents = parentsOf(tree);
  const all = obstacles(tree, frames, new Set(mounts.map((m) => m.id as string)), pods);
  const shells = collectNodes(tree.components, (n) => !!n.id).flatMap((n) => {
    const frame = frames.get(n.id as string);
    const shell = frame ? shellOf(n, frame, pods.get(n.id as string) ?? null) : null;
    return shell ? [shell] : [];
  });
  const out: BlockedMotor[] = [];
  for (const mount of mounts) {
    const id = mount.id as string;
    const frame = frames.get(id);
    if (!frame) continue;
    const seat: Seat = {
      mount,
      start: frame.start,
      end: frame.start + frame.length,
      seats: tubeCenters(mount),
      pod: pods.get(id) ?? null,
      parent: parents.get(id) ?? null,
    };
    const seen = new Set<string>();
    for (const config of configs) {
      const spec = config.motors[id]?.spec;
      if (!spec?.designation || !(spec.length > 0) || !(spec.diameter > 0) || seen.has(spec.designation)) continue;
      seen.add(spec.designation);
      const fore = motorSeatStart(mount, frame.start, frame.length, spec.length);
      const worst = worstFor(seat, { fore, aft: fore + spec.length, r: spec.diameter / 2 }, all, shells);
      if (worst) out.push({ node: mount, designation: spec.designation, ...worst });
    }
  }
  return out;
}
