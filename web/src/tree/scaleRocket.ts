import type { ComponentNode, ComponentType, RocketTree } from '../engine/openRocketEngine';
import { isAssembly } from './assembly';
import { isChainType } from './componentKinds';
import { chainOuterRadius, numOpt, positionOf } from './nodeProps';
import { replaceNode, walkNodes } from './treeWalk';
import { partLength } from './position';
import { roundTo } from '../services/app/numbers';
import { kernelDefault } from './kernelDefaults';

/** Explicit key lists, not a schema walk: importers write undeclared length keys, and `deployAltitude` is not geometry. */
const LENGTH_KEYS: Record<ComponentType, readonly string[]> = {
  nosecone: ['length', 'aftRadius', 'thickness', 'shoulderRadius', 'shoulderLength', 'shoulderThickness'],
  transition: [
    'length',
    'foreRadius',
    'aftRadius',
    'thickness',
    'foreShoulderRadius',
    'foreShoulderLength',
    'foreShoulderThickness',
    'aftShoulderRadius',
    'aftShoulderLength',
    'aftShoulderThickness',
  ],
  bodytube: ['length', 'outerRadius', 'thickness', 'motorOverhang'],
  trapezoidfinset: [
    'rootChord',
    'tipChord',
    'sweep',
    'height',
    'thickness',
    'airfoilLeDiamond',
    'airfoilTeDiamond',
    'finLeRadius',
    'tabHeight',
    'tabLength',
    'tabOffset',
    'filletRadius',
  ],
  freeformfinset: [
    'thickness',
    'airfoilLeDiamond',
    'airfoilTeDiamond',
    'finLeRadius',
    'tabHeight',
    'tabLength',
    'tabOffset',
    'filletRadius',
  ],
  ellipticalfinset: [
    'rootChord',
    'height',
    'thickness',
    'airfoilLeDiamond',
    'airfoilTeDiamond',
    'finLeRadius',
    'tabHeight',
    'tabLength',
    'tabOffset',
    'filletRadius',
  ],
  tubefinset: ['length', 'outerRadius', 'thickness'],
  innertube: ['length', 'outerRadius', 'thickness', 'radialPosition', 'maxMotorLength', 'motorOverhang'],
  // Desktop scales InstanceSeparation only on a rail button.
  tubecoupler: ['length', 'thickness', 'outerRadius', 'innerRadius', 'radialPosition'],
  centeringring: ['length', 'outerRadius', 'innerRadius', 'radialPosition'],
  bulkhead: ['length', 'outerRadius', 'radialPosition'],
  engineblock: ['length', 'thickness', 'outerRadius', 'radialPosition'],
  launchlug: ['length', 'outerRadius', 'thickness'],
  // Desktop's RailButtonScaler: the screw keeps its length.
  railbutton: ['outerDiameter', 'innerDiameter', 'height', 'baseHeight', 'flangeHeight', 'instanceSeparation'],
  // Spill hole keeps its size (desktop scales Diameter and LineLength only).
  parachute: ['length', 'radius', 'radialPosition', 'diameter', 'lineLength'],
  streamer: ['length', 'radius', 'radialPosition', 'stripLength', 'stripWidth'],
  shockcord: ['length', 'radius', 'radialPosition', 'cordLength'],
  masscomponent: ['length', 'radius', 'radialPosition'],
  fairing: [],
  podset: ['radiusOffset'],
  parallelstage: ['radiusOffset'],
  stage: [],
};

const FIXED_SIZE: ReadonlySet<ComponentType> = new Set<ComponentType>(['fairing']);

const AUTO_FLAG: Readonly<Record<string, string>> = { radius: 'radiusAuto' };

/** Desktop skips the Thickness scaler while `isFilled`, so the wall survives un-filling. */
const FILLED_WALL: ReadonlySet<ComponentType> = new Set<ComponentType>(['nosecone', 'transition', 'bodytube']);

const OFFSET_KEYS: ReadonlySet<string> = new Set(['radialPosition', 'radiusOffset', 'instanceSeparation']);

/** Desktop's ScaleDialog bounds; far past them a cubed mass reaches Infinity. */
export const SCALE_MIN = 0.01;
export const SCALE_MAX = 100;

export type ScaleScope = 'rocket' | 'subtree' | 'part';

/** An override mass scales only with both on (desktop scales it in its offsets pass). */
export interface ScaleOptions {
  offsets?: boolean;
  masses?: boolean;
}

const round = (x: number, places = 12): number => roundTo(x, places);

export function scaleNode(n: ComponentNode, k: number, options: ScaleOptions = {}): ComponentNode {
  const offsets = options.offsets ?? true;
  const masses = options.masses ?? true;
  const type = n.type;
  const fixed = FIXED_SIZE.has(type);
  const { children: _children, ...own } = n;
  const out: ComponentNode = { ...own };

  // `?? []` for a persisted node whose `type` is outside the union.
  for (const key of LENGTH_KEYS[type] ?? []) {
    if (!offsets && OFFSET_KEYS.has(key)) continue;
    const flag = AUTO_FLAG[key];
    if (flag !== undefined && n[flag] === true) continue;
    if (key === 'thickness' && n['filled'] === true && FILLED_WALL.has(type)) continue;
    // An absent key flies the kernel default, which desktop's scalers scale.
    const v = numOpt(n, key) ?? kernelDefault(type, key);
    if (v !== undefined) out[key] = round(v * k);
  }

  if (Array.isArray(n['points'])) {
    const pts = n['points'] as unknown[];
    out['points'] = pts.map((p) =>
      Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number'
        ? [round(p[0] * k), round(p[1] * k)]
        : // A malformed row is copied unscaled so no array is shared with the input.
          Array.isArray(p)
          ? [...(p as unknown[])]
          : p,
    );
  }

  if (!fixed) {
    const mass = type === 'masscomponent' ? numOpt(n, 'mass') : undefined;
    if (masses && mass !== undefined) out['mass'] = round(mass * k ** 3, 15);
    const override = numOpt(n, 'overrideMass');
    if (masses && offsets && override !== undefined) out['overrideMass'] = round(override * k ** 3, 15);
    const cg = numOpt(n, 'overrideCGX');
    if (offsets && cg !== undefined) out['overrideCGX'] = round(cg * k);
  }

  // Desktop's AxialOffset scaler multiplies the offset whatever the method.
  if (n.position && offsets) {
    const pos = positionOf(n);
    out.position = { ...pos, offset: round(pos.offset * k) };
  }

  return out;
}

/** A no-op factor returns the same tree object. */
export function scaleRocket(tree: RocketTree, factor: number, options: ScaleOptions = {}): RocketTree {
  if (!(factor > 0) || !Number.isFinite(factor) || factor === 1) return tree;
  const walk = (nodes: ComponentNode[]): ComponentNode[] =>
    nodes.map((n) => {
      const scaled = scaleNode(n, factor, options);
      return n.children ? { ...scaled, children: walk(n.children) } : scaled;
    });
  return { ...tree, components: walk(tree.components) };
}

export function scalePart(
  tree: RocketTree,
  id: string,
  factor: number,
  withChildren: boolean,
  options: ScaleOptions = {},
): RocketTree {
  if (!(factor > 0) || !Number.isFinite(factor) || factor === 1) return tree;
  const all = (n: ComponentNode): ComponentNode => {
    const scaled = scaleNode(n, factor, options);
    return n.children ? { ...scaled, children: n.children.map(all) } : scaled;
  };
  const components = replaceNode(tree.components, id, (n) => {
    if (withChildren) return all(n);
    const scaled = scaleNode(n, factor, options);
    return n.children ? { ...scaled, children: n.children } : scaled;
  });
  return components === tree.components ? tree : { ...tree, components };
}

export function hasExplicitMass(tree: RocketTree): boolean {
  for (const n of walkNodes(tree.components)) {
    if (n.type === 'masscomponent' || typeof n['overrideMass'] === 'number') return true;
  }
  return false;
}

export function maxBodyDiameter(tree: RocketTree): number {
  let r = 0;
  for (const n of walkNodes(tree.components)) r = Math.max(r, chainOuterRadius(n));
  return r * 2;
}

/** Pods and boosters excluded. */
export function rocketLength(tree: RocketTree): number {
  let total = 0;
  const walk = (nodes: ComponentNode[]) => {
    for (const n of nodes) {
      if (isAssembly(n.type)) continue;
      if (isChainType(n.type)) total += partLength(n);
      walk(n.children ?? []);
    }
  };
  walk(tree.components);
  return total;
}
