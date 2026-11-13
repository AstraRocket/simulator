import { C6 } from '../../engine/api';
import { findMounts, findRecoveryDevices, findSeparators, findStages, updateNode } from '../design/treeEdit';
import { uuid } from '../app/uuid';
import type { ComponentNode, IgnitionEvent, MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import { KERNEL_DEPLOYMENT, KERNEL_SEPARATION } from '../../tree/kernelDefaults';
import { motorFullName } from '../motors/motorName';
import { hasUsableCurve } from '../motors/motorCurve';
import { num } from '../../tree/nodeProps';

export interface MountMotor {
  spec: MotorSpec;
  ignitionEvent?: IgnitionEvent;
  /** Seconds. */
  ignitionDelay?: number;
}

export interface FlightConfig {
  id: string;
  /** Null means unnamed (desktop shows the motor list); must round-trip. */
  name: string | null;
  motors: Record<string, MountMotor>;
  deployments?: Record<string, DeployOverride>;
  separations?: Record<string, SepOverride>;
  grounded?: string[];
}

export interface SepOverride {
  separationEvent?: string;
  separationDelay?: number;
  separationAltitude?: number;
}

export interface DeployOverride {
  deployEvent?: string;
  deployAltitude?: number;
  deployDelay?: number;
}

const designString = (node: ComponentNode, key: string, fallback: string): string => {
  const v = node[key];
  return typeof v === 'string' && v ? v : fallback;
};

export function designDeployment(device: ComponentNode): Required<DeployOverride> {
  return {
    deployEvent: designString(device, 'deployEvent', KERNEL_DEPLOYMENT.deployEvent),
    deployAltitude: num(device, 'deployAltitude', KERNEL_DEPLOYMENT.deployAltitude),
    deployDelay: num(device, 'deployDelay', KERNEL_DEPLOYMENT.deployDelay),
  };
}

export function designSeparation(stage: ComponentNode): Required<SepOverride> {
  return {
    separationEvent: designString(stage, 'separationEvent', KERNEL_SEPARATION.separationEvent),
    separationAltitude: num(stage, 'separationAltitude', KERNEL_SEPARATION.separationAltitude),
    separationDelay: num(stage, 'separationDelay', KERNEL_SEPARATION.separationDelay),
  };
}

// Both keys unless automatic with no delay, so an automatic delay still reaches the kernel.
export function mountIgnition(
  mount: ComponentNode | null | undefined,
): Pick<MountMotor, 'ignitionEvent' | 'ignitionDelay'> {
  if (!mount) return {};
  const ignitionEvent = designString(mount, 'ignitionEvent', 'automatic') as IgnitionEvent;
  const ignitionDelay = num(mount, 'ignitionDelay', 0);
  return ignitionEvent === 'automatic' && ignitionDelay === 0 ? {} : { ignitionEvent, ignitionDelay };
}

export function sameIgnition(
  a: Pick<MountMotor, 'ignitionEvent' | 'ignitionDelay'>,
  b: Pick<MountMotor, 'ignitionEvent' | 'ignitionDelay'>,
): boolean {
  return (
    (a.ignitionEvent ?? 'automatic') === (b.ignitionEvent ?? 'automatic') &&
    (a.ignitionDelay ?? 0) === (b.ignitionDelay ?? 0)
  );
}

// Desktop MotorConfigurationPanel.selectMotor; slots are never empty here, so a motor on the old ignition stands in.
export function followMountIgnition(
  configs: FlightConfig[],
  mountId: string,
  before: ComponentNode,
  after: ComponentNode,
): FlightConfig[] {
  const was = mountIgnition(before);
  const now = mountIgnition(after);
  if (sameIgnition(was, now)) return configs;
  let changed = false;
  const next = configs.map((c) => {
    const seated = c.motors[mountId];
    if (!seated || !sameIgnition(seated, was)) return c;
    changed = true;
    const { ignitionEvent: _event, ignitionDelay: _delay, ...rest } = seated;
    return { ...c, motors: { ...c.motors, [mountId]: { ...rest, ...now } } };
  });
  return changed ? next : configs;
}

export function effectiveDeployment(config: FlightConfig, device: ComponentNode): Required<DeployOverride> {
  return { ...designDeployment(device), ...deployOverride(config, device.id as string) };
}

export function effectiveSeparation(config: FlightConfig, stage: ComponentNode): Required<SepOverride> {
  return { ...designSeparation(stage), ...sepOverride(config, stage.id as string) };
}

export function newFlightConfig(
  motors: Record<string, MountMotor> = {},
  name: string | null = null,
  id: string = uuid(),
): FlightConfig {
  return { id, name, motors };
}

export function configFor(configs: readonly FlightConfig[], configId: string): FlightConfig {
  return configs.find((c) => c.id === configId) ?? configs[0]!;
}

// In tree order, not map-key order.
export function liveMotors(tree: RocketTree, config: FlightConfig): [string, MountMotor][] {
  const out: [string, MountMotor][] = [];
  for (const m of findMounts(tree)) {
    const id = m.id as string;
    const seated = config.motors[id];
    if (seated) out.push([id, seated]);
  }
  return out;
}

/** Mounts outside every grounded stage: a grounded stage stays on the pad, motors and all. */
function flyingMountIds(tree: RocketTree, config: FlightConfig): Set<string> {
  const grounded = new Set(config.grounded ?? []);
  const ids = new Set<string>();
  const walk = (nodes: readonly ComponentNode[]) => {
    for (const n of nodes) {
      if ((n.type === 'stage' || n.type === 'parallelstage') && typeof n.id === 'string' && grounded.has(n.id))
        continue;
      if (n.motorMount === true && typeof n.id === 'string') ids.add(n.id);
      if (n.children) walk(n.children);
    }
  };
  walk(tree.components);
  return ids;
}

// The first mount alone would refuse a booster-only `.ork` (curve-less sustainer placeholder) that desktop flies.
export function primaryMotor(tree: RocketTree, config: FlightConfig): MotorSpec | undefined {
  const flying = flyingMountIds(tree, config);
  const live = liveMotors(tree, config).filter(([id]) => flying.has(id));
  return (live.find(([, m]) => hasUsableCurve(m.spec)) ?? live[0])?.[1].spec;
}

export function motorSpecs(tree: RocketTree, config: FlightConfig): MotorSpec[] {
  return liveMotors(tree, config).map(([, m]) => m.spec);
}

// Returns the same object when nothing moved, so autosave sees no change.
export function reconcileConfig(tree: RocketTree, config: FlightConfig): FlightConfig {
  const mounts = findMounts(tree);
  const ids = mounts.map((m) => m.id as string);
  const present = new Set(ids);
  let changed = false;
  const next: Record<string, MountMotor> = {};
  for (const [id, m] of Object.entries(config.motors)) {
    if (present.has(id)) next[id] = m;
    else changed = true;
  }
  for (const mount of mounts) {
    const id = mount.id as string;
    if (!next[id]) {
      next[id] = { spec: C6, ...mountIgnition(mount) };
      changed = true;
    }
  }
  // Drop overrides of deleted parts so a later part reusing the id does not inherit them.
  const devices = new Set(findRecoveryDevices(tree).map((d) => d.id as string));
  let deployments = config.deployments;
  if (deployments && Object.keys(deployments).some((id) => !devices.has(id))) {
    deployments = Object.fromEntries(Object.entries(deployments).filter(([id]) => devices.has(id)));
    changed = true;
  }
  const separators = new Set(findSeparators(tree).map((n) => n.id as string));
  let separations = config.separations;
  if (separations && Object.keys(separations).some((id) => !separators.has(id))) {
    separations = Object.fromEntries(Object.entries(separations).filter(([id]) => separators.has(id)));
    changed = true;
  }
  const stages = new Set(findStages(tree).map((n) => n.id as string));
  let grounded = config.grounded;
  if (grounded?.some((id) => !stages.has(id))) {
    grounded = grounded.filter((id) => stages.has(id));
    changed = true;
  }
  return changed
    ? {
        ...config,
        motors: next,
        ...(deployments ? { deployments } : {}),
        ...(separations ? { separations } : {}),
        ...(grounded ? { grounded } : {}),
      }
    : config;
}

// `origins`: copy id to original id. Mirrors desktop `copy()` carrying FlightConfigurableParameterSets.
export function carryToCopies(configs: FlightConfig[], origins: ReadonlyMap<string, string>): FlightConfig[] {
  if (!origins.size) return configs;
  const carry = <T>(table: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!table) return table;
    let out: Record<string, T> | undefined;
    for (const [copy, original] of origins) {
      const entry = table[original];
      if (entry === undefined || copy in table) continue;
      out ??= { ...table };
      out[copy] = structuredClone(entry);
    }
    return out ?? table;
  };
  return configs.map((c) => {
    const motors = carry(c.motors) ?? c.motors;
    const deployments = carry(c.deployments);
    const separations = carry(c.separations);
    return motors === c.motors && deployments === c.deployments && separations === c.separations
      ? c
      : { ...c, motors, deployments, separations };
  });
}

export function reconcileConfigs(tree: RocketTree, configs: FlightConfig[]): FlightConfig[] {
  let changed = false;
  const next = configs.map((c) => {
    const r = reconcileConfig(tree, c);
    if (r !== c) changed = true;
    return r;
  });
  return changed ? next : configs;
}

export function loadoutLabel(tree: RocketTree, config: FlightConfig): string {
  return motorSpecs(tree, config)
    .filter((m) => m.designation)
    .map(motorFullName)
    .join(' + ');
}

// Empty when nothing is seated; the caller localizes that case.
export function configLabel(tree: RocketTree, config: FlightConfig): string {
  return config.name || loadoutLabel(tree, config);
}

export function deployOverride(config: FlightConfig, deviceId: string): DeployOverride | undefined {
  const o = config.deployments?.[deviceId];
  return o && Object.keys(o).length ? o : undefined;
}

export function stageFlies(config: FlightConfig, stageId: string): boolean {
  return !config.grounded?.includes(stageId);
}

export function sepOverride(config: FlightConfig, stageId: string): SepOverride | undefined {
  const o = config.separations?.[stageId];
  return o && Object.keys(o).length ? o : undefined;
}

// Returns the same tree when nothing is overridden, keeping memo keys stable.
export function configuredTree(tree: RocketTree, config: FlightConfig): RocketTree {
  let out = tree;
  for (const [deviceId, o] of Object.entries(config.deployments ?? {})) {
    out = patchNode(out, deviceId, o, ['deployEvent', 'deployAltitude', 'deployDelay']);
  }
  for (const [stageId, o] of Object.entries(config.separations ?? {})) {
    out = patchNode(out, stageId, o, ['separationEvent', 'separationDelay', 'separationAltitude']);
  }
  return out;
}

// Only declared keys: writing `undefined` would blank the design's value.
function patchNode<T extends object>(tree: RocketTree, id: string, over: T, keys: readonly (keyof T & string)[]) {
  const patch: Partial<ComponentNode> = {};
  for (const key of keys) if (over[key] !== undefined) patch[key] = over[key];
  return Object.keys(patch).length ? updateNode(tree, id, patch) : tree;
}

const specSerials = new WeakMap<object, number>();
let nextSerial = 1;
function serialOf(spec: object): number {
  let n = specSerials.get(spec);
  if (n === undefined) {
    n = nextSerial++;
    specSerials.set(spec, n);
  }
  return n;
}

// Leaves out ignition: it cannot change static readouts and the delay input fires per keystroke.
export function seatedMotorsKey(tree: RocketTree, config: FlightConfig): string {
  return liveMotors(tree, config)
    .map(([id, m]) => `${id}:${serialOf(m.spec)}`)
    .join('|');
}

// Thrust samples are left out: two catalog fetches of one motor are the same motor.
export function loadoutSignature(motors: Record<string, MountMotor>): string {
  return Object.keys(motors)
    .sort()
    .map((id) => {
      const m = motors[id]!;
      const s = m.spec;
      return [
        id,
        s.manufacturer ?? '',
        s.designation,
        s.ejectionDelay,
        s.diameter,
        s.length,
        m.ignitionEvent ?? '',
        m.ignitionDelay ?? 0,
      ].join('\u0001');
    })
    .join('\u0002');
}

function hasOverrides(c: FlightConfig): boolean {
  const any = (r: Record<string, object> | undefined) => Object.values(r ?? {}).some((o) => Object.keys(o).length > 0);
  return any(c.deployments) || any(c.separations) || (c.grounded?.length ?? 0) > 0;
}

export function ensureConfig(
  configs: FlightConfig[],
  motors: Record<string, MountMotor>,
): { configs: FlightConfig[]; id: string } {
  const sig = loadoutSignature(motors);
  const found = configs.find((c) => !hasOverrides(c) && loadoutSignature(c.motors) === sig);
  if (found) return { configs, id: found.id };
  const made = newFlightConfig(motors);
  return { configs: [...configs, made], id: made.id };
}
