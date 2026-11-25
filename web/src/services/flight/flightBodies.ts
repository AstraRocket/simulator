import type { ComponentNode, FlightBranch, FlightResult, RocketTree } from '../../engine/openRocketEngine';
import { kernelComponentName } from '../app/warningText';
import { flightBranches } from './flightColumns';

/** A part of the rocket that flies a branch of its own. */
export interface FlightBody {
  branch: FlightBranch;
  /** The body it flies attached to until `separatedAt`; null for the first, which never leaves. */
  parent: number | null;
  separatedAt: number;
  /** Every part that flies with it once it has separated. */
  partIds: ReadonlySet<string>;
}

interface Stage {
  node: ComponentNode;
  /** The stage above it, or the one it is strapped to. */
  parent: number | null;
}

function stagesOf(tree: RocketTree): Stage[] {
  const out: Stage[] = [];
  const strapOns = (nodes: readonly ComponentNode[], parent: number) => {
    for (const n of nodes) {
      const within = n.type === 'parallelstage' ? out.push({ node: n, parent }) - 1 : parent;
      strapOns(n.children ?? [], within);
    }
  };
  let above: number | null = null;
  for (const node of tree.components) {
    if (node.type !== 'stage') continue;
    const index: number = out.push({ node, parent: above }) - 1;
    strapOns(node.children ?? [], index);
    above = index;
  }
  return out;
}

/** In branch order. A stage that never separates flies with the one above it. */
export function flightBodies(tree: RocketTree, result: FlightResult): FlightBody[] {
  const branches = flightBranches(result);
  const stages = stagesOf(tree);
  const bodyOf = new Map<number, number>();
  const separations = branches.map((branch, i) => {
    if (i === 0) return null;
    // Its own: a branch does not copy its parent's separations (FlightDataBranch copy constructor).
    const event = (branch.events ?? []).find((e) => e.type === 'STAGE_SEPARATION');
    const byId = event?.sourceId != null ? stages.findIndex((s) => s.node.id === event.sourceId) : -1;
    // A result read from a file names its sources without ids.
    const name = event?.source ?? branch.name;
    const stage =
      byId >= 0 ? byId : stages.findIndex((s, k) => k > 0 && !bodyOf.has(k) && kernelComponentName(s.node) === name);
    if (stage > 0) bodyOf.set(stage, i);
    return { stage, time: event?.time ?? branch.series.time[0] ?? 0 };
  });

  const bodyOfStage = (k: number | null): number => {
    for (let at = k; at != null; at = stages[at]!.parent) {
      const body = bodyOf.get(at);
      if (body != null) return body;
    }
    return 0;
  };

  const parts = branches.map(() => new Set<string>());
  const stageOfNode = new Map(stages.map((s, k) => [s.node, k]));
  const collect = (nodes: readonly ComponentNode[], body: number) => {
    for (const n of nodes) {
      const stage = stageOfNode.get(n);
      const own = stage != null ? bodyOfStage(stage) : body;
      if (n.id != null) parts[own]!.add(n.id);
      collect(n.children ?? [], own);
    }
  };
  collect(tree.components, 0);

  return branches.map((branch, i) => {
    const left = separations[i];
    return {
      branch,
      parent: left ? bodyOfStage(stages[left.stage]?.parent ?? null) : null,
      separatedAt: left ? left.time : Infinity,
      partIds: parts[i]!,
    };
  });
}

/** The body whose branch `body` is flying at `t`: itself once separated, else whatever it is attached to. */
export function carrierAt(bodies: readonly FlightBody[], body: number, t: number): number {
  let at = body;
  for (let b = bodies[at]; b && b.parent != null && t < b.separatedAt; b = bodies[at]) at = b.parent;
  return at;
}
