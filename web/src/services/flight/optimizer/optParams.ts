import type { ComponentNode, RocketTree } from '../../../engine/openRocketEngine';
import { findParent, findNode, isRecoveryDevice, updateNode } from '../../design/treeEdit';
import { effectiveDeployment, flyingNodes, stageFlies, type FlightConfig } from '../flightConfigs';
import { bool, num, positionOf } from '../../../tree/nodeProps';
import { kernelDefault, KERNEL_AUTO_RADIUS } from '../../../tree/kernelDefaults';
import { axialLength, partLength } from '../../../tree/position';
import { nodeShape, shapeParamMax, shapeUsesParameter } from '../../../tree/shapeProfile';
import { lineageOf, stageNodes } from '../../../tree/treeWalk';

/**
 * What the optimizer may vary: desktop's `DefaultSimulationModifierService`, less what no goal can use
 * (fin cant, wall thickness, mass and CG overrides, drag coefficients, streamer aspect ratio, launch lugs,
 * and a booster's ignition delay). The website's optimization page lists those.
 */
export type OptKey =
  | 'length'
  | 'baseDiameter'
  | 'foreDiameter'
  | 'aftDiameter'
  | 'outerDiameter'
  | 'shapeParameter'
  | 'rootChord'
  | 'tipChord'
  | 'sweep'
  | 'height'
  | 'position'
  | 'mass'
  | 'motorOverhang'
  | 'ignitionDelay'
  | 'chuteDiameter'
  | 'stripLength'
  | 'stripWidth'
  | 'deployDelay'
  | 'deployAltitude';

/** Seconds and shape parameters have no unit choice. */
export type OptKind = 'length' | 'distance' | 'mass' | 'time' | 'number';

/** SI; a diameter is a diameter here, though the node stores a radius. */
export interface OptParam {
  id: string;
  nodeId: string;
  key: OptKey;
  kind: OptKind;
  /** May go below zero: a sweep, an offset, an overhang. */
  signed: boolean;
  current: number;
  /** Desktop's default range, else the bounds the field itself has. */
  min: number;
  max: number;
}

interface Spec {
  key: OptKey;
  kind: OptKind;
  /** The node key; a `radius` one is edited as a diameter. */
  prop: string;
  radius?: true;
  signed?: true;
  /** Desktop offers a diameter only while it is not automatic. */
  autoFlag?: string;
}

const LEN = (key: OptKey, prop: string, extra: Partial<Spec> = {}): Spec => ({ key, kind: 'length', prop, ...extra });

const DIRECT: Record<string, Spec[]> = {
  nosecone: [LEN('length', 'length'), LEN('baseDiameter', 'aftRadius', { radius: true, autoFlag: 'aftRadiusAuto' })],
  transition: [
    LEN('length', 'length'),
    LEN('foreDiameter', 'foreRadius', { radius: true, autoFlag: 'foreRadiusAuto' }),
    LEN('aftDiameter', 'aftRadius', { radius: true, autoFlag: 'aftRadiusAuto' }),
  ],
  bodytube: [
    LEN('length', 'length'),
    LEN('outerDiameter', 'outerRadius', { radius: true, autoFlag: 'outerRadiusAuto' }),
  ],
  trapezoidfinset: [
    LEN('rootChord', 'rootChord'),
    LEN('tipChord', 'tipChord'),
    LEN('sweep', 'sweep', { signed: true }),
    LEN('height', 'height'),
  ],
  ellipticalfinset: [LEN('rootChord', 'rootChord'), LEN('height', 'height')],
  masscomponent: [{ key: 'mass', kind: 'mass', prop: 'mass' }],
  parachute: [LEN('chuteDiameter', 'diameter')],
  streamer: [LEN('stripLength', 'stripLength'), LEN('stripWidth', 'stripWidth')],
};

/** `FinSet`: desktop registers its position for every planar fin set, not tube fins. */
const FIN_SETS = new Set(['trapezoidfinset', 'ellipticalfinset', 'freeformfinset']);

/** Desktop's `InternalComponent` subclasses. */
const INTERNAL = new Set([
  'innertube',
  'tubecoupler',
  'centeringring',
  'bulkhead',
  'engineblock',
  'parachute',
  'streamer',
  'shockcord',
  'masscomponent',
]);

/** `FlightConfigurationModifier`s: desktop's 0..5 s ignition and 0..10 s deployment delay ranges. */
const IGNITION_DELAY_MAX = 5;
const DEPLOY_DELAY_MAX = 10;

const read = (n: ComponentNode, prop: string): number =>
  num(n, prop, kernelDefault(n.type, prop) ?? (prop.endsWith('Radius') ? KERNEL_AUTO_RADIUS : 0));

/** `setDefaultMinMax`: half to twice the current value. */
function defaultRange(v: number): [number, number] {
  return v >= 0 ? [v / 2, v * 2] : [v * 2, v / 2];
}

/** A position stays on its parent: from flush with one end to flush with the other. */
function positionRange(tree: RocketTree, node: ComponentNode, offset: number): [number, number] {
  const parent = findParent(tree, node.id as string);
  const room = parent ? partLength(parent) : 0;
  const span = Math.max(0, room - axialLength(node));
  const { method } = positionOf(node);
  if (span > 0 && method === 'top') return [0, span];
  if (span > 0 && method === 'bottom') return [-span, 0];
  if (span > 0 && method === 'middle') return [-span / 2, span / 2];
  const half = Math.max(room, axialLength(node)) / 2;
  return [offset - half, offset + half];
}

/** The stage a node flies in, and whether a lower stage lifts it: only then does an ignition delay mean anything. */
function upperStage(tree: RocketTree, config: FlightConfig, id: string): boolean {
  const lineage = lineageOf(tree.components, id);
  if (lineage.some((n) => n.type === 'parallelstage' || n.type === 'podset')) return false;
  const stage = lineage.find((n) => n.type === 'stage');
  const flying = stageNodes(tree).filter((s) => stageFlies(config, s.id as string));
  return !!stage && flying.indexOf(stage) >= 0 && flying.indexOf(stage) < flying.length - 1;
}

const param = (
  node: ComponentNode,
  key: OptKey,
  kind: OptKind,
  current: number,
  [min, max]: [number, number],
  signed = false,
): OptParam => ({ id: `${node.id as string}:${key}`, nodeId: node.id as string, key, kind, signed, current, min, max });

/** In tree order; parts in a grounded stage are left out, since they do not fly. */
export function optimizableParams(tree: RocketTree, config: FlightConfig): OptParam[] {
  const out: OptParam[] = [];
  for (const node of flyingNodes(tree.components, config, () => true)) {
    for (const s of DIRECT[node.type] ?? []) {
      if (s.autoFlag && bool(node, s.autoFlag)) continue;
      const v = read(node, s.prop) * (s.radius ? 2 : 1);
      out.push(param(node, s.key, s.kind, v, defaultRange(v), !!s.signed));
    }
    if (node.type === 'transition' && shapeUsesParameter(nodeShape(node))) {
      const v = num(node, 'shapeParameter', 0);
      out.push(param(node, 'shapeParameter', 'number', v, [0, shapeParamMax(nodeShape(node))]));
    }
    if (FIN_SETS.has(node.type) || INTERNAL.has(node.type)) {
      const v = positionOf(node).offset;
      out.push(param(node, 'position', 'length', v, positionRange(tree, node, v), true));
    }
    if (node.motorMount === true) {
      const v = num(node, 'motorOverhang', 0);
      out.push(param(node, 'motorOverhang', 'length', v, defaultRange(v), true));
      const seated = config.motors[node.id as string];
      if (seated && upperStage(tree, config, node.id as string)) {
        out.push(param(node, 'ignitionDelay', 'time', seated.ignitionDelay ?? 0, [0, IGNITION_DELAY_MAX]));
      }
    }
    if (isRecoveryDevice(node.type)) {
      const dep = effectiveDeployment(config, node);
      out.push(param(node, 'deployDelay', 'time', dep.deployDelay, [0, DEPLOY_DELAY_MAX]));
      if (dep.deployEvent === 'altitude') {
        out.push(param(node, 'deployAltitude', 'distance', dep.deployAltitude, defaultRange(dep.deployAltitude)));
      }
    }
  }
  return out;
}

const DEPLOY_KEYS: Partial<Record<OptKey, 'deployDelay' | 'deployAltitude'>> = {
  deployDelay: 'deployDelay',
  deployAltitude: 'deployAltitude',
};

/**
 * Sets each value as the design editor would: through `updateNode`, so automatic radii and shoulders follow.
 * A deployment the configuration overrides is set in the override, as desktop sets it per configuration.
 */
export function applyParams(
  tree: RocketTree,
  config: FlightConfig,
  params: readonly OptParam[],
  values: readonly number[],
): { tree: RocketTree; config: FlightConfig } {
  let t = tree;
  let c = config;
  params.forEach((p, i) => {
    const v = values[i]!;
    const node = findNode(t, p.nodeId);
    if (!node) return;
    const deployKey = DEPLOY_KEYS[p.key];
    if (deployKey) {
      const over = c.deployments?.[p.nodeId];
      if (over?.[deployKey] !== undefined) {
        c = { ...c, deployments: { ...c.deployments, [p.nodeId]: { ...over, [deployKey]: v } } };
      } else {
        t = updateNode(t, p.nodeId, { [deployKey]: v });
      }
      return;
    }
    if (p.key === 'ignitionDelay') {
      const seated = c.motors[p.nodeId];
      if (!seated) return;
      const ignitionEvent = seated.ignitionEvent ?? 'automatic';
      c = { ...c, motors: { ...c.motors, [p.nodeId]: { ...seated, ignitionEvent, ignitionDelay: v } } };
      return;
    }
    if (p.key === 'position') {
      t = updateNode(t, p.nodeId, { position: { ...positionOf(node), offset: v } });
      return;
    }
    if (p.key === 'shapeParameter') {
      t = updateNode(t, p.nodeId, { shapeParameter: v });
      return;
    }
    if (p.key === 'motorOverhang') {
      t = updateNode(t, p.nodeId, { motorOverhang: v });
      return;
    }
    const spec = (DIRECT[node.type] ?? []).find((s) => s.key === p.key);
    if (!spec) return;
    t = updateNode(t, p.nodeId, { [spec.prop]: spec.radius ? v / 2 : v });
  });
  return { tree: t, config: c };
}

/** Scaled 0..1 across the range, as desktop's `AbstractSimulationModifier` does; a zero range reads 0. */
export const toScaled = (p: Pick<OptParam, 'min' | 'max'>, v: number): number =>
  p.max > p.min ? (v - p.min) / (p.max - p.min) : 0;

export const fromScaled = (p: Pick<OptParam, 'min' | 'max'>, s: number): number => p.min + s * (p.max - p.min);

/** Lengths, masses and altitudes that cannot go below zero. */
export const rangeFloor = (p: Pick<OptParam, 'signed'>): number | undefined => (p.signed ? undefined : 0);
