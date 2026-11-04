import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { catalogPatch, defaultNode, findNode, syncDerived, updateNode } from '../../../src/services/design/treeEdit';
import { isComponentRow, type ParachuteComponent } from '../../../src/services/parts/componentDb';
import { axialFrames, rebasePosition } from '../../../src/tree/axialRebase';
import { axialChain, axialLength } from '../../../src/tree/position';
import { countOf, MAX_CANT, num, positionOf } from '../../../src/tree/nodeProps';
import { lineInstances, placementOffsets } from '../../../src/tree/placement';
import { innerTubeExtent } from '../../../src/tree/schematicGeometry';
import { clusterCount } from '../../../src/tree/cluster';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';
import { profileMm, rocketSideView } from '../../../src/services/report/reportGeometry';
import { badDimensions, overturnedFins } from '../../../src/services/design/requiredComponent';
import { designBlocker } from '../../../src/services/flight/runnability';
import { profileEnds, shapeParamMax, shapeUsesParameter, stationRadius } from '../../../src/tree/shapeProfile';
import { chainWithKernelEnds, withKernelEnds } from '../../../src/services/design/autoRadius';
import {
  finCutContour,
  finMountOf,
  finOutlinePoints,
  finRootPoints,
  finTabPoints,
  finSpan,
  bodyRadiusAt,
  parentRadiusOf,
} from '../../../src/tree/finPlanform';
import { assemblyParentRadius, resolveAssemblyRadius } from '../../../src/tree/assembly';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { kernelGeometry, loadEngine, walkTree, type KernelGeometry } from '../../testing/kernelGeometry';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const DESIGNS = 200;
const TOL = 1e-9;
// Both sides find a clip point by iteration, so they agree only to hundredths of a millimeter.
const PROFILE_TOL = 1e-4;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPES = ['conical', 'ogive', 'ellipsoid', 'power', 'parabolic', 'haack'];

function generate(seed: number): RocketTree {
  const r = rng(seed);
  const chance = (p: number) => r() < p;
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  let n = 0;
  const id = (type: string) => `${type}${++n}`;
  const radius = () => Math.round(between(0.01, 0.05) * 1e4) / 1e4;

  // A separate stream, so each seed's airframe is unchanged.
  const vr = rng(seed + 0x7f4a7c15);
  const vChance = (p: number) => vr() < p;
  const vBetween = (lo: number, hi: number) => lo + vr() * (hi - lo);
  const vPick = <T>(xs: readonly T[]): T => xs[Math.floor(vr() * xs.length)]!;
  const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const cr = rng(seed + 0x5bd1e995);
  // `FinSet.getFinCantYOffset` has no answer where half the chord, turned by the cant, passes the radius.
  const cantFor = (chord: number, minRadius: number): number => {
    const usual = vChance(0.35) ? round4(vBetween(0.01, 0.08)) * (vChance(0.5) ? 1 : -1) : 0;
    const cant = (chord / 2) * Math.sin(Math.abs(usual)) < minRadius * 0.9 ? usual : 0;
    if (cr() >= 0.3) return cant;
    // Clear of the limit itself, where rounding alone parts the app from the kernel.
    const factor = cr() < 0.5 ? 0.6 + cr() * 0.25 : 1.15 + cr() * 0.45;
    const sin = (minRadius * factor) / (chord / 2);
    const near = Math.floor(Math.min(sin < 1 ? Math.asin(sin) : MAX_CANT, MAX_CANT) * 1e4) / 1e4;
    return cr() < 0.5 ? near : -near;
  };
  const shapeExtras = (node: Record<string, unknown>) => {
    const shape = node['shape'] as string;
    if (shapeUsesParameter(shape) && vChance(0.6)) node['shapeParameter'] = round4(vBetween(0, shapeParamMax(shape)));
    if (vChance(0.5)) node['clipped'] = vChance(0.5);
  };
  const tab = (chord: number): Record<string, unknown> => {
    if (vChance(0.15)) return { tabHeight: 0, tabLength: 0 };
    const tabLength = round4(chord * vBetween(0.2, 0.9));
    const method = vPick(['top', 'middle', 'bottom']);
    const room = chord - tabLength;
    const offset =
      method === 'top' ? vBetween(0, room) : method === 'bottom' ? -vBetween(0, room) : vBetween(-room / 2, room / 2);
    return {
      tabHeight: vChance(0.5) ? 0.2 : round4(vBetween(0.002, 0.008)),
      tabLength,
      tabOffsetMethod: method,
      tabOffset: Math.round(offset * 0.95 * 1e5) / 1e5,
    };
  };

  const internals = (outer: number, len: number, inTube: boolean): ComponentNode[] => {
    const kids: ComponentNode[] = [];
    const at = () => ({ method: 'top', offset: Math.round(between(0, len * 0.8) * 1e4) / 1e4 });
    if (inTube && chance(0.6)) {
      const mountR = Math.round(outer * between(0.3, 0.6) * 1e4) / 1e4;
      const mountLen = Math.round(between(0.3, 0.9) * len * 1e4) / 1e4;
      kids.push({
        type: 'innertube',
        id: id('innertube'),
        length: mountLen,
        outerRadius: mountR,
        thickness: 0.0005,
        position: at(),
        children: chance(0.5)
          ? [
              {
                type: 'engineblock',
                id: id('engineblock'),
                length: 0.005,
                thickness: 0.002,
                outerRadiusAuto: true,
                outerRadius: mountR * 0.9,
                position: { method: 'top', offset: 0 },
              } as unknown as ComponentNode,
            ]
          : [],
      } as unknown as ComponentNode);
    }
    const rings = Math.floor(between(0, 3));
    for (let i = 0; i < rings; i++) {
      kids.push({
        type: 'centeringring',
        id: id('centeringring'),
        length: 0.005,
        outerRadiusAuto: true,
        innerRadiusAuto: chance(0.7),
        outerRadius: outer * 0.9,
        innerRadius: outer * 0.3,
        position: at(),
      } as unknown as ComponentNode);
    }
    if (chance(0.5)) {
      kids.push({
        type: 'bulkhead',
        id: id('bulkhead'),
        length: 0.004,
        outerRadiusAuto: true,
        outerRadius: outer * 0.9,
        position: at(),
      } as unknown as ComponentNode);
    }
    if (inTube && chance(0.4)) {
      kids.push({
        type: 'tubecoupler',
        id: id('tubecoupler'),
        length: Math.round(len * 0.3 * 1e4) / 1e4,
        thickness: 0.001,
        outerRadiusAuto: true,
        outerRadius: outer * 0.9,
        position: at(),
      } as unknown as ComponentNode);
    }
    if (chance(0.4)) {
      kids.push({
        type: 'parachute',
        id: id('parachute'),
        diameter: 0.5,
        cd: 0.8,
        length: 0.03,
        radiusAuto: true,
        radius: outer * 0.5,
        position: at(),
      } as unknown as ComponentNode);
    }
    if (inTube && chance(0.3)) {
      const finCount = Math.floor(between(3, 9));
      // Fewer than three tubes size to the body radius (`TubeFinSet.getOuterRadius`).
      const explicitCount = vChance(0.5);
      const explicitRadius = vChance(0.35);
      kids.push({
        type: 'tubefinset',
        id: id('tubefinset'),
        finCount: explicitCount ? vPick([1, 2, 3, 4, 6, 8]) : finCount,
        length: 0.08,
        thickness: 0.0005,
        outerRadiusAuto: !explicitRadius,
        outerRadius: explicitRadius ? round4(outer * vBetween(0.2, 0.6)) : outer * 0.5,
        position: { method: 'bottom', offset: 0 },
      } as unknown as ComponentNode);
    }
    if (vChance(0.3)) {
      kids.push({
        type: 'streamer',
        id: id('streamer'),
        length: 0.03,
        stripLength: 0.5,
        stripWidth: 0.05,
        radiusAuto: true,
        radius: outer * 0.5,
        position: { method: 'top', offset: round4(vBetween(0, len * 0.8)) },
      } as unknown as ComponentNode);
    }
    if (vChance(0.3)) {
      kids.push({
        type: 'shockcord',
        id: id('shockcord'),
        length: 0.02,
        cordLength: 0.5,
        radiusAuto: true,
        radius: outer * 0.4,
        position: { method: 'top', offset: round4(vBetween(0, len * 0.8)) },
      } as unknown as ComponentNode);
    }
    return kids;
  };

  const fins = (len: number, outer: number): ComponentNode[] => {
    if (!chance(0.5)) return [];
    const chord = Math.round(between(0.3, 0.9) * len * 1e4) / 1e4;
    const tabLength = Math.round(chord * between(0.2, 0.9) * 1e4) / 1e4;
    const tabOffsetMethod = pick(['top', 'middle', 'bottom']);
    const position = { method: 'top', offset: Math.round(between(0, len - chord) * 1e4) / 1e4 };
    const type = vPick(['trapezoidfinset', 'trapezoidfinset', 'ellipticalfinset', 'freeformfinset']);
    const common = {
      id: id(type),
      finCount: vPick([3, 4]),
      thickness: 0.003,
      tabHeight: 0.2,
      tabLength,
      tabOffsetMethod,
      tabOffset: 0,
      ...(vChance(0.6) ? tab(chord) : {}),
      cant: cantFor(chord, outer),
      position,
    };
    if (type === 'ellipticalfinset') {
      return [{ type, ...common, rootChord: chord, height: 0.05 } as unknown as ComponentNode];
    }
    if (type === 'freeformfinset') {
      return [
        {
          type,
          ...common,
          points: [
            [0, 0],
            [round4(chord * vBetween(0.1, 0.4)), round4(vBetween(0.02, 0.05))],
            [round4(chord * vBetween(0.5, 0.9)), round4(vBetween(0.01, 0.04))],
            [chord, vChance(0.4) ? round4(vBetween(0.001, 0.005)) : 0],
          ],
        } as unknown as ComponentNode,
      ];
    }
    return [
      {
        type,
        ...common,
        rootChord: chord,
        tipChord: chord * 0.5,
        sweep: chord * 0.3,
        height: 0.05,
      } as unknown as ComponentNode,
    ];
  };

  // Freeform is the only fin set a nose cone or transition takes (`Transition.isCompatible`).
  const fr = rng(seed + 0x9e3779b9);
  const fChance = (p: number) => fr() < p;
  const fBetween = (lo: number, hi: number) => lo + fr() * (hi - lo);
  const fPick = <T>(xs: readonly T[]): T => xs[Math.floor(fr() * xs.length)]!;
  const freeformFins = (len: number, minRadius: number): ComponentNode[] => {
    if (!fChance(0.6)) return [];
    const chord = Math.round(fBetween(0.3, 0.9) * len * 1e4) / 1e4;
    const tabLength = Math.round(chord * fBetween(0.2, 0.9) * 1e4) / 1e4;
    return [
      {
        type: 'freeformfinset',
        id: id('freeformfinset'),
        finCount: 3,
        points: [
          [0, 0],
          [Math.round(chord * fBetween(0.1, 0.6) * 1e4) / 1e4, Math.round(fBetween(0.01, 0.05) * 1e4) / 1e4],
          [chord, vChance(0.3) ? round4(vBetween(0.001, 0.005)) : 0],
        ],
        cant: minRadius > 0 ? cantFor(chord, minRadius) : 0,
        thickness: 0.003,
        tabHeight: 0.2,
        tabLength,
        tabOffsetMethod: fPick(['top', 'middle', 'bottom']),
        tabOffset: Math.round(fBetween(-0.2, 0.2) * (chord - tabLength) * 1e5) / 1e5,
        position: fPick([
          { method: 'top', offset: Math.round(fBetween(0, len - chord) * 1e4) / 1e4 },
          { method: 'bottom', offset: 0 },
          { method: 'middle', offset: 0 },
        ]),
      } as unknown as ComponentNode,
    ];
  };

  const wall = (node: Record<string, unknown>) => {
    if (chance(0.2)) node['filled'] = true;
    else node['thickness'] = Math.round(between(0.0005, 0.003) * 1e5) / 1e5;
  };

  const nose = (): ComponentNode => {
    const aft = radius();
    const len = Math.round(between(0.05, 0.3) * 1e4) / 1e4;
    const node: Record<string, unknown> = {
      type: 'nosecone',
      id: id('nosecone'),
      shape: pick(SHAPES),
      length: len,
      aftRadius: aft,
      aftRadiusAuto: chance(0.4),
      flipped: chance(0.2),
    };
    wall(node);
    shapeExtras(node);
    node['children'] = [...freeformFins(len, 0), ...(!node['filled'] && chance(0.4) ? internals(aft, len, false) : [])];
    return node as unknown as ComponentNode;
  };
  const tube = (): ComponentNode => {
    const outer = radius();
    const len = Math.round(between(0.1, 0.5) * 1e4) / 1e4;
    const node: Record<string, unknown> = {
      type: 'bodytube',
      id: id('bodytube'),
      length: len,
      outerRadius: outer,
      outerRadiusAuto: chance(0.4),
    };
    wall(node);
    node['children'] = [...fins(len, outer), ...(node['filled'] ? [] : internals(outer, len, true))];
    return node as unknown as ComponentNode;
  };
  const transition = (): ComponentNode => {
    const fore = radius();
    const aft = radius();
    const len = Math.round(between(0.03, 0.15) * 1e4) / 1e4;
    const node: Record<string, unknown> = {
      type: 'transition',
      id: id('transition'),
      shape: pick(SHAPES),
      length: len,
      foreRadius: fore,
      aftRadius: aft,
      foreRadiusAuto: chance(0.4),
      aftRadiusAuto: chance(0.4),
    };
    wall(node);
    shapeExtras(node);
    node['children'] = [
      ...freeformFins(len, Math.min(fore, aft)),
      ...(!node['filled'] && chance(0.4) ? internals(Math.max(fore, aft), len, false) : []),
    ];
    return node as unknown as ComponentNode;
  };
  const axial = () => (chance(0.65) ? tube() : transition());

  const sustainer = [nose()];
  for (let i = 0, k = 1 + Math.floor(r() * 3); i < k; i++) sustainer.push(axial());
  const stages: ComponentNode[] = [{ type: 'stage', id: id('stage'), children: sustainer } as unknown as ComponentNode];
  if (chance(0.4)) {
    const booster: ComponentNode[] = [];
    for (let i = 0, k = 1 + Math.floor(r() * 2); i < k; i++) booster.push(axial());
    stages.push({ type: 'stage', id: id('stage'), children: booster } as unknown as ComponentNode);
  }
  return { components: stages } as unknown as RocketTree;
}

// Lugs and rail buttons re-read their tube on every change (`componentChanged`), reordering automatic evaluation.
function withExtras(tree: RocketTree, seed: number): RocketTree {
  const r = rng(seed + 0x2545f491);
  const chance = (p: number) => r() < p;
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  let n = 0;
  const id = (type: string) => `${type}x${++n}`;
  const along = (len: number, partLen: number) =>
    pick([
      { method: 'top', offset: round(between(0, Math.max(len - partLen, 0))) },
      { method: 'bottom', offset: -round(between(0, Math.max(len - partLen, 0))) },
      { method: 'middle', offset: 0 },
    ]);
  const visit = (node: ComponentNode): ComponentNode => {
    const kids = (node.children ?? []).map(visit);
    const out: Record<string, unknown> = { ...node };
    const len = (node['length'] as number | undefined) ?? 0;
    const filled = node['filled'] === true;
    if (node.type === 'innertube' && chance(0.4)) {
      out['cluster'] = pick(['double', '3-ring', '4-ring']);
      out['clusterScale'] = round(between(1, 1.5));
    }
    if (node.type === 'bodytube') {
      if (chance(0.3)) {
        const lugLen = round(between(0.02, 0.06));
        kids.push({
          type: 'launchlug',
          id: id('launchlug'),
          length: lugLen,
          outerRadius: 0.003,
          thickness: 0.0003,
          position: along(len, lugLen),
        } as unknown as ComponentNode);
      }
      if (chance(0.3)) {
        kids.push({
          type: 'railbutton',
          id: id('railbutton'),
          outerDiameter: 0.0097,
          instanceCount: 2,
          instanceSeparation: round(between(0.02, 0.1)),
          position: { method: 'top', offset: round(between(0, len * 0.5)) },
        } as unknown as ComponentNode);
      }
    }
    if ((node.type === 'bodytube' || node.type === 'nosecone' || node.type === 'transition') && !filled) {
      if (chance(0.35)) {
        const massLen = round(between(0.01, Math.max(0.011, len * 0.4)));
        kids.push({
          type: 'masscomponent',
          id: id('masscomponent'),
          mass: 0.05,
          length: massLen,
          radiusAuto: true,
          radius: 0.005,
          position: along(len, massLen),
        } as unknown as ComponentNode);
      }
    }
    const shoulder = (prefix: string, autoKey: string) => {
      if (!chance(0.4)) return;
      out[`${prefix}Length`] = round(between(0.01, 0.05));
      out[`${prefix}Thickness`] = 0.001;
      out[`${prefix}Radius`] = round(between(0.008, 0.04));
      if (chance(0.5)) out[autoKey] = true;
    };
    if (node.type === 'nosecone') shoulder('shoulder', 'shoulderAuto');
    if (node.type === 'transition') {
      shoulder('foreShoulder', 'foreShoulderAuto');
      shoulder('aftShoulder', 'aftShoulderAuto');
    }
    if (kids.length) out['children'] = kids;
    return out as unknown as ComponentNode;
  };
  return { ...tree, components: tree.components.map(visit) };
}

// The kernel measures `absolute` from the rocket's origin whatever the parent (`RocketComponent.setAxialOffset`).
function withAbsolutes(tree: RocketTree, seed: number): RocketTree {
  const r = rng(seed + 0x68e31da4);
  const frames = axialFrames(tree);
  const visit = (node: ComponentNode, parent: ComponentNode | null): ComponentNode => {
    const children = node.children?.map((c) => visit(c, node));
    const frame = parent?.id ? frames.get(parent.id) : undefined;
    const placed = node.position && frame && r() < 0.35;
    return {
      ...node,
      ...(children ? { children } : {}),
      ...(placed ? { position: rebasePosition(positionOf(node), 'absolute', axialLength(node), frame) } : {}),
    };
  };
  return { ...tree, components: tree.components.map((c) => visit(c, null)) };
}

const CHAIN_TYPES: ReadonlySet<string> = new Set(['stage', 'nosecone', 'bodytube', 'transition']);

const UNREAD_STATIONS: ReadonlySet<string> = new Set([
  'launchlug',
  'railbutton',
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
  'tubefinset',
  'tubecoupler',
  'bulkhead',
  'parachute',
  'streamer',
  'shockcord',
  'masscomponent',
]);

// Only parts whose station no other rule reads lose the `position` key.
function withPlacements(tree: RocketTree, seed: number): RocketTree {
  const r = rng(seed + 0x3c6ef372);
  const chance = (p: number) => r() < p;
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  const angle = () => round(between(-2 * Math.PI, 2 * Math.PI));
  const visit = (node: ComponentNode): ComponentNode => {
    const out: Record<string, unknown> = { ...node };
    if (node.children) out['children'] = node.children.map(visit);
    switch (node.type) {
      case 'launchlug':
        if (chance(0.6)) out['instanceCount'] = pick([2, 3]);
        if (chance(0.5)) out['instanceSeparation'] = round(between(0, 0.08));
        break;
      case 'railbutton':
        if (chance(0.4)) delete out['instanceSeparation'];
        break;
      case 'podset':
      case 'parallelstage':
        if (chance(0.6)) out['angleOffset'] = angle();
        break;
      case 'innertube':
        if (chance(0.4)) {
          out['radialPosition'] = round(between(0, 0.01));
          out['radialDirection'] = angle();
        }
        if (node['cluster'] !== undefined && chance(0.6)) out['clusterRotation'] = angle();
        break;
      case 'tubefinset':
        if (chance(0.5)) out['rotation'] = angle();
        break;
      case 'freeformfinset':
        if (chance(0.4)) {
          const dx = round(between(-0.05, 0.05));
          const dy = round(between(-0.03, 0.03));
          out['points'] = (node['points'] as Pt[]).map(([x, y]) => [x + dx, y + dy]);
        }
        break;
    }
    const tabbed = Number(node['tabHeight']) > 0 && Number(node['tabLength']) > 0;
    if (tabbed && chance(0.4)) {
      // The tab's front from the fin's front, as `AxialMethod.getAsPosition` reads its old method.
      const pts = node['points'] as Pt[] | undefined;
      const chord = pts ? pts[pts.length - 1]![0] - pts[0]![0] : Number(node['rootChord']);
      const len = Number(node['tabLength']);
      const offset = Number(node['tabOffset'] ?? 0);
      const old = typeof node['tabOffsetMethod'] === 'string' ? node['tabOffsetMethod'] : 'middle';
      const front = old === 'top' ? offset : old === 'bottom' ? offset + (chord - len) : offset + (chord - len) / 2;
      const method = pick(['absolute', 'after']);
      out['tabOffsetMethod'] = method;
      out['tabOffset'] = method === 'after' ? front - chord : front;
    }
    if (node.type === 'bodytube' && out['children']) {
      out['children'] = (out['children'] as ComponentNode[]).map((kid) => {
        if (!kid.position || !UNREAD_STATIONS.has(kid.type) || !chance(0.2)) return kid;
        const bare: Record<string, unknown> = { ...kid };
        delete bare['position'];
        return bare as unknown as ComponentNode;
      });
    }
    return out as unknown as ComponentNode;
  };
  return { ...tree, components: tree.components.map(visit) };
}

const ASSEMBLY_DESIGNS = 200;

// The kernel counts an on-axis assembly as in line, so an automatic tube's neighbor can sit across one.
function generateAssemblies(seed: number): RocketTree {
  const r = rng(seed + 0x5bd1e995);
  const chance = (p: number) => r() < p;
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  let n = 0;
  const id = (type: string) => `${type}${++n}`;
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  const radius = () => round(between(0.01, 0.05));
  const at = { method: 'top', offset: 0 };
  type Part = Record<string, unknown>;

  const assembly = (depth: number, parentLen: number, parentR: number, parentAuto: boolean): Part => {
    const radiusMethod = pick(['relative', 'relative', 'surface', 'free', 'free', 'coaxial']);
    const radiusOffset =
      radiusMethod === 'free'
        ? pick([0, 0, 0.04])
        : radiusMethod === 'relative' && !parentAuto && chance(0.4)
          ? -parentR
          : pick([0, 0.01]);
    const children = chain(depth + 1, 1 + Math.floor(r() * 3));
    const len = children.reduce((s, c) => s + (c['length'] as number), 0);
    return {
      type: chance(0.6) ? 'podset' : 'parallelstage',
      id: id('assembly'),
      instanceCount: 1 + Math.floor(r() * 3),
      radiusMethod,
      radiusOffset,
      angleOffset: 0,
      position: pick([
        { method: 'bottom', offset: 0 },
        { method: 'bottom', offset: 0 },
        { method: 'top', offset: 0 },
        { method: 'top', offset: 0 },
        { method: 'middle', offset: 0 },
        { method: 'top', offset: round(r() * parentLen) },
        { method: 'bottom', offset: -round(r() * parentLen) },
        { method: 'top', offset: -round(r() * len) },
      ]),
      children,
    };
  };
  const inside = (depth: number, len: number, outer: number, auto: boolean): Part[] => {
    const kids: Part[] = [];
    if (chance(0.25)) {
      kids.push({
        type: 'trapezoidfinset',
        id: id('trapezoidfinset'),
        finCount: 3,
        rootChord: 0.05,
        tipChord: 0.03,
        sweep: 0.01,
        height: 0.05,
        thickness: 0.003,
        ...(chance(0.5) ? { tabHeight: 0.2, tabLength: 0.02, tabOffsetMethod: 'middle', tabOffset: 0 } : {}),
        position: at,
      });
    }
    if (chance(0.2)) {
      kids.push({
        type: 'tubecoupler',
        id: id('tubecoupler'),
        length: 0.05,
        thickness: 0.001,
        outerRadiusAuto: true,
        outerRadius: 0.01,
        position: at,
      });
    }
    if (chance(0.15)) {
      kids.push({
        type: 'launchlug',
        id: id('launchlug'),
        length: 0.05,
        outerRadius: 0.003,
        thickness: 0.0003,
        position: at,
      });
    }
    const count = depth === 0 ? (chance(0.6) ? 1 + Math.floor(r() * 2) : 0) : depth === 1 && chance(0.15) ? 1 : 0;
    for (let i = 0; i < count; i++) {
      kids.splice(Math.floor(r() * (kids.length + 1)), 0, assembly(depth, len, outer, auto));
    }
    return kids;
  };
  const part = (depth: number): Part => {
    const x = r();
    if (x < 0.65) {
      const outerRadius = radius();
      const outerRadiusAuto = chance(0.6);
      const length = round(between(0.1, 0.4));
      return {
        type: 'bodytube',
        id: id('bodytube'),
        length,
        outerRadius,
        outerRadiusAuto,
        thickness: 0.001,
        children: inside(depth, length, outerRadius, outerRadiusAuto),
      };
    }
    if (x < 0.88) {
      return {
        type: 'transition',
        id: id('transition'),
        shape: 'conical',
        length: 0.05,
        foreRadius: radius(),
        aftRadius: radius(),
        foreRadiusAuto: chance(0.4),
        aftRadiusAuto: chance(0.4),
        thickness: 0.001,
      };
    }
    return {
      type: 'nosecone',
      id: id('nosecone'),
      shape: 'ogive',
      length: 0.1,
      aftRadius: radius(),
      aftRadiusAuto: chance(0.5),
      flipped: depth > 0 ? chance(0.5) : true,
      thickness: 0.002,
    };
  };
  const chain = (depth: number, k: number): Part[] => Array.from({ length: k }, () => part(depth));

  const sustainer: Part[] = [
    {
      type: 'nosecone',
      id: id('nosecone'),
      shape: 'ogive',
      length: 0.1,
      aftRadius: radius(),
      aftRadiusAuto: chance(0.5),
      thickness: 0.002,
    },
    ...chain(0, 1 + Math.floor(r() * 4)),
  ];
  const stages: Part[] = [{ type: 'stage', id: id('stage'), children: sustainer }];
  if (chance(0.4)) stages.push({ type: 'stage', id: id('stage'), children: chain(0, 1 + Math.floor(r() * 3)) });
  return { components: stages } as unknown as RocketTree;
}

// A tube remembers its last source (`BodyTube.refComp`), so automatic radii depend on evaluation order.
const CHAIN_DESIGNS: Record<string, () => RocketTree> = (() => {
  type Part = Record<string, unknown>;
  const stages = (...rows: Part[][]) =>
    ({
      components: rows.map((children, k) => ({ type: 'stage', id: `stage${k}`, children })),
    }) as unknown as RocketTree;
  const nose = (id: string, aftRadius: number, extra: Part = {}): Part => ({
    type: 'nosecone',
    id,
    shape: 'ogive',
    length: 0.1,
    aftRadius,
    thickness: 0.002,
    ...extra,
  });
  const tube = (id: string, outerRadius: number): Part => ({
    type: 'bodytube',
    id,
    length: 0.3,
    outerRadius,
    thickness: 0.001,
  });
  const auto = (id: string, children: Part[] = []): Part => ({ ...tube(id, 0.02), outerRadiusAuto: true, children });
  const transition = (id: string, extra: Part): Part => ({
    type: 'transition',
    id,
    shape: 'conical',
    length: 0.05,
    foreRadius: 0.03,
    aftRadius: 0.01,
    thickness: 0.001,
    ...extra,
  });
  const at = { method: 'top', offset: 0 };
  const coupler = (id: string): Part => ({
    type: 'tubecoupler',
    id,
    length: 0.05,
    thickness: 0.001,
    outerRadius: 0.01,
    outerRadiusAuto: true,
    position: at,
  });
  const fins = (id: string, tabbed: boolean): Part => ({
    type: 'trapezoidfinset',
    id,
    finCount: 3,
    rootChord: 0.05,
    tipChord: 0.03,
    sweep: 0.01,
    height: 0.05,
    thickness: 0.003,
    ...(tabbed ? { tabHeight: 0.2, tabLength: 0.02, tabOffsetMethod: 'middle', tabOffset: 0 } : {}),
    position: at,
  });
  const lug = (id: string): Part => ({
    type: 'launchlug',
    id,
    length: 0.05,
    outerRadius: 0.003,
    thickness: 0.0003,
    position: at,
  });
  const autoNose = () => nose('nose', 0.02, { aftRadiusAuto: true });
  const hung = (id: string, outerRadius: number, children: Part[]): Part => ({ ...tube(id, outerRadius), children });
  const short = (part: Part): Part => ({ ...part, length: 0.1 });
  const pod = (
    id: string,
    radiusMethod: string,
    radiusOffset: number,
    method: string,
    children: Part[],
    extra: Part = {},
  ) => ({
    type: 'podset',
    id,
    instanceCount: 2,
    radiusMethod,
    radiusOffset,
    angleOffset: 0,
    position: { method, offset: 0 },
    children,
    ...extra,
  });
  const podRun = (instanceCount: number): Part =>
    pod(
      'pod',
      'free',
      0.05,
      'bottom',
      [
        nose('pn', 0.01, { aftRadiusAuto: true }),
        ...Array.from({ length: 12 }, (_, i) => short(auto(`t${i}`, [coupler(`c${i}`), fins(`f${i}`, false)]))),
        short(tube('end', 0.0237)),
      ],
      { instanceCount },
    );
  return {
    // The bundled dual-parachute-deployment airframe; desktop flies every tube at 28.3 mm.
    'dual-parachute-deployment airframe, an automatic base and a run of automatic tubes': () =>
      stages([
        nose('n', 0.028321, { aftRadiusAuto: true }),
        { ...tube('t1', 0.025), outerRadiusAuto: true },
        { ...tube('t2', 0.028321), outerRadiusAuto: true, children: [coupler('t2c')] },
        tube('t3', 0.028321),
        { ...tube('t4', 0.028321), outerRadiusAuto: true },
      ]),
    // Each pass corrects one more tube from the fixed end; desktop flies all at 23.7 mm.
    'a run of eight automatic tubes, each with an automatic coupler': () =>
      stages([
        nose('n', 0.02, { aftRadiusAuto: true }),
        ...Array.from({ length: 8 }, (_, i) => auto(`r${i}`, [coupler(`rc${i}`)])),
        tube('end', 0.0237),
      ]),
    'generated airframe, two automatic tubes between an automatic base and the next stage': () =>
      ({
        components: [
          {
            type: 'stage',
            id: 'stage11',
            children: [
              {
                ...nose('nosecone1', 0.0129, { aftRadiusAuto: true }),
                shape: 'haack',
                length: 0.1294,
                thickness: 0.00191,
                children: [
                  {
                    type: 'freeformfinset',
                    id: 'freeformfinset2',
                    finCount: 3,
                    points: [
                      [0, 0],
                      [0.0229, 0.0343],
                      [0.0961, 0],
                    ],
                    thickness: 0.003,
                    tabHeight: 0.2,
                    tabLength: 0.0444,
                    tabOffsetMethod: 'middle',
                    tabOffset: 0.00719,
                    position: { method: 'top', offset: 0.0022 },
                  },
                ],
              },
              {
                type: 'bodytube',
                id: 'bodytube3',
                length: 0.4988,
                outerRadius: 0.0255,
                outerRadiusAuto: true,
                thickness: 0.00256,
                children: [
                  {
                    type: 'innertube',
                    id: 'innertube4',
                    length: 0.1673,
                    outerRadius: 0.0092,
                    thickness: 0.0005,
                    position: { method: 'top', offset: 0.2965 },
                  },
                  {
                    type: 'centeringring',
                    id: 'centeringring5',
                    length: 0.005,
                    outerRadiusAuto: true,
                    innerRadiusAuto: true,
                    outerRadius: 0.02295,
                    innerRadius: 0.00765,
                    position: { method: 'top', offset: 0.0101 },
                  },
                ],
              },
              {
                type: 'bodytube',
                id: 'bodytube6',
                length: 0.1054,
                outerRadius: 0.0165,
                outerRadiusAuto: true,
                thickness: 0.00268,
                children: [
                  {
                    type: 'innertube',
                    id: 'innertube7',
                    length: 0.0834,
                    outerRadius: 0.005,
                    thickness: 0.0005,
                    position: { method: 'top', offset: 0.0123 },
                  },
                  {
                    type: 'centeringring',
                    id: 'centeringring8',
                    length: 0.005,
                    outerRadiusAuto: true,
                    innerRadiusAuto: false,
                    outerRadius: 0.01485,
                    innerRadius: 0.00495,
                    position: { method: 'top', offset: 0.019 },
                  },
                  {
                    type: 'bulkhead',
                    id: 'bulkhead9',
                    length: 0.004,
                    outerRadiusAuto: true,
                    outerRadius: 0.01485,
                    position: { method: 'top', offset: 0.0796 },
                  },
                  {
                    type: 'tubecoupler',
                    id: 'tubecoupler10',
                    length: 0.0316,
                    thickness: 0.001,
                    outerRadiusAuto: true,
                    outerRadius: 0.01485,
                    position: { method: 'top', offset: 0.0797 },
                  },
                ],
              },
            ],
          },
          {
            type: 'stage',
            id: 'stage21',
            children: [
              {
                type: 'bodytube',
                id: 'bodytube12',
                length: 0.2223,
                outerRadius: 0.0237,
                thickness: 0.00171,
                children: [
                  {
                    type: 'parachute',
                    id: 'parachute13',
                    diameter: 0.5,
                    cd: 0.8,
                    length: 0.03,
                    radiusAuto: true,
                    radius: 0.01185,
                    position: { method: 'top', offset: 0.1344 },
                  },
                ],
              },
              {
                type: 'bodytube',
                id: 'bodytube14',
                length: 0.2537,
                outerRadius: 0.0474,
                outerRadiusAuto: true,
                thickness: 0.0018,
                children: [
                  {
                    ...fins('trapezoidfinset15', true),
                    rootChord: 0.1622,
                    tipChord: 0.0811,
                    sweep: 0.04866,
                    tabLength: 0.0773,
                    tabOffsetMethod: 'top',
                    position: { method: 'top', offset: 0.0616 },
                  },
                  {
                    type: 'innertube',
                    id: 'innertube16',
                    length: 0.0842,
                    outerRadius: 0.0145,
                    thickness: 0.0005,
                    position: { method: 'top', offset: 0.1571 },
                    children: [
                      {
                        type: 'engineblock',
                        id: 'engineblock17',
                        length: 0.005,
                        thickness: 0.002,
                        outerRadiusAuto: true,
                        outerRadius: 0.01305,
                        position: at,
                      },
                    ],
                  },
                  {
                    type: 'bulkhead',
                    id: 'bulkhead18',
                    length: 0.004,
                    outerRadiusAuto: true,
                    outerRadius: 0.04266,
                    position: { method: 'top', offset: 0.0423 },
                  },
                  {
                    type: 'tubecoupler',
                    id: 'tubecoupler19',
                    length: 0.0761,
                    thickness: 0.001,
                    outerRadiusAuto: true,
                    outerRadius: 0.04266,
                    position: { method: 'top', offset: 0.0959 },
                  },
                  {
                    type: 'tubefinset',
                    id: 'tubefinset20',
                    finCount: 7,
                    length: 0.08,
                    thickness: 0.0005,
                    outerRadiusAuto: true,
                    outerRadius: 0.0237,
                    position: { method: 'bottom', offset: 0 },
                  },
                ],
              },
            ],
          },
        ],
      }) as unknown as RocketTree,
    'two automatic tubes': () => stages([auto('a'), auto('b')]),
    'fixed nose, two automatic tubes': () => stages([nose('nose', 0.031), auto('a'), auto('b')]),
    'fixed tube, automatic tube, automatic tube with a coupler': () =>
      stages([tube('a', 0.03), auto('b'), auto('c', [coupler('cp')])]),
    'automatic base, two automatic tubes, fixed tube in the next stage': () =>
      stages([autoNose(), auto('a'), auto('b')], [tube('c', 0.0237)]),
    'the same, the second tube holding a coupler': () =>
      stages([autoNose(), auto('a'), auto('b', [coupler('cp')])], [tube('c', 0.0237)]),
    'the same, the second tube holding tabbed fins': () =>
      stages([autoNose(), auto('a'), auto('b', [fins('f', true)])], [tube('c', 0.0237)]),
    'the same, the second tube holding a coupler and a launch lug': () =>
      stages([autoNose(), auto('a'), auto('b', [coupler('cp'), lug('l')])], [tube('c', 0.0237)]),
    'two automatic tubes, the second holding a coupler, fixed tube in the next stage': () =>
      stages([auto('a'), auto('b', [coupler('cp')])], [tube('c', 0.0237)]),
    'automatic base, three automatic tubes each holding a coupler, fixed tube': () =>
      stages([
        autoNose(),
        auto('a', [coupler('c1')]),
        auto('b', [coupler('c2')]),
        auto('c', [coupler('c3')]),
        tube('d', 0.0237),
      ]),
    'automatic base, twelve automatic tubes each holding a coupler and fins, fixed tube': () =>
      stages([
        autoNose(),
        ...Array.from({ length: 12 }, (_, i) => auto(`t${i}`, [coupler(`c${i}`), fins(`f${i}`, false)])),
        tube('end', 0.0237),
      ]),
    'transition with an automatic aft end, two automatic tubes, fixed tube': () =>
      stages([
        nose('nose', 0.03),
        transition('tr', { aftRadiusAuto: true }),
        auto('a'),
        auto('b', [coupler('cp')]),
        tube('c', 0.0237),
      ]),
    'transition automatic at both ends, automatic tube, fixed tube': () =>
      stages([
        nose('nose', 0.03),
        transition('tr', { foreRadiusAuto: true, aftRadiusAuto: true }),
        auto('a', [coupler('cp')]),
        tube('c', 0.0237),
      ]),
    'automatic base, two automatic tubes, flipped nose cone': () =>
      stages([autoNose(), auto('a'), auto('b', [coupler('cp')]), nose('tail', 0.015, { flipped: true })]),
    'fixed nose, automatic tube, flipped nose cone with an automatic base': () =>
      stages([nose('nose', 0.03), auto('a'), nose('tail', 0.02, { aftRadiusAuto: true, flipped: true })]),
    'coaxial pod at the bottom of a tube: its automatic tube follows that tube': () =>
      stages([nose('nose', 0.03), hung('a', 0.02, [pod('pod', 'coaxial', 0, 'bottom', [short(auto('p'))])])]),
    'pod at zero radius at the top of a tube: its automatic tube follows the part ahead of that tube': () =>
      stages([nose('nose', 0.03), hung('a', 0.02, [pod('pod', 'free', 0, 'top', [short(auto('p'))])])]),
    'pod placed against a tube at minus its radius: in line, as a coaxial one': () =>
      stages([nose('nose', 0.03), hung('a', 0.02, [pod('pod', 'relative', -0.02, 'bottom', [short(auto('p'))])])]),
    'pod off the axis: its automatic tube has nothing to follow': () =>
      stages([nose('nose', 0.03), hung('a', 0.02, [pod('pod', 'relative', 0, 'bottom', [short(auto('p'))])])]),
    'pod flush with the aft end of a tube: its wider last tube is the neighbor of the tube behind': () =>
      stages([
        nose('nose', 0.03),
        hung('a', 0.02, [pod('pod', 'coaxial', 0, 'bottom', [short(tube('q', 0.035))])]),
        auto('b'),
      ]),
    'pod flush with the fore end of a tube: its wider first tube is the neighbor of the tube ahead': () =>
      stages([autoNose(), auto('a'), hung('b', 0.02, [pod('pod', 'coaxial', 0, 'top', [short(tube('q', 0.035))])])]),
    'pod partway along a tube: the tube itself is the neighbor': () =>
      stages([
        nose('nose', 0.03),
        hung('a', 0.02, [pod('pod', 'coaxial', 0, 'middle', [short(tube('q', 0.035))])]),
        auto('b'),
      ]),
    'pod placed against an automatic tube, which it reads on every pass': () =>
      stages(
        [auto('a')],
        [auto('b', [pod('pod', 'surface', 0, 'top', [short(tube('p', 0.01))], { instanceCount: 3 })])],
        [tube('c', 0.0423)],
      ),
    'automatic tubes in a pod on an automatic tube, whose in-line check reads that tube': () =>
      stages(
        [
          autoNose(),
          auto('a', [pod('pod', 'relative', 0, 'bottom', [short(auto('p')), short(auto('p2', [coupler('cp')]))])]),
          auto('b', [coupler('cb')]),
        ],
        [tube('c', 0.0237)],
      ),
    'booster on an automatic tube, with a launch lug on the booster tube': () =>
      stages(
        [
          autoNose(),
          auto('a', [
            {
              ...pod('booster', 'surface', 0, 'bottom', [short(auto('p', [lug('l')])), short(tube('q', 0.01))]),
              type: 'parallelstage',
            },
          ]),
          auto('b', [coupler('cb')]),
        ],
        [tube('c', 0.0237)],
      ),
    'twelve automatic tubes in a pod of one': () => stages([nose('nose', 0.03), hung('a', 0.02, [podRun(1)])]),
    'twelve automatic tubes in a pod of three, each copy visited': () =>
      stages([nose('nose', 0.03), hung('a', 0.02, [podRun(3)])]),
  };
})();

// A listed rule that agrees also fails.
const KNOWN: Record<string, string> = {};

type Pt = [number, number];

function dedupe(pts: Pt[]): Pt[] {
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) <= 1e-12 && Math.abs(a[1] - b[1]) <= 1e-12;
  const out: Pt[] = [];
  for (const p of pts) if (!out.length || !same(out[out.length - 1]!, p)) out.push(p);
  while (out.length > 1 && same(out[0]!, out[out.length - 1]!)) out.pop();
  return out;
}

// Root points inside the tab span are dropped, as `getTabPointsWithRoot` does.
function kernelCutOutline(k: KernelGeometry): Pt[] | null {
  const pts = (xs: [number | null, number | null][] | undefined): Pt[] | null =>
    xs && xs.every(([x, y]) => typeof x === 'number' && typeof y === 'number') ? (xs as Pt[]) : null;
  const fin = pts(k.finPoints);
  const root = pts(k.rootPoints);
  if (!fin || !root) return null;
  const back = [...root].reverse();
  const tab = k.tabPoints ? pts(k.tabPoints) : undefined;
  if (tab === null) return null;
  if (!tab) return dedupe([...fin, ...back]);
  const x0 = tab[0]![0];
  const x1 = tab[3]![0];
  return dedupe([
    ...fin,
    ...back.filter(([x]) => x > x1),
    tab[3]!,
    tab[2]!,
    tab[1]!,
    tab[0]!,
    ...back.filter(([x]) => x < x0),
  ]);
}

function outlineMiss(app: Pt[] | null, kernel: Pt[] | null, tol: number): string | null {
  if (!app || !kernel) return `app ${app ? app.length : 'none'} points, kernel ${kernel ? kernel.length : 'none'}`;
  if (app.length !== kernel.length) return `${app.length} points against ${kernel.length}`;
  for (let i = 0; i < app.length; i++) {
    const [ax, ay] = app[i]!;
    const [kx, ky] = kernel[i]!;
    if (!(Math.abs(ax - kx) <= tol && Math.abs(ay - ky) <= tol)) {
      return `point ${i}: app (${ax.toFixed(6)}, ${ay.toFixed(6)}), kernel (${kx.toFixed(6)}, ${ky.toFixed(6)})`;
    }
  }
  return null;
}

const clippedProfile = (node: ComponentNode | null): boolean =>
  !!node &&
  (node.type === 'transition' || node.type === 'nosecone') &&
  node['clipped'] !== false &&
  ['ellipsoid', 'power', 'haack'].includes(String(node['shape']));

interface Miss {
  rule: string;
  design: string;
  part: string;
  app: number | string;
  kernel: number | string;
}

// `Transition.DEFAULT_RADIUS`: an automatic end with nothing to follow.
const KERNEL_AUTO_END = 0.025;

const close = (a: number | undefined, b: number | undefined) =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= TOL;

const TAU = 2 * Math.PI;

// Compared modulo a whole turn: a setter may wrap the angle (`MathUtil.reducePi`).
const sameAngle = (a: number | undefined, b: number | undefined): boolean => {
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  const d = (((a - b) % TAU) + TAU) % TAU;
  return Math.min(d, TAU - d) <= TOL;
};

// `getFinPoints` moves a canted freeform fin's end points onto the root, so such a fin has no span here.
function kernelSpan(node: ComponentNode, k: KernelGeometry): number | undefined {
  if (node.type !== 'freeformfinset') {
    const h = k.fields?.['height'];
    return typeof h === 'number' ? h : undefined;
  }
  if (typeof node['cant'] === 'number' && node['cant'] !== 0) return undefined;
  const pts = k.finPoints;
  if (!pts?.length || pts.some(([, y]) => typeof y !== 'number')) return undefined;
  let max = 0;
  for (const [, y] of pts) if (y! > max) max = y!;
  return max - Math.min(pts[pts.length - 1]![1]!, 0);
}

function radiiAt(edge: Pt[], x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < edge.length; i++) {
    const [x0, r0] = edge[i]!;
    if (Math.abs(x0 - x) <= TOL) out.push(r0);
    const next = edge[i + 1];
    if (next && x0 < x - TOL && next[0] > x + TOL) out.push(r0 + ((next[1] - r0) * (x - x0)) / (next[0] - x0));
  }
  return out;
}

// -1: two automatic ends following each other; 0: after a flipped cone's tip, or a ring with no parent bore.
function unresolvedIn(node: ComponentNode, k: KernelGeometry): boolean {
  const ends =
    node.type === 'nosecone'
      ? [Math.max(k.foreRadius ?? 0, k.aftRadius ?? 0)]
      : node.type === 'transition'
        ? [k.foreRadius, k.aftRadius]
        : node.type === 'bodytube' ||
            node.type === 'centeringring' ||
            node.type === 'bulkhead' ||
            node.type === 'tubecoupler' ||
            node.type === 'engineblock'
          ? [k.outerRadius]
          : [];
  return ends.some((v) => typeof v === 'number' && v <= 0);
}

// An automatic-radius mass object keeps its packed volume, so its length is checked against `stored` (unresolved).
function compare(
  design: string,
  tree: RocketTree,
  kernel: Map<string, KernelGeometry>,
  stored?: Map<string, KernelGeometry>,
): { misses: Miss[]; unresolved: number; checked: Map<string, number> } {
  const misses: Miss[] = [];
  const skip = new Set<string>();
  let unresolved = 0;
  const noSize = new Set<string>();
  let id = '';
  const checked = new Map<string, number>();
  const frames = axialFrames(tree);
  const note = (rule: string, app: unknown, k: unknown, same = close): boolean => {
    checked.set(rule, (checked.get(rule) ?? 0) + 1);
    const a = typeof app === 'number' ? app : NaN;
    const kn = typeof k === 'number' ? k : undefined;
    if (same(a, kn)) return true;
    misses.push({ rule, design, part: id, app: a, kernel: kn ?? 'none' });
    return false;
  };
  const check = (rule: string, app: unknown, k: unknown) => {
    if (!note(rule, app, k)) skip.add(id);
  };
  // The kernel places a part with no `position` key by its constructor's method.
  const unplaced = new Set<string>();
  const view = rocketSideView(tree).body;
  const edge = view.slice(0, view.length / 2).map(([x, r]): Pt => [x / 1000, r / 1000]);
  const chainIds = new Set(axialChain(tree).map((n) => n.id));
  const finSets = new Set<string>();
  const overturned = new Set<string>();
  for (const visit of walkTree(tree)) {
    const { node, parent, parentId } = visit;
    id = visit.id;
    if ((!('position' in node) && !CHAIN_TYPES.has(node.type)) || unplaced.has(parentId)) unplaced.add(id);
    const k = kernel.get(id);
    if (!k) continue;
    const f = k.fields;
    if (parent && skip.has(parentId)) {
      skip.add(id);
      if (noSize.has(parentId)) noSize.add(id);
      continue;
    }
    if (unresolvedIn(node, k)) {
      unresolved += 1;
      noSize.add(id);
      skip.add(id);
      continue;
    }
    const auto = (flag: string) => node[flag] === true;
    const keyless = unplaced.has(id) ? ', no position key' : '';
    const inside = `${keyless}${parent ? ` in a ${parent.type}` : ''}`;
    switch (node.type) {
      case 'nosecone': {
        // The base is the aft end, or the fore end when the cone is turned round.
        const base = Math.max(k.foreRadius ?? 0, k.aftRadius ?? 0);
        check(
          auto('aftRadiusAuto') ? 'nose cone automatic base radius' : 'nose cone base radius',
          node['aftRadius'],
          base,
        );
        // Desktop holds a flipped cone's stated shoulder to its resolved base (`settleFlippedShoulders`).
        if (f && Number(node['shoulderLength']) > 0) {
          const turned = node['flipped'] === true ? 'flipped ' : '';
          note(`${turned}nose cone shoulder radius`, node['shoulderRadius'], f['shoulderRadius']);
        }
        break;
      }
      case 'transition':
        check(
          auto('foreRadiusAuto') ? 'transition automatic fore radius' : 'transition fore radius',
          node['foreRadius'],
          k.foreRadius,
        );
        check(
          auto('aftRadiusAuto') ? 'transition automatic aft radius' : 'transition aft radius',
          node['aftRadius'],
          k.aftRadius,
        );
        for (const end of ['fore', 'aft'] as const) {
          if (!f || !(Number(node[`${end}ShoulderLength`]) > 0)) continue;
          const wide =
            auto(`${end}RadiusAuto`) && Number(k[`${end}Radius`]) > KERNEL_AUTO_END
              ? ', automatic end wider than 25 mm'
              : '';
          note(`transition ${end} shoulder radius${wide}`, node[`${end}ShoulderRadius`], f[`${end}ShoulderRadius`]);
        }
        break;
      case 'bodytube':
        check(
          auto('outerRadiusAuto') ? 'body tube automatic radius' : 'body tube radius',
          node['outerRadius'],
          k.outerRadius,
        );
        break;
      case 'centeringring':
        check(`centering ring automatic outer radius${inside}`, node['outerRadius'], k.outerRadius);
        if (auto('innerRadiusAuto'))
          check(`centering ring automatic bore${inside}`, node['innerRadius'], k.innerRadius);
        break;
      case 'bulkhead':
        check(`bulkhead automatic outer radius${inside}`, node['outerRadius'], k.outerRadius);
        break;
      case 'tubecoupler':
        check(`tube coupler automatic outer radius${inside}`, node['outerRadius'], k.outerRadius);
        break;
      case 'engineblock':
        check(`engine block automatic outer radius${inside}`, node['outerRadius'], k.outerRadius);
        break;
      case 'tubefinset': {
        const few = Number(node['finCount']) < 3 ? ', fewer than 3' : '';
        check(
          auto('outerRadiusAuto') ? `tube fin automatic radius${few}` : 'tube fin radius',
          node['outerRadius'],
          k.outerRadius,
        );
        if (f) note(`tube fin rotation${inside}`, num(node, 'rotation', 0), f['rotation'], sameAngle);
        break;
      }
      case 'innertube': {
        const app = placementOffsets(node, innerTubeExtent(node).radius);
        const kernel = k.clusterPoints ?? [];
        note(`innertube cluster tube count${inside}`, app.length, kernel.length);
        const turnedOff =
          clusterCount(node['cluster'] as string | undefined) > 1 &&
          num(node, 'radialPosition', 0) > 0 &&
          num(node, 'clusterRotation', 0) !== 0;
        const rule = `innertube cluster tube position${turnedOff ? ', cluster turned off the axis' : ''}${inside}`;
        app.forEach((p, i) => {
          check(rule, p.y, kernel[i]?.[0]);
          check(rule, p.z, kernel[i]?.[1]);
        });
        if (!f) break;
        note(`innertube radial position${inside}`, num(node, 'radialPosition', 0), f['radialPosition']);
        note(`innertube radial direction${inside}`, num(node, 'radialDirection', 0), f['radialDirection'], sameAngle);
        if (clusterCount(node['cluster'] as string | undefined) > 1) {
          note(`innertube cluster rotation${inside}`, num(node, 'clusterRotation', 0), f['clusterRotation'], sameAngle);
        }
        break;
      }
      case 'launchlug':
      case 'railbutton': {
        if (!f) break;
        const copies = lineInstances(node);
        note(`${node.type} copies${inside}`, copies.length, f['instanceCount']);
        if (copies.length > 1) {
          const stated = node['instanceSeparation'] === undefined ? ', no spacing key' : '';
          const spacing = positionOf(copies[1]!).offset - positionOf(copies[0]!).offset;
          note(`${node.type} copy spacing${stated}${inside}`, spacing, f['instanceSeparation']);
        }
        break;
      }
      case 'trapezoidfinset':
      case 'ellipticalfinset':
      case 'freeformfinset': {
        const where = parent?.['flipped'] === true ? `${keyless} in a flipped nosecone` : inside;
        check(`fin tab depth limit${where}`, parentRadiusOf(tree, id), k.maxTabHeight);
        const mount = finMountOf(tree, id);
        const span = kernelSpan(node, k);
        if (span !== undefined) note(`${node.type} span${where}`, finSpan(node, mount), span);
        const method = node['tabOffsetMethod'];
        const tabBy = method === 'absolute' || method === 'after' ? `, offset ${method}` : '';
        const p0 = (node['points'] as Pt[] | undefined)?.[0];
        const moved = p0 && (p0[0] !== 0 || p0[1] !== 0) ? ', outline off the origin' : '';
        finSets.add(id);
        if ([...(k.finPoints ?? []), ...(k.rootPoints ?? [])].some(([x, y]) => x === null || y === null)) {
          overturned.add(id);
          break;
        }
        const tol = clippedProfile(parent) ? PROFILE_TOL : TOL;
        const canted = typeof node['cant'] === 'number' && node['cant'] !== 0 ? ', canted' : '';
        const pieces: [string, Pt[] | null, KernelGeometry['finPoints']][] = [
          [`${node.type} root points${canted}${where}`, finRootPoints(node, mount), k.rootPoints],
          [`${node.type} outline points${moved}${canted}${where}`, finOutlinePoints(node, mount), k.finPoints],
          [`${node.type} tab points${tabBy}${where}`, finTabPoints(node, mount), k.tabPoints],
        ];
        for (const [rule, app, kernelPts] of pieces) {
          if (!app && !kernelPts) continue;
          checked.set(rule, (checked.get(rule) ?? 0) + 1);
          const miss = outlineMiss(app, (kernelPts as Pt[] | undefined) ?? null, tol);
          if (miss) misses.push({ rule, design, part: `${id}, ${miss}`, app: 'points', kernel: 'points' });
        }
        const rule = `${node.type} cut outline${where}`;
        checked.set(rule, (checked.get(rule) ?? 0) + 1);
        const app = finCutContour(node, mount);
        const miss = outlineMiss(app ? dedupe(app) : null, kernelCutOutline(k), tol);
        if (miss) misses.push({ rule, design, part: `${id}, ${miss}`, app: 'outline', kernel: 'outline' });
        break;
      }
      case 'podset':
      case 'parallelstage': {
        if (f) {
          note(`${node.type} copies${inside}`, countOf(node, 'instanceCount', 2), f['instanceCount']);
          note(`${node.type} angle${inside}`, num(node, 'angleOffset', 0), f['angleOffset'], sameAngle);
        }
        const held = (node.children ?? []).some((c) => {
          const kc = kernel.get(c.id ?? '');
          return kc !== undefined && unresolvedIn(c, kc);
        });
        if (held) break;
        const parentR = assemblyParentRadius(parent);
        const method = typeof node['radiusMethod'] === 'string' ? node['radiusMethod'] : 'relative';
        check(
          `${node.type} radial distance, ${method}${inside}`,
          resolveAssemblyRadius(node, parentR),
          k.instanceRadius,
        );
        break;
      }
      case 'parachute':
        check(`parachute automatic packed radius${inside}`, node['radius'], k.radius);
        break;
      case 'streamer':
        check(`streamer automatic packed radius${inside}`, node['radius'], k.radius);
        break;
      case 'shockcord':
        check(`shock cord automatic packed radius${inside}`, node['radius'], k.radius);
        break;
      case 'masscomponent':
        check(`mass component automatic packed radius${inside}`, node['radius'], k.radius);
        break;
    }
    const packed: Record<string, string> = {
      parachute: 'parachute',
      masscomponent: 'mass component',
      streamer: 'streamer',
      shockcord: 'shock cord',
    };
    if (node.type in packed && auto('radiusAuto') && !skip.has(id)) {
      const label = packed[node.type]!;
      check(`${label} automatic packed length${inside}`, node['length'], k.settledLength);
      const s = stored?.get(id);
      if (s) check(`${label} automatic packed length from the stored size${inside}`, node['length'], s.settledLength);
    }
    // The cant turns a fin about its root midpoint (`FinSet.getInstanceOffsets`),
    // which puts its kernel position (length / 2)(1 - cos cant) aft.
    const cant = typeof node['cant'] === 'number' ? node['cant'] : 0;
    if (k.positionX !== undefined) {
      const absolute = positionOf(node).method === 'absolute' && node.position !== undefined;
      const rule = keyless
        ? `station of a part with no position key${parent ? ` in a ${parent.type}` : ''}`
        : `${node.type} station${absolute ? ', placed absolute' : ''}${cant !== 0 ? ', canted' : ''}${inside}`;
      checked.set(rule, (checked.get(rule) ?? 0) + 1);
      const start = frames.get(id)?.start;
      const station = k.positionX - (cant !== 0 ? (axialLength(node) / 2) * (1 - Math.cos(cant)) : 0);
      if (!close(start, station)) misses.push({ rule, design, part: id, app: start ?? NaN, kernel: station });
    }
    if ((node.type === 'nosecone' || node.type === 'transition') && k.profile && !skip.has(id)) {
      const len = k.length;
      const rule = node['flipped'] === true ? 'flipped nose cone profile' : `${node.type} profile`;
      for (let i = 0; i < k.profile.length; i++) {
        const x = (len * i) / (k.profile.length - 1);
        const kr = k.profile[i] ?? undefined;
        const ar = stationRadius(node, x);
        if (!(typeof kr === 'number' && Math.abs(ar - kr) <= PROFILE_TOL)) {
          misses.push({ rule, design, part: `${id} at x=${x.toFixed(4)}`, app: ar, kernel: kr ?? 'none' });
          break;
        }
      }
      const ends =
        node.type === 'nosecone'
          ? { fore: 0, aft: num(node, 'aftRadius', KERNEL_DEFAULTS.nosecone.aftRadius) }
          : profileEnds(node);
      const template = profileMm(node, ends.fore, ends.aft);
      const templateRule = `${node['flipped'] === true ? 'flipped ' : ''}${node.type} template profile`;
      checked.set(templateRule, (checked.get(templateRule) ?? 0) + 1);
      const top = template
        ? template.pts.slice(0, template.pts.length / 2).map(([x, y]): Pt => [x / 1000, (template.h / 2 - y) / 1000])
        : [];
      const want = node['flipped'] === true ? [...k.profile].reverse() : k.profile;
      for (let i = 0; i < want.length; i++) {
        const x = (len * i) / (want.length - 1);
        const kr = want[i] ?? undefined;
        const got = radiiAt(top, x);
        if (!(typeof kr === 'number' && got.some((r) => Math.abs(r - kr) <= PROFILE_TOL))) {
          misses.push({
            rule: templateRule,
            design,
            part: `${id} at x=${x.toFixed(4)}`,
            app: got.join(' or ') || 'none',
            kernel: kr ?? 'none',
          });
          break;
        }
      }
    }
    if (chainIds.has(id) && k.profile && k.positionX !== undefined && !skip.has(id)) {
      const rule = `side view ${node['flipped'] === true ? 'flipped ' : ''}${node.type} profile`;
      checked.set(rule, (checked.get(rule) ?? 0) + 1);
      for (let i = 0; i < k.profile.length; i++) {
        const x = k.positionX + (k.length * i) / (k.profile.length - 1);
        const kr = k.profile[i] ?? undefined;
        const got = radiiAt(edge, x);
        if (!(typeof kr === 'number' && got.some((r) => Math.abs(r - kr) <= PROFILE_TOL))) {
          misses.push({
            rule,
            design,
            part: `${id} at x=${x.toFixed(4)}`,
            app: got.join(' or ') || 'none',
            kernel: kr ?? 'none',
          });
          break;
        }
      }
    }
  }
  // The pre-run check refuses exactly the fin sets with NaN root points; a zero dimension is reported first.
  const blocker = designBlocker(withMountForCheck(tree));
  const refused = new Set(
    (blocker?.kind === 'finCant' ? blocker.fins : blocker === null ? [] : overturnedFins(tree)).map((f) => f.id),
  );
  for (const fin of finSets) {
    const where = overturned.has(fin) ? 'overturned' : 'on its body';
    checked.set(`fin set refused when ${where}`, (checked.get(`fin set refused when ${where}`) ?? 0) + 1);
    if (overturned.has(fin) !== refused.has(fin)) {
      misses.push({
        rule: `fin set refused when ${where}`,
        design,
        part: fin,
        app: refused.has(fin) ? 'refused' : 'flies',
        kernel: overturned.has(fin) ? 'NaN root' : 'root',
      });
    }
  }
  for (const bad of badDimensions(tree)) {
    if (noSize.has(bad.id ?? '')) continue;
    const node = walkTree(tree).find((w) => w.id === bad.id)?.node;
    const flag = node?.['filled'] === true ? 'filled ' : '';
    misses.push({
      rule: `run blocked on a ${flag}${bad.type} (${bad.field})`,
      design,
      part: bad.id ?? bad.type,
      app: 'blocked',
      kernel: 'builds',
    });
  }
  return { misses, unresolved, checked };
}

// '' is a nose cone's shoulder, at its base.
const SHOULDER_SIDES: Record<string, ('' | 'fore' | 'aft')[]> = { nosecone: [''], transition: ['fore', 'aft'] };
const SHOULDERS_PER_DESIGN = 3;

function shoulderSeedMisses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped
  engine: any,
  design: string,
  tree: RocketTree,
): { misses: Miss[]; checked: Map<string, number> } {
  const misses: Miss[] = [];
  const checked = new Map<string, number>();
  const length = 0.03;
  const sites = walkTree(tree)
    .flatMap(({ node, id, parent }) =>
      (SHOULDER_SIDES[node.type] ?? []).map((side) => ({
        node,
        id,
        side,
        inside: parent ? ` in a ${parent.type}` : '',
      })),
    )
    .slice(0, SHOULDERS_PER_DESIGN);
  for (const { node, id, side, inside } of sites) {
    const key = (k: string) => (side ? `${side}Shoulder${k}` : `shoulder${k}`);
    const bare = {
      [key('Length')]: 0,
      [key('Radius')]: 0,
      [key('Thickness')]: 0,
      [key('Capped')]: false,
      [key('Auto')]: false,
    };
    const replace = (n: ComponentNode): ComponentNode =>
      n.id === id ? { ...n, ...bare } : n.children ? { ...n, children: n.children.map(replace) } : n;
    const base = syncDerived({ ...tree, components: tree.components.map(replace) });
    engine.reset();
    const h = engine.buildRocket(JSON.stringify(base));
    const kernel = JSON.parse(engine.setShoulderLength(h, id, side, length)) as Record<string, unknown>;
    // The kernel seeds -1 less the wall here where the app seeds the resolved radius, so these are counted, not compared.
    if (typeof kernel[key('Radius')] === 'number' && (kernel[key('Radius')] as number) < 0) {
      checked.set(
        'shoulder seed from a neighbor with no radius',
        (checked.get('shoulder seed from a neighbor with no radius') ?? 0) + 1,
      );
      continue;
    }
    const app = findNode(updateNode(base, id, { [key('Length')]: length }), id)!;
    const what = `${node['flipped'] === true ? 'flipped ' : ''}${node.type}${side ? ` ${side}` : ''} shoulder seed`;
    for (const [field, same] of [
      ['Radius', close],
      ['Thickness', close],
      ['Capped', (a: unknown, b: unknown) => a === b],
    ] as const) {
      const rule = `${what} ${field.toLowerCase()}${inside}`;
      checked.set(rule, (checked.get(rule) ?? 0) + 1);
      const a = app[key(field)];
      const b = kernel['error'] ?? kernel[key(field)];
      if (!(same as (x: unknown, y: unknown) => boolean)(a, b)) {
        misses.push({ rule, design, part: id, app: String(a), kernel: String(b) });
      }
    }
  }
  return { misses, checked };
}

function withMountForCheck(tree: RocketTree): RocketTree {
  let done = false;
  const visit = (n: ComponentNode): ComponentNode => {
    if (!done && n.type === 'bodytube') {
      done = true;
      return { ...n, motorMount: true };
    }
    return n.children ? { ...n, children: n.children.map(visit) } : n;
  };
  return { ...tree, components: tree.components.map(visit) };
}

function report(misses: Miss[], designs: number): string[] {
  const byRule = new Map<string, Miss[]>();
  for (const m of misses) byRule.set(m.rule, [...(byRule.get(m.rule) ?? []), m]);
  return [...byRule.entries()]
    .filter(([rule]) => !(rule in KNOWN))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, ms]) => {
      const failed = new Set(ms.map((m) => m.design)).size;
      const e = ms[0]!;
      return `${rule}: ${failed} of ${designs} designs; e.g. ${e.design}, ${e.part}: app ${e.app}, kernel ${e.kernel}`;
    });
}

describe('app geometry matches the kernel', () => {
  it(`over ${DESIGNS} generated designs`, async () => {
    const engine = await loadEngine();
    const misses: Miss[] = [];
    let unresolved = 0;
    const checked = new Map<string, number>();
    for (let seed = 1; seed <= DESIGNS; seed++) {
      const generated = withPlacements(withAbsolutes(withExtras(generate(seed), seed), seed), seed);
      const stored = kernelGeometry(engine, generated);
      const tree = syncDerived(generated);
      const r = compare(`seed ${seed}`, tree, kernelGeometry(engine, tree, { fields: true }), stored);
      misses.push(...r.misses);
      unresolved += r.unresolved;
      for (const [rule, count] of r.checked) checked.set(rule, (checked.get(rule) ?? 0) + count);
      const grown = shoulderSeedMisses(engine, `seed ${seed}`, tree);
      misses.push(...grown.misses);
      for (const [rule, count] of grown.checked) checked.set(rule, (checked.get(rule) ?? 0) + count);
    }
    for (const rule of [
      'fin tab depth limit in a bodytube',
      'fin tab depth limit in a nosecone',
      'fin tab depth limit in a flipped nosecone',
      'fin tab depth limit in a transition',
      'launchlug station in a bodytube',
      'railbutton station in a bodytube',
      'mass component automatic packed radius in a bodytube',
      'mass component automatic packed radius in a nosecone',
      'mass component automatic packed radius in a transition',
      'parachute automatic packed length from the stored size in a bodytube',
      'mass component automatic packed length from the stored size in a bodytube',
      'mass component automatic packed length from the stored size in a nosecone',
      'mass component automatic packed length from the stored size in a transition',
      'centeringring station, placed absolute in a transition',
      'freeformfinset station, placed absolute in a nosecone',
      'engineblock station, placed absolute in a innertube',
      'trapezoidfinset cut outline in a bodytube',
      'ellipticalfinset cut outline in a bodytube',
      'freeformfinset cut outline in a bodytube',
      'freeformfinset cut outline in a nosecone',
      'freeformfinset cut outline in a flipped nosecone',
      'freeformfinset cut outline in a transition',
      'trapezoidfinset root points, canted in a bodytube',
      'ellipticalfinset root points, canted in a bodytube',
      'freeformfinset root points, canted in a bodytube',
      'freeformfinset root points, canted in a transition',
      'freeformfinset outline points in a nosecone',
      'freeformfinset outline points in a transition',
      'trapezoidfinset tab points in a bodytube',
      'freeformfinset tab points in a nosecone',
      'freeformfinset tab points in a flipped nosecone',
      'freeformfinset tab points in a transition',
      'tube fin automatic radius',
      'tube fin automatic radius, fewer than 3',
      'tube fin radius',
      'streamer automatic packed radius in a bodytube',
      'streamer automatic packed length from the stored size in a bodytube',
      'shock cord automatic packed radius in a bodytube',
      'shock cord automatic packed length from the stored size in a bodytube',
      'transition fore shoulder radius, automatic end wider than 25 mm',
      'transition aft shoulder radius, automatic end wider than 25 mm',
      'launchlug copy spacing in a bodytube',
      'launchlug copy spacing, no spacing key in a bodytube',
      'railbutton copy spacing, no spacing key in a bodytube',
      'innertube radial direction in a bodytube',
      'innertube cluster rotation in a bodytube',
      'innertube cluster tube position in a bodytube',
      'innertube cluster tube position, cluster turned off the axis in a bodytube',
      'tube fin rotation in a bodytube',
      'freeformfinset outline points, outline off the origin in a bodytube',
      'freeformfinset outline points, outline off the origin in a nosecone',
      'freeformfinset outline points, outline off the origin in a transition',
      'trapezoidfinset tab points, offset absolute in a bodytube',
      'trapezoidfinset tab points, offset after in a bodytube',
      'freeformfinset tab points, offset absolute in a nosecone',
      'freeformfinset tab points, offset after in a transition',
      'station of a part with no position key in a bodytube',
      'trapezoidfinset span in a bodytube',
      'ellipticalfinset span in a bodytube',
      'freeformfinset span in a bodytube',
      'side view nosecone profile',
      'side view flipped nosecone profile',
      'side view transition profile',
      'side view bodytube profile',
      'nosecone template profile',
      'flipped nosecone template profile',
      'transition template profile',
      'fin set refused when overturned',
      'fin set refused when on its body',
      'nosecone shoulder seed radius in a stage',
      'flipped nosecone shoulder seed radius in a stage',
      'transition fore shoulder seed radius in a stage',
      'transition aft shoulder seed radius in a stage',
    ]) {
      expect(checked.get(rule) ?? 0, rule).toBeGreaterThan(5);
    }
    expect(report(misses, DESIGNS)).toEqual([]);
    const failing = new Set(misses.map((m) => m.rule));
    expect(Object.keys(KNOWN).filter((rule) => !failing.has(rule))).toEqual([]);
    expect(unresolved).toBeLessThan(DESIGNS);
  });

  it(`over ${ASSEMBLY_DESIGNS} generated designs with pod sets and boosters`, async () => {
    const engine = await loadEngine();
    const misses: Miss[] = [];
    let unresolved = 0;
    const checked = new Map<string, number>();
    for (let seed = 1; seed <= ASSEMBLY_DESIGNS; seed++) {
      const tree = syncDerived(withPlacements(withAbsolutes(withExtras(generateAssemblies(seed), seed), seed), seed));
      const r = compare(`assembly seed ${seed}`, tree, kernelGeometry(engine, tree, { fields: true }));
      misses.push(...r.misses);
      unresolved += r.unresolved;
      for (const [rule, count] of r.checked) checked.set(rule, (checked.get(rule) ?? 0) + count);
      const grown = shoulderSeedMisses(engine, `assembly seed ${seed}`, tree);
      misses.push(...grown.misses);
      for (const [rule, count] of grown.checked) checked.set(rule, (checked.get(rule) ?? 0) + count);
    }
    expect(report(misses, ASSEMBLY_DESIGNS)).toEqual([]);
    expect(checked.get('body tube automatic radius') ?? 0).toBeGreaterThan(300);
    for (const rule of [
      'bodytube station in a podset',
      'podset station, placed absolute in a bodytube',
      'parallelstage station, placed absolute in a bodytube',
      'podset radial distance, relative in a bodytube',
      'podset radial distance, free in a bodytube',
      'podset radial distance, surface in a bodytube',
      'podset radial distance, coaxial in a bodytube',
      'parallelstage radial distance, relative in a bodytube',
      'parallelstage radial distance, free in a bodytube',
      'podset angle in a bodytube',
      'parallelstage angle in a bodytube',
      'transition fore shoulder seed radius in a podset',
      'transition fore shoulder seed radius in a parallelstage',
      'nosecone shoulder seed radius in a stage',
    ]) {
      expect(checked.get(rule) ?? 0, rule).toBeGreaterThan(5);
    }
    expect(unresolved).toBeLessThan(ASSEMBLY_DESIGNS);
  });

  it(`over ${Object.keys(CHAIN_DESIGNS).length} hand-built chains of automatic tubes`, async () => {
    const engine = await loadEngine();
    const misses: Miss[] = [];
    let tubes = 0;
    for (const [name, build] of Object.entries(CHAIN_DESIGNS)) {
      const tree = syncDerived(build());
      const r = compare(name, tree, kernelGeometry(engine, tree, { fields: true }));
      misses.push(...r.misses);
      expect(r.unresolved, name).toBe(0);
      tubes += r.checked.get('body tube automatic radius') ?? 0;
    }
    expect(report(misses, Object.keys(CHAIN_DESIGNS).length)).toEqual([]);
    expect(tubes).toBeGreaterThan(30);
  });

  it('over flipped nose cones at the aft end of the chain', async () => {
    const engine = await loadEngine();
    const misses: Miss[] = [];
    let profiles = 0;
    const shapes: [string, number | undefined][] = [
      ['ogive', 0.5],
      ['conical', undefined],
      ['power', 0.5],
      ['haack', 0.2],
      ['ellipsoid', undefined],
      ['parabolic', 0.75],
    ];
    for (const [shape, shapeParameter] of shapes) {
      for (const filled of [false, true]) {
        const name = `tail cone ${shape}${filled ? ', filled' : ''}`;
        const tree = syncDerived({
          components: [
            {
              id: 'stage',
              type: 'stage',
              children: [
                { id: 'nose', type: 'nosecone', shape: 'ogive', length: 0.12, aftRadius: 0.025, thickness: 0.002 },
                { id: 'body', type: 'bodytube', length: 0.3, outerRadius: 0.025, thickness: 0.001 },
                {
                  id: 'tail',
                  type: 'nosecone',
                  shape,
                  ...(shapeParameter !== undefined ? { shapeParameter } : {}),
                  length: 0.08,
                  aftRadiusAuto: true,
                  thickness: 0.002,
                  filled,
                  flipped: true,
                  children: [
                    {
                      id: 'tail-fins',
                      type: 'freeformfinset',
                      finCount: 3,
                      thickness: 0.003,
                      points: [
                        [0, 0],
                        [0.02, 0.03],
                        [0.04, 0],
                      ],
                      tabHeight: 0.004,
                      tabLength: 0.02,
                      tabOffsetMethod: 'middle',
                      tabOffset: 0,
                      position: { method: 'top', offset: 0.01 },
                    },
                  ],
                },
              ],
            },
          ],
        } as unknown as RocketTree);
        const r = compare(name, tree, kernelGeometry(engine, tree, { fields: true }));
        misses.push(...r.misses);
        expect(r.unresolved, name).toBe(0);
        profiles += r.checked.get('side view flipped nosecone profile') ?? 0;
      }
    }
    expect(report(misses, shapes.length * 2)).toEqual([]);
    expect(profiles).toBe(shapes.length * 2);
  });
});

describe('a keyless body tube is read at the kernel radius', () => {
  it('in the station profile, the fin mount and the assembly placement', async () => {
    const engine = await loadEngine();
    const tube = { id: 'tube', type: 'bodytube', length: 0.3, thickness: 0.0005 } as ComponentNode;
    const tree = {
      components: [
        {
          id: 'stage',
          type: 'stage',
          children: [{ id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.012, thickness: 0.001 }, tube],
        },
      ],
    } as unknown as RocketTree;
    const want = kernelGeometry(engine, tree).get('tube')!.outerRadius;
    expect(typeof want).toBe('number');
    expect(stationRadius(tube, 0.1)).toBeCloseTo(want!, 12);
    expect(bodyRadiusAt(tube, 0.1)).toBeCloseTo(want!, 12);
    expect(assemblyParentRadius(tube)).toBeCloseTo(want!, 12);
  });
});

// ComponentFactory builds a keyless nose cone base and tube at 0.025 m.
describe('keyless nose cones and tubes are read at the kernel radius', () => {
  it('by an automatic tube behind a keyless nose cone', async () => {
    const engine = await loadEngine();
    const tree = syncDerived({
      components: [
        {
          id: 'stage',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, thickness: 0.001 },
            { id: 'tube', type: 'bodytube', length: 0.3, thickness: 0.0005, outerRadiusAuto: true },
          ],
        },
      ],
    } as unknown as RocketTree);
    const want = kernelGeometry(engine, tree).get('tube')!.outerRadius;
    expect(findNode(tree, 'tube')!['outerRadius']).toBeCloseTo(want!, 12);
  });

  it('by a bulkhead with no radius inside a keyless tube', async () => {
    const engine = await loadEngine();
    const tree = syncDerived({
      components: [
        {
          id: 'stage',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.025, thickness: 0.001 },
            {
              id: 'tube',
              type: 'bodytube',
              length: 0.3,
              thickness: 0.0005,
              children: [{ id: 'bh', type: 'bulkhead', length: 0.005, outerRadiusAuto: true }],
            },
          ],
        },
      ],
    } as unknown as RocketTree);
    const want = kernelGeometry(engine, tree).get('bh')!.outerRadius;
    expect(findNode(tree, 'bh')!['outerRadius']).toBeCloseTo(want!, 12);
  });
});

describe('keyless transition ends are drawn at the kernel radius', () => {
  const KEYLESS_DESIGNS = 60;

  const keyless = (tree: RocketTree): { tree: RocketTree; ends: number } => {
    let ends = 0;
    const strip = (n: ComponentNode): ComponentNode => {
      const out: Record<string, unknown> = { ...n };
      if (n.type === 'transition') {
        for (const end of ['fore', 'aft'] as const) {
          if (out[`${end}RadiusAuto`] === true) {
            delete out[`${end}Radius`];
            delete out[`${end}RadiusAuto`];
            ends += 1;
          }
        }
      }
      if (n.children) out['children'] = n.children.map(strip);
      return out as ComponentNode;
    };
    return { tree: { ...tree, components: tree.components.map(strip) }, ends };
  };

  it(`over ${KEYLESS_DESIGNS} generated designs`, async () => {
    const engine = await loadEngine();
    const misses: string[] = [];
    let checked = 0;
    for (let seed = 1; seed <= KEYLESS_DESIGNS; seed++) {
      const { tree, ends } = keyless(syncDerived(withAbsolutes(withExtras(generate(seed), seed), seed)));
      if (ends === 0) continue;
      const kernel = kernelGeometry(engine, tree);
      const views: [string, ComponentNode[]][] = [
        ['3D', walkTree(withKernelEnds(tree)).map((v) => v.node)],
        ['2D', walkTree({ components: chainWithKernelEnds(axialChain(tree)) } as RocketTree).map((v) => v.node)],
      ];
      for (const [view, nodes] of views) {
        for (const node of nodes) {
          if (node.type !== 'transition') continue;
          const k = kernel.get(node.id ?? '');
          if (!k) continue;
          const drawn = profileEnds(node);
          for (const end of ['fore', 'aft'] as const) {
            const want = end === 'fore' ? k.foreRadius : k.aftRadius;
            if (typeof want !== 'number' || want < 0) continue;
            checked += 1;
            if (!close(drawn[end], want)) {
              misses.push(`${view} seed ${seed} ${node.id} ${end}: drawn ${drawn[end]}, kernel ${want}`);
            }
          }
        }
      }
    }
    expect(misses).toEqual([]);
    expect(checked).toBeGreaterThan(30);
  });
});

// `Parachute.loadFromPreset` turns the radius automatic and the kernel keeps the packed volume (`MassObject.setRadius`).
describe('a catalog parachute packed into a wider tube', () => {
  it('keeps the packed volume it was picked with', async () => {
    const engine = await loadEngine();
    const row = (
      JSON.parse(readFileSync(join(__dirname, '../../../public/data/components.generated.json'), 'utf8')) as {
        components: unknown[];
      }
    ).components
      .filter(isComponentRow)
      .find((p): p is ParachuteComponent => p.type === 'parachute' && p.mfr === 'Rocketman' && p.partNo === 'PA-04');
    expect(row?.packedLength).toBeGreaterThan(0);
    expect(row?.packedDiameter).toBeGreaterThan(0);
    const base = { ...defaultNode('parachute'), id: 'chute', position: { method: 'top', offset: 0 } } as ComponentNode;
    const chute = { ...base, ...catalogPatch(row!, base) } as ComponentNode;
    const picked = {
      name: '',
      components: [
        {
          type: 'stage',
          id: 'st',
          children: [
            { type: 'bodytube', id: 'tube', outerRadius: 0.049, thickness: 0.001, length: 0.6, children: [chute] },
          ],
        },
      ],
    } as unknown as RocketTree;
    const desktop = kernelGeometry(engine, picked).get('chute')!;
    const settledCg = (t: RocketTree): number => {
      engine.reset();
      const handle: number = engine.buildRocket(JSON.stringify(t));
      engine.getComponentGeometry(handle, 'chute');
      return (JSON.parse(engine.getComponentInfo(handle, 'chute') as string) as { cgX: number }).cgX;
    };
    const desktopCg = settledCg(picked);

    const app = findNode(syncDerived(picked), 'chute')!;
    // MassObject.getRadius with the radius automatic: length = r^2 * L / bore^2.
    const stated = row!.packedDiameter! / 2;
    const closedForm = (stated * stated * row!.packedLength!) / (desktop.radius! * desktop.radius!);
    expect(app['radius']).toBeCloseTo(desktop.radius!, 12);
    expect(app['length']).toBeCloseTo(desktop.settledLength!, 12);
    expect(app['length']).toBeCloseTo(closedForm, 12);

    const tree = syncDerived(picked);
    const flown = kernelGeometry(engine, tree).get('chute')!;
    expect(flown.length).toBeCloseTo(desktop.settledLength!, 12);
    expect(settledCg(tree)).toBeCloseTo(desktopCg, 12);
  });
});
