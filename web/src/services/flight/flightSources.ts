import type { ComponentNode, FlightEvent, FlightEventType, RocketTree } from '../../engine/openRocketEngine';
import { kernelComponentName } from '../app/warningText';
import { findMounts, findRecoveryDevices, findStages } from '../design/treeEdit';
import { walkNodes } from '../../tree/treeWalk';
import type { FlightBody } from './flightBodies';
import { seriesAt } from './flightEvents';

/** Each branch's own: a separated stage's branch starts with a copy of its parent's. */
function ownEvents(bodies: readonly FlightBody[]): FlightEvent[] {
  const key = (e: FlightEvent) => `${e.type}|${e.time}|${e.sourceId ?? e.source ?? ''}`;
  return bodies.flatMap(({ branch, parent }) => {
    const copied = new Set(parent == null ? [] : (bodies[parent]?.branch.events ?? []).map(key));
    return (branch.events ?? []).filter((e) => !copied.has(key(e)));
  });
}

/** When each part's first `type` event came. A result read from a file names its sources without ids. */
function timesBySource(
  events: readonly FlightEvent[],
  parts: readonly ComponentNode[],
  type: FlightEventType,
): Map<ComponentNode, number> {
  const out = new Map<ComponentNode, number>();
  const typed = events.filter((e) => e.type === type).sort((a, b) => a.time - b.time);
  const namesakes = new Map<string, number>();
  // Bottom first, the order parts of one name burn in.
  for (const part of [...parts].reverse()) {
    const byId = typed.find((e) => e.sourceId != null && e.sourceId === part.id);
    if (byId) {
      out.set(part, byId.time);
      continue;
    }
    const name = kernelComponentName(part);
    const nth = namesakes.get(name) ?? 0;
    const byName = typed.filter((e) => e.sourceId == null && e.source === name)[nth];
    if (!byName) continue;
    namesakes.set(name, nth + 1);
    out.set(part, byName.time);
  }
  return out;
}

const bodyOf = (bodies: readonly FlightBody[], part: ComponentNode): number =>
  Math.max(
    0,
    bodies.findIndex((b) => part.id != null && b.partIds.has(part.id)),
  );

const endOf = (bodies: readonly FlightBody[], body: number): number => bodies[body]?.branch.series.time.at(-1) ?? 0;

/** One mount's burn: its tubes light and go out together. */
export interface MountBurn {
  mountId: string;
  body: number;
  from: number;
  to: number;
  /** When its stage's ejection charge fires, unless plugged. */
  charge?: number;
  /** In time order, one per change in which motors push the stack; newtons, of them all. */
  parts: { from: number; average: number }[];
}

// A cluster's motors go out a little apart.
const ONE_CHANGE_S = 0.15;
const SAMPLES = 60;

export function mountBurns(tree: RocketTree, bodies: readonly FlightBody[]): MountBurn[] {
  const mounts = findMounts(tree);
  const events = ownEvents(bodies);
  const lit = timesBySource(events, mounts, 'IGNITION');
  const out = timesBySource(events, mounts, 'BURNOUT');
  const charges = chargesOf(tree, events);
  const burns = mounts.flatMap((mount): MountBurn[] => {
    const from = lit.get(mount);
    if (from == null || mount.id == null) return [];
    const body = bodyOf(bodies, mount);
    const to = out.get(mount) ?? endOf(bodies, body);
    const { id } = mount;
    const charge = charges.find((c) => c.time >= to && [...walkNodes([c.stage])].some((n) => n.id === id))?.time;
    return [{ mountId: id, body, from, to, ...(charge == null ? {} : { charge }), parts: [] }];
  });
  for (const burn of burns) burn.parts = burnParts(burn, burns, bodies);
  return burns;
}

interface Charge {
  stage: ComponentNode;
  time: number;
}

/** In time order, innermost stage first at one moment, so a strap-on's is not taken for its core's. */
function chargesOf(tree: RocketTree, events: readonly FlightEvent[]): Charge[] {
  const stages = findStages(tree).reverse();
  return events
    .filter((e) => e.type === 'EJECTION_CHARGE')
    .flatMap((e): Charge[] => {
      const stage =
        stages.find((s) => e.sourceId != null && s.id === e.sourceId) ??
        stages.find((s) => e.sourceId == null && kernelComponentName(s) === e.source);
      return stage ? [{ stage, time: e.time }] : [];
    })
    .sort((a, b) => a.time - b.time || stages.indexOf(a.stage) - stages.indexOf(b.stage));
}

/** A burst of gas from the front of a body. */
export interface Pop {
  kind: 'ejection' | 'separation';
  body: number;
  time: number;
}

const ONE_POP_S = 0.05;

/** Ejection charges and in-line separations. A strap-on lets go without one. */
export function flightPops(tree: RocketTree, bodies: readonly FlightBody[]): Pop[] {
  const stages = findStages(tree);
  const out: Pop[] = [];
  bodies.forEach(({ branch, separatedAt }, body) => {
    if (!Number.isFinite(separatedAt)) return;
    const event = (branch.events ?? []).find((e) => e.type === 'STAGE_SEPARATION');
    const stage = stages.find((s) =>
      event?.sourceId == null ? kernelComponentName(s) === event?.source : s.id === event.sourceId,
    );
    if (stage?.type !== 'parallelstage') out.push({ kind: 'separation', body, time: separatedAt });
  });
  for (const { stage, time } of chargesOf(tree, ownEvents(bodies))) {
    const body = bodyOf(bodies, stage);
    const shown = out.some((p) => p.body === body && Math.abs(p.time - time) < ONE_POP_S);
    if (!shown && time <= endOf(bodies, body)) out.push({ kind: 'ejection', body, time });
  }
  return out;
}

function burnParts(
  { body, from, to }: MountBurn,
  burns: readonly MountBurn[],
  bodies: readonly FlightBody[],
): MountBurn['parts'] {
  const series = bodies[body]?.branch.series;
  if (!series) return [];
  const changes = [...burns.flatMap((b) => [b.from, b.to]), ...bodies.map((b) => b.separatedAt)].sort((a, b) => a - b);
  const starts = [from];
  let last = from;
  for (const t of changes) {
    if (t - last <= ONE_CHANGE_S || to - t <= ONE_CHANGE_S) continue;
    starts.push(t);
    last = t;
  }
  return starts.map((start, i) => {
    const end = starts[i + 1] ?? to;
    let sum = 0;
    for (let k = 0; k < SAMPLES; k++) {
      sum += seriesAt(series, 'thrust', start + ((k + 0.5) / SAMPLES) * (end - start)) ?? 0;
    }
    return { from: start, average: sum / SAMPLES };
  });
}

/** The recorded thrust against its average over the burn, 0 when out. 1 throughout where a run records none. */
export function burnLevel(burn: MountBurn, bodies: readonly FlightBody[], t: number): number {
  const series = bodies[burn.body]?.branch.series;
  if (!series || t <= burn.from || t >= burn.to) return 0;
  let average = 0;
  for (const p of burn.parts) if (t >= p.from) average = p.average;
  return average > 0 ? Math.max(0, (seriesAt(series, 'thrust', t) ?? 0) / average) : 1;
}

/** A recovery device out in the air. */
export interface Deployment {
  device: ComponentNode;
  body: number;
  from: number;
  /** Its stage's landing. */
  to: number;
}

/** In deployment order. */
export function deployments(tree: RocketTree, bodies: readonly FlightBody[]): Deployment[] {
  const devices = findRecoveryDevices(tree);
  const opened = timesBySource(ownEvents(bodies), devices, 'RECOVERY_DEVICE_DEPLOYMENT');
  return devices
    .flatMap((device): Deployment[] => {
      const from = opened.get(device);
      if (from == null) return [];
      const body = bodyOf(bodies, device);
      return [{ device, body, from, to: endOf(bodies, body) }];
    })
    .sort((a, b) => a.from - b.from);
}
