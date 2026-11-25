import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { isAssembly } from '../../tree/assembly.js';
import { axialFrames, type AxialFrame } from '../../tree/axialRebase';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import { bodyTubeRadius, noseConeAftRadius, num } from '../../tree/nodeProps';
import { hasShoulder, profileEnds, shouldersOf } from '../../tree/shapeProfile';
import { lineageOf, walkNodes } from '../../tree/treeWalk';
import { BLOCKING, namesShearPins } from './ejectionBay';
import type { FlightBody } from './flightBodies';
import type { Deployment } from './flightSources';
import { opensAt, type OpensAt } from './opensAt';

/** A run of airframe parts that stays in one piece. Meters aft of the rocket's nose tip. */
export interface Section {
  fore: number;
  aft: number;
  radius: number;
  /** Its parts and everything in or on them. */
  partIds: ReadonlySet<string>;
}

/** Where two sections come apart, held together by a cord from then on. */
export interface Joint {
  opens: number;
  cord: number;
  /** Tied along the cord, in deployment order. */
  deviceIds: readonly string[];
}

/** A nose-to-tail chain of parts: a body's own, or a pod's on it. */
export interface Airframe {
  body: number;
  /** The pod set or strap-on it is the chain of, one for each copy; null on the rocket's axis. */
  assemblyId: string | null;
  /** The part a pod sits on; null for a body's own chain. */
  carrierId: string | null;
  /** Front to back. The last is the one that stays put. */
  sections: readonly Section[];
  /** In step with the gaps between sections. */
  joints: readonly Joint[];
}

interface Part extends AxialFrame {
  node: ComponentNode;
}

interface Chain {
  body: number;
  stages: ComponentNode[];
  assemblyId: string | null;
  carrierId: string | null;
  parts: Part[];
}

// ShockCord.AUTO_CORD_LENGTH_RATIO
const AUTO_CORD_RATIO = 3;
const SLACK_M = 0.0005;

const isAirframe = (n: ComponentNode): boolean =>
  n.type === 'nosecone' || n.type === 'bodytube' || n.type === 'transition';

const endOf = (f: AxialFrame): number => f.start + f.length;
const middleOf = (f: AxialFrame): number => f.start + f.length / 2;

/** Every chain that comes apart, and every strap-on's, whose copies come down apart. */
export function airframes(tree: RocketTree, bodies: readonly FlightBody[], devices: readonly Deployment[]): Airframe[] {
  const frames = axialFrames(tree);
  const chains = chainsOf(tree, bodies, frames);
  let rocketLength = 0;
  for (const f of frames.values()) rocketLength = Math.max(rocketLength, endOf(f));

  return chains.flatMap((chain): Airframe[] => {
    const opened = new Map<number, Deployment[]>();
    for (const d of devices) {
      const at = d.body === chain.body ? openedBy(tree, chain, d.device, frames) : null;
      if (at != null) opened.set(at, [...(opened.get(at) ?? []), d]);
    }
    const strapOn = chain.assemblyId != null && chain.carrierId == null;
    if (!opened.size && !strapOn) return [];
    const cuts = [...opened.keys()].sort((a, b) => a - b);
    const separatedAt = bodies[chain.body]!.separatedAt;
    const released = Number.isFinite(separatedAt) ? separatedAt : -Infinity;
    const joints = cuts.map((at): Joint => {
      const out = opened.get(at) ?? [];
      return {
        opens: Math.max(released, Math.min(...out.map((d) => d.from))),
        cord: cordAt(chain, at, out, rocketLength),
        deviceIds: out.flatMap((d) => d.device.id ?? []),
      };
    });
    const starts = [0, ...cuts.map((at) => at + 1)];
    const sections = starts.map((s, i) => sectionOf(chain.parts.slice(s, starts[i + 1])));
    const { body, assemblyId, carrierId } = chain;
    return [{ body, assemblyId, carrierId, sections, joints }];
  });
}

function chainsOf(tree: RocketTree, bodies: readonly FlightBody[], frames: ReadonlyMap<string, AxialFrame>): Chain[] {
  const bodyOf = (n: ComponentNode) =>
    Math.max(
      0,
      bodies.findIndex((b) => n.id != null && b.partIds.has(n.id)),
    );
  const own = new Map<number, Chain>();
  const out: Chain[] = [];
  const assemblies = (n: ComponentNode, carrier: ComponentNode, chain: Chain): void => {
    for (const c of n.children ?? []) {
      if (!isAssembly(c.type)) assemblies(c, carrier, chain);
      else if (c.id != null) {
        const body = bodyOf(c);
        const carrierId = body === chain.body ? (carrier.id ?? null) : null;
        const pod: Chain = { body, stages: chain.stages, assemblyId: c.id, carrierId, parts: [] };
        out.push(pod);
        if (carrierId == null) pod.stages = [c];
        add(c, pod);
      }
    }
  };
  const add = (holder: ComponentNode, chain: Chain): void => {
    for (const node of holder.children ?? []) {
      const frame = node.id == null ? undefined : frames.get(node.id);
      if (!isAirframe(node) || !frame) continue;
      chain.parts.push({ node, ...frame });
      assemblies(node, node, chain);
    }
  };
  for (const stage of tree.components) {
    if (stage.type !== 'stage') continue;
    const body = bodyOf(stage);
    let chain = own.get(body);
    if (!chain) {
      chain = { body, stages: [], assemblyId: null, carrierId: null, parts: [] };
      own.set(body, chain);
      out.push(chain);
    }
    chain.stages.push(stage);
    add(stage, chain);
  }
  return out.filter((c) => c.parts.length > 0);
}

function radiusOf(n: ComponentNode): number {
  if (n.type === 'bodytube') return bodyTubeRadius(n);
  if (n.type === 'nosecone') return noseConeAftRadius(n);
  const { fore, aft } = profileEnds(n);
  return Math.max(fore, aft);
}

function sectionOf(parts: readonly Part[]): Section {
  return {
    fore: parts[0]!.start,
    aft: endOf(parts[parts.length - 1]!),
    radius: Math.max(...parts.map((p) => radiusOf(p.node))),
    partIds: new Set([...walkNodes(parts.map((p) => p.node))].flatMap((n) => n.id ?? [])),
  };
}

type Way = 'front' | 'back';
/** The joint reached, the open air at the end of the chain, or a wall in the way. */
type Reached = number | 'air' | 'wall';

/** The part in front of the joint a device opens, or null where it opens none. */
function openedBy(
  tree: RocketTree,
  chain: Chain,
  device: ComponentNode,
  frames: ReadonlyMap<string, AxialFrame>,
): number | null {
  if (device.id == null) return null;
  const lineage = lineageOf(tree.components, device.id);
  const part = lineage.find(isAirframe);
  const at = chain.parts.findIndex((p) => p.node === part);
  const frame = frames.get(device.id);
  if (at < 0 || !frame) return null;
  const choice: OpensAt = opensAt(device);
  const last = chain.parts.length - 1;
  if (choice === 'closed') return null;
  if (choice === 'front') return at > 0 ? nearest(chain, at, 'front', frames) : null;
  if (choice === 'back') return at < last ? nearest(chain, at, 'back', frames) : null;

  // Packed in the nose cone: nothing else it could push off.
  if (at === 0 && part?.type === 'nosecone') return last > 0 ? 0 : null;
  const middle = middleOf(frame);
  const holders = new Set(lineage);
  const front = reach(chain, at, 'front', middle, holders, frames);
  const back = reach(chain, at, 'back', middle, holders, frames);
  if (typeof front === 'number' && typeof back === 'number') {
    return pinned(chain, back, frames) && !pinned(chain, front, frames) ? back : front;
  }
  if (typeof front === 'number') return front;
  if (front === 'air') return null;
  if (typeof back === 'number') return back;
  // Shut in at both ends, yet it came out.
  return back === 'wall' && at > 0 ? nearest(chain, at, 'front', frames) : null;
}

/** The joint next to a part, or the first past it that slides apart. */
function nearest(chain: Chain, at: number, way: Way, frames: ReadonlyMap<string, AxialFrame>): number {
  const first = way === 'front' ? at - 1 : at;
  const step = way === 'front' ? -1 : 1;
  for (let j = first; chain.parts[j] && chain.parts[j + 1]; j += step) {
    if (slides(chain, j, frames)) return j;
    if (chain.parts[way === 'front' ? j : j + 1]!.node.type !== 'bodytube') break;
  }
  return first;
}

function reach(
  chain: Chain,
  at: number,
  way: Way,
  middle: number,
  holders: ReadonlySet<ComponentNode>,
  frames: ReadonlyMap<string, AxialFrame>,
): Reached {
  const forward = way === 'front';
  let first: number | null = null;
  for (let k = at; chain.parts[k]; k += forward ? -1 : 1) {
    const { node } = chain.parts[k]!;
    const walls = wallsIn(chain.parts[k]!, holders, frames);
    const inWay = k === at ? walls.some((w) => (forward ? w < middle : w > middle)) : walls.length > 0;
    const motor = !forward && node['motorMount'] === true;
    if (k === at && (inWay || motor)) return 'wall';
    if (k !== at && (inWay || motor || node.type !== 'bodytube')) break;
    const joint = forward ? k - 1 : k;
    if (!chain.parts[joint] || !chain.parts[joint + 1]) return first ?? 'air';
    first ??= joint;
    // A bare butt joint is glued up inside: look on through the next tube for one that slides.
    if (slides(chain, joint, frames)) return joint;
  }
  return first ?? 'wall';
}

/** Whether a coupler reaches across a joint, or a shoulder sits in it. */
function slides(chain: Chain, joint: number, frames: ReadonlyMap<string, AxialFrame>): boolean {
  const fore = chain.parts[joint]!;
  const aft = chain.parts[joint + 1]!;
  if (fore.node.type === 'nosecone' || aft.node.type === 'nosecone') return true;
  if (fore.node.type === 'transition' && hasShoulder(shouldersOf(fore.node).aft)) return true;
  if (aft.node.type === 'transition' && hasShoulder(shouldersOf(aft.node).fore)) return true;
  return [fore, aft].some((p) =>
    couplersIn(p.node).some((c) => {
      const f = c.id == null ? undefined : frames.get(c.id);
      return f != null && f.start < aft.start - SLACK_M && endOf(f) > aft.start + SLACK_M;
    }),
  );
}

const couplersIn = (n: ComponentNode): ComponentNode[] => [...inside(n)].filter((c) => c.type === 'tubecoupler');

/** What is in a part, its pods left out. */
function* inside(n: ComponentNode): Generator<ComponentNode> {
  for (const c of n.children ?? []) {
    if (isAssembly(c.type)) continue;
    yield c;
    yield* inside(c);
  }
}

/** The middles of what closes a part's bore. A coupler reaching out of either end goes with the next part instead. */
function wallsIn(part: Part, holders: ReadonlySet<ComponentNode>, frames: ReadonlyMap<string, AxialFrame>): number[] {
  const frameOf = (n: ComponentNode) => (n.id == null ? undefined : frames.get(n.id));
  const leaving = couplersIn(part.node).flatMap((c) => {
    const f = frameOf(c);
    return f && (f.start < part.start - SLACK_M || endOf(f) > endOf(part) + SLACK_M) ? [f] : [];
  });
  return [...inside(part.node)].flatMap((n) => {
    const f = frameOf(n);
    // A bulkhead a device is tied to still closes the bore.
    if (!f || !BLOCKING.has(n.type) || (holders.has(n) && n.type !== 'bulkhead')) return [];
    const middle = middleOf(f);
    const leaves = !holders.has(n) && leaving.some((c) => middle >= c.start - SLACK_M && middle <= endOf(c) + SLACK_M);
    return leaves ? [] : [middle];
  });
}

/** Whether shear pins are named at a joint: a joint made to come apart. */
function pinned(chain: Chain, joint: number, frames: ReadonlyMap<string, AxialFrame>): boolean {
  const near = (p: Part, aft: boolean) =>
    [...inside(p.node)].some((n) => {
      const f = n.id == null ? undefined : frames.get(n.id);
      return f != null && namesShearPins(n) && middleOf(f) > middleOf(p) === aft;
    });
  return near(chain.parts[joint]!, true) || near(chain.parts[joint + 1]!, false);
}

function cordAt(chain: Chain, joint: number, out: readonly Deployment[], rocketLength: number): number {
  const beside = [chain.parts[joint]!.node, chain.parts[joint + 1]!.node];
  const holding = chain.parts
    .map((p) => p.node)
    .filter((n) => [...walkNodes([n])].some((c) => out.some((d) => d.device === c)));
  for (const n of walkNodes([...holding, ...beside, ...chain.stages])) {
    if (n.type !== 'shockcord') continue;
    return n['cordLengthAuto'] === true
      ? rocketLength * AUTO_CORD_RATIO
      : num(n, 'cordLength', KERNEL_DEFAULTS.shockcord.cordLength);
  }
  return rocketLength;
}

/** Where an ejection charge in a body blows out: the joint opening nearest it in time, else the front. */
export function chargeMouth(frames: readonly Airframe[], body: number, time: number, fore: number): number {
  let best = fore;
  let nearestBy = Infinity;
  for (const f of frames) {
    if (f.body !== body || f.carrierId != null) continue;
    f.joints.forEach((j, i) => {
      const by = Math.abs(j.opens - time);
      if (by >= nearestBy) return;
      nearestBy = by;
      best = f.sections[i]!.aft;
    });
  }
  return best;
}
