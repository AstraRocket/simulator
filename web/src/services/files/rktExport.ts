import { must } from '../app/must';
import i18n from '../../i18n';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { clusterCount, clusterPlacesOf } from '../../tree/cluster';
import { isChainType, rollAngleKey, rollAngleOf } from '../../tree/componentKinds';
import { countOf, numOpt, positionOf } from '../../tree/nodeProps';
import { axialLength, freeformPoints, partLength, startFromPosition } from '../../tree/position';
import {
  assemblyChainLength,
  assemblyParentRadius,
  isAssembly,
  resolveAssemblyRadius,
  ringInstanceOffsets,
} from '../../tree/assembly';
import { profileEnds } from '../../tree/shapeProfile';
import { finRootChord, tabPosition } from '../../tree/finPlanform';
import { KERNEL_DEFAULTS, kernelDefault } from '../../tree/kernelDefaults';
import { asStageNodes } from '../design/orkTree';
import { escapeXml } from './xmlUtil';
import { plainDecimal } from './numberText';
import { radToDeg } from '../../prefs/units';
import type { Keyed } from '../../i18n/keyedError';
import { notePartName } from './importNote';
import { partLabel } from '../../i18n/format';
import { resolvedMaterial } from '../design/materialSlots';
import {
  FINISH_CODES,
  LOCATION_CODES,
  MATT,
  RING_USAGE,
  SHAPE_CODES,
  STAGE_CG_ELEMENTS,
  STAGE_ELEMENTS,
  STAGE_MASS_ELEMENTS,
  SURFACE_DENSITY,
  TIP_SHAPE_CODES,
} from './rocksim/schema';
import { overridesStages, type StageFigures } from './rocksim/stageStacks';
import { DESKTOP_PART_NAMES } from './desktopPartNames';

export type { StageFigures } from './rocksim/stageStacks';

const mm = (v: number): number => v * 1000;
/** Radius in m to diameter in mm. */
const dia = (v: number): number => v * 2000;
const g = (v: number): number => v * 1000;

function skip(w: Writer, what: Keyed): void {
  w.skipped.set(JSON.stringify(what), what);
}

interface Writer {
  emit: (depth: number, s: string) => void;
  skipped: Map<string, Keyed>;
  /** m. */
  parentLength: number;
  /** m from the nose tip. */
  parentStart: number;
  parent: ComponentNode | null;
  componentInfo?: ComponentFigures;
  splitPods: WeakSet<ComponentNode>;
  inSubtreeMass: boolean;
}

// RockSim's known mass never covers attached parts (`CRocketPart::GetMass`).
const coversParts = (n: ComponentNode): boolean =>
  n.type !== 'stage' &&
  n.type !== 'parallelstage' &&
  numOpt(n, 'overrideMass') !== undefined &&
  n['overrideSubcomponentsMass'] === true;

/** Own mass (kg) and CG from the part's front (m). */
export type ComponentFigures = (id: string) =>
  | {
      mass: number;
      cgX: number;
      cordLength?: number;
      lineLength?: number;
      cd?: number;
    }
  | undefined;

const fmt = (v: number): string => plainDecimal(v, 6, '0');

const el = (w: Writer, depth: number, name: string, value: string | number): void => {
  w.emit(depth, `<${name}>${typeof value === 'number' ? fmt(value) : escapeXml(value)}</${name}>`);
};

const strOf = (n: ComponentNode, key: string): string | undefined => {
  const v = n[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
};

type MaterialKind = 'bulk' | 'surface' | 'line' | 'none';

const DENSITY_TYPES = { bulk: 0, surface: 1, line: 2 } as const;

// Always written: desktop opens a part with no `Density` weighing nothing.
function materialOf(n: ComponentNode, kind: Exclude<MaterialKind, 'none'>): { name: string; density: number } {
  return resolvedMaterial(n, kind);
}

const put = (w: Writer, d: number, name: string, v: number | undefined, scale: (x: number) => number): void => {
  if (v !== undefined) el(w, d, name, scale(v));
};

/** `UseKnownCG` stops RockSim computing both mass and CG, so it needs a mass to pair with any CG. */
// eslint-disable-next-line complexity -- a flat list of elements, each with its own condition
function writeCommon(
  w: Writer,
  d: number,
  n: ComponentNode,
  withPosition: boolean,
  kind: MaterialKind = 'bulk',
  ownMass?: number,
): void {
  el(w, d, 'Name', n.name ?? DESKTOP_PART_NAMES[n.type] ?? '');
  if (kind !== 'none') {
    const material = materialOf(n, kind);
    el(w, d, 'Material', material.name);
    // g/cm2 by the reader's constant; an extra x10 here makes a canopy a hundred times too heavy.
    el(w, d, 'Density', kind === 'surface' ? material.density * SURFACE_DENSITY : material.density);
    el(w, d, 'DensityType', DENSITY_TYPES[kind]);
  }

  const overrideMass = numOpt(n, 'overrideMass');
  const overrideCg = numOpt(n, 'overrideCGX');
  const figures = typeof n.id === 'string' ? w.componentInfo?.(n.id) : undefined;
  const cgOnlyMass = overrideMass === undefined && overrideCg !== undefined ? (ownMass ?? figures?.mass) : undefined;
  const massOnlyCg = overrideMass !== undefined && overrideCg === undefined ? figures?.cgX : undefined;
  const writtenMass = overrideMass ?? cgOnlyMass;
  const writtenCg = overrideCg ?? massOnlyCg;
  if (w.inSubtreeMass) {
    // The ancestor's KnownMass already holds it, so 0 keeps RockSim from counting it twice.
    el(w, d, 'KnownMass', 0);
    el(w, d, 'KnownCG', mm(overrideCg ?? figures?.cgX ?? 0));
    el(w, d, 'UseKnownCG', 1);
  } else if (overrideMass !== undefined && overrideCg === undefined && massOnlyCg === undefined) {
    // A KnownCG of 0 would move the CG to the front.
    if (ownMass !== undefined) el(w, d, 'KnownMass', g(ownMass));
    skip(w, { key: 'errors.rktSkip.massOverride', values: { name: notePartName(n) } });
  } else if (writtenMass !== undefined && writtenCg !== undefined) {
    el(w, d, 'KnownMass', g(writtenMass));
    el(w, d, 'KnownCG', mm(writtenCg));
    el(w, d, 'UseKnownCG', 1);
  } else {
    if (ownMass !== undefined) el(w, d, 'KnownMass', g(ownMass));
    if (overrideCg !== undefined) {
      skip(w, { key: 'errors.rktSkip.cgOverride', values: { name: notePartName(n) } });
    }
  }
  // RockSim's switch covers the part alone (`BaseHandler.setOverride`).
  const label = { name: notePartName(n) };
  const subMass = n['overrideSubcomponentsMass'] === true && overrideMass !== undefined;
  const subCg = n['overrideSubcomponentsCG'] === true && overrideCg !== undefined;
  if (!w.inSubtreeMass && (subMass || subCg) && !(subMass && subCg)) {
    skip(w, { key: 'errors.rktSkip.subtreeOverride', values: label });
  }
  if (numOpt(n, 'overrideCD') !== undefined) skip(w, { key: 'errors.rktSkip.cdOverride', values: label });

  el(w, d, 'FinishCode', FINISH_CODES.get(strOf(n, 'finish') ?? 'normal') ?? MATT);

  if (withPosition) {
    const { method, offset } = positionOf(n);
    // Bottom flips sign, as the reader does.
    const xb =
      method === 'bottom' ? -offset : method === 'middle' ? offset + (w.parentLength - axialLength(n)) / 2 : offset;
    el(w, d, 'Xb', mm(xb));
    el(w, d, 'LocationMode', LOCATION_CODES.get(method) ?? 0);
  }
}

function writeWall(w: Writer, d: number, n: ComponentNode): void {
  if (n['filled'] === true) {
    el(w, d, 'ConstructionType', 0);
    return;
  }
  el(w, d, 'ConstructionType', 1);
  put(w, d, 'WallThickness', numOpt(n, 'thickness'), mm);
}

function writeShape(w: Writer, d: number, n: ComponentNode, fallback: string): void {
  const shape = strOf(n, 'shape') ?? fallback;
  el(w, d, 'ShapeCode', SHAPE_CODES.get(shape) ?? must(SHAPE_CODES.get(fallback), 'shape code'));
  const param = numOpt(n, 'shapeParameter');
  if (param !== undefined) el(w, d, 'ShapeParameter', param);
}

type PartWriter = (w: Writer, d: number, n: ComponentNode) => void;

const writeNoseCone: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, false);
  put(w, d, 'Len', numOpt(n, 'length'), mm);
  put(w, d, 'BaseDia', numOpt(n, 'aftRadius'), dia);
  writeWall(w, d, n);
  writeShape(w, d, n, 'ogive');
  put(w, d, 'ShoulderOD', numOpt(n, 'shoulderRadius'), dia);
  put(w, d, 'ShoulderLen', numOpt(n, 'shoulderLength'), mm);
};

const writeTransition: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true);
  put(w, d, 'Len', numOpt(n, 'length'), mm);
  put(w, d, 'FrontDia', numOpt(n, 'foreRadius'), dia);
  put(w, d, 'RearDia', numOpt(n, 'aftRadius'), dia);
  writeWall(w, d, n);
  writeShape(w, d, n, 'conical');
  put(w, d, 'FrontShoulderDia', numOpt(n, 'foreShoulderRadius'), dia);
  put(w, d, 'FrontShoulderLen', numOpt(n, 'foreShoulderLength'), mm);
  put(w, d, 'RearShoulderDia', numOpt(n, 'aftShoulderRadius'), dia);
  put(w, d, 'RearShoulderLen', numOpt(n, 'aftShoulderLength'), mm);
};

/** Degrees, unlike desktop, which writes radians here; RockSim reads degrees. `CantAngle` stays radians. */
function writeRadialAngle(w: Writer, d: number, angle: number | undefined): void {
  if (angle) el(w, d, 'RadialAngle', radToDeg(angle));
}

/** `boreFirst`: LaunchLug.setInnerRadius rebuilds the outer radius, so a later `ID` would undo the `OD`. */
function writeTubeWall(w: Writer, d: number, n: ComponentNode, boreFirst = false): void {
  const or = numOpt(n, 'outerRadius');
  const th = numOpt(n, 'thickness');
  const bore = () => {
    if (or !== undefined && th !== undefined) el(w, d, 'ID', dia(or - th));
  };
  if (boreFirst) bore();
  put(w, d, 'OD', or, dia);
  if (!boreFirst) bore();
}

/** Only where desktop writes it (BasePartDTO, MassObjectDTO); not for parachutes or streamers. */
function writeRadial(w: Writer, d: number, n: ComponentNode): void {
  put(w, d, 'RadialLoc', numOpt(n, 'radialPosition'), mm);
  writeRadialAngle(w, d, numOpt(n, 'radialDirection'));
}

const writeTube =
  (inner: boolean): PartWriter =>
  (w, d, n) => {
    writeCommon(w, d, n, inner);
    put(w, d, 'Len', numOpt(n, 'length'), mm);
    writeTubeWall(w, d, n);
    el(w, d, 'IsInsideTube', inner ? 1 : 0);
    el(w, d, 'IsMotorMount', n['motorMount'] === true ? 1 : 0);
    put(w, d, 'EngineOverhang', numOpt(n, 'motorOverhang'), mm);
    if (inner) writeRadial(w, d, n);
  };

const writeRing: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true);
  el(w, d, 'UsageCode', RING_USAGE.get(n.type) ?? 0);
  put(w, d, 'Len', numOpt(n, 'length'), mm);
  const or = numOpt(n, 'outerRadius');
  put(w, d, 'OD', or, dia);
  const ir = numOpt(n, 'innerRadius');
  const th = numOpt(n, 'thickness');
  if (n.type === 'bulkhead') el(w, d, 'ID', 0);
  else if (ir !== undefined) el(w, d, 'ID', dia(ir));
  else if (or !== undefined && th !== undefined) el(w, d, 'ID', dia(or - th));
  writeRadial(w, d, n);
};

const writeSurfaceTube = (w: Writer, d: number, n: ComponentNode, boreFirst = false): void => {
  put(w, d, 'Len', numOpt(n, 'length'), mm);
  writeTubeWall(w, d, n, boreFirst);
  const rollKey = rollAngleKey(n.type);
  writeRadialAngle(w, d, rollKey ? numOpt(n, rollKey) : undefined);
};

const writeLaunchLug: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true);
  writeSurfaceTube(w, d, n, true);
};

const FIN_SHAPE_CODES: Record<string, number> = { trapezoidfinset: 0, ellipticalfinset: 1, freeformfinset: 2 };

const writeFinSet: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true);
  el(w, d, 'ShapeCode', FIN_SHAPE_CODES[n.type] ?? 0);
  el(w, d, 'FinCount', countOf(n, 'finCount', kernelDefault(n.type, 'finCount') ?? 3));
  put(w, d, 'Thickness', numOpt(n, 'thickness'), mm);

  if (n.type === 'trapezoidfinset') {
    put(w, d, 'RootChord', numOpt(n, 'rootChord'), mm);
    put(w, d, 'TipChord', numOpt(n, 'tipChord'), mm);
    put(w, d, 'SemiSpan', numOpt(n, 'height'), mm);
    put(w, d, 'SweepDistance', numOpt(n, 'sweep'), mm);
  } else if (n.type === 'ellipticalfinset') {
    put(w, d, 'RootChord', numOpt(n, 'rootChord'), mm);
    put(w, d, 'SemiSpan', numOpt(n, 'height'), mm);
  } else {
    // Reversed, each pair closed by `|` (`CustomFinSetDTO.convertFreeFormPoints`).
    const pts = freeformPoints(n);
    if (pts.length >= 3) {
      el(
        w,
        d,
        'PointList',
        [...pts]
          .reverse()
          .map(([x, y]) => `${fmt(mm(x))},${fmt(mm(y))}|`)
          .join(''),
      );
    }
  }

  // Radians to nine places: six would round a small cant to four figures.
  const cant = numOpt(n, 'cant');
  if (cant) el(w, d, 'CantAngle', plainDecimal(cant, 9, '0'));
  writeRadialAngle(w, d, numOpt(n, 'rotation'));
  const crossSection = strOf(n, 'crossSection') ?? 'square';
  el(w, d, 'TipShapeCode', TIP_SHAPE_CODES.get(crossSection) ?? 0);
  // Desktop opens an airfoil set with `CalcMass`/`CalcCG` as its override (`FinSetHandler.endHandler`).
  if (crossSection === 'airfoil' && numOpt(n, 'overrideMass') === undefined) {
    const figures = typeof n.id === 'string' ? w.componentInfo?.(n.id) : undefined;
    if (figures) {
      el(w, d, 'CalcMass', g(figures.mass));
      el(w, d, 'CalcCG', mm(figures.cgX));
    } else {
      skip(w, { key: 'errors.rktSkip.airfoilMass', values: { name: notePartName(n) } });
    }
  }

  const tabLength = numOpt(n, 'tabLength');
  if (tabLength !== undefined && tabLength > 0) {
    el(w, d, 'TabLength', mm(tabLength));
    put(w, d, 'TabDepth', numOpt(n, 'tabHeight'), mm);
    // Always from the root's front: `FinSetDTO` writes `getTabOffset(AxialMethod.TOP)`.
    const method = strOf(n, 'tabOffsetMethod') ?? 'middle';
    el(w, d, 'TabOffset', mm(tabPosition(numOpt(n, 'tabOffset') ?? 0, tabLength, finRootChord(n), method)));
  }
};

const writeTubeFinSet: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true);
  el(w, d, 'TubeCount', countOf(n, 'finCount', KERNEL_DEFAULTS.tubefinset.finCount));
  writeSurfaceTube(w, d, n);
};

// RockSim has no automatic values; an auto field's stored value is stale.
function flown(
  w: Writer,
  n: ComponentNode,
  key: 'cordLength' | 'lineLength' | 'cd',
  flag: 'cordLengthAuto' | 'lineLengthAuto' | 'cdAuto',
): number | undefined {
  if (n[flag] !== true) return numOpt(n, key);
  const figure = typeof n.id === 'string' ? w.componentInfo?.(n.id)?.[key] : undefined;
  if (figure === undefined) {
    skip(w, { key: 'errors.rktSkip.autoValue', values: { name: notePartName(n) } });
  }
  return figure;
}

const writeParachute: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true, 'surface');
  // A diameter on both sides, unlike every other circular field in the format.
  put(w, d, 'Dia', numOpt(n, 'diameter'), mm);
  // No `SideCount` reads as a hexagon, a sixth smaller.
  el(w, d, 'SideCount', 0);
  const cd = flown(w, n, 'cd', 'cdAuto');
  if (cd !== undefined) el(w, d, 'DragCoefficient', cd);
  el(w, d, 'ShroudLineCount', numOpt(n, 'lineCount') ?? 6);
  put(w, d, 'ShroudLineLen', flown(w, n, 'lineLength', 'lineLengthAuto'), mm);
  el(w, d, 'ChuteCount', 1);
  // Density first: `ParachuteHandler` builds the material when `ShroudLineMaterial` closes.
  // kg/m despite the name (`ROCKSIM_TO_OPENROCKET_LINE_DENSITY` is 1).
  const lines = materialOf(n, 'line');
  el(w, d, 'ShroudLineMassPerMM', lines.density);
  el(w, d, 'ShroudLineMaterial', lines.name);
};

const writeStreamer: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true, 'surface');
  put(w, d, 'Len', numOpt(n, 'stripLength'), mm);
  put(w, d, 'Width', numOpt(n, 'stripWidth'), mm);
  const cd = flown(w, n, 'cd', 'cdAuto');
  if (cd !== undefined) el(w, d, 'DragCoefficient', cd);
};

const writeMassObject =
  (shockCord: boolean): PartWriter =>
  (w, d, n) => {
    const len = (shockCord ? flown(w, n, 'cordLength', 'cordLengthAuto') : undefined) ?? numOpt(n, 'cordLength') ?? 0;
    const ownMass = shockCord ? (numOpt(n, 'lineDensity') ?? 0) * len : (numOpt(n, 'mass') ?? 0);
    // `mapMassObjectAsShockCord` drops `KnownMass` unless `UseKnownCG` is set.
    writeCommon(w, d, n, true, shockCord ? 'line' : 'none', ownMass);
    el(w, d, 'TypeCode', shockCord ? 1 : 0);
    if (shockCord) {
      el(w, d, 'Len', mm(len));
    } else {
      put(w, d, 'Len', numOpt(n, 'length'), mm);
      put(w, d, 'Dia', numOpt(n, 'radius'), dia);
    }
    writeRadial(w, d, n);
  };

const writePod: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true, 'none');
  // Resolved, as `PodHandler` reads it (`RadiusMethod.FREE`).
  el(w, d, 'RadialLoc', mm(resolveAssemblyRadius(n, assemblyParentRadius(w.parent))));
  writeRadialAngle(w, d, numOpt(n, 'angleOffset'));
  el(w, d, 'Detachable', n.type === 'parallelstage' ? 1 : 0);
  el(w, d, 'Removed', 0);
};

const PARTS: Record<string, { tag: string; write: PartWriter }> = {
  nosecone: { tag: 'NoseCone', write: writeNoseCone },
  transition: { tag: 'Transition', write: writeTransition },
  bodytube: { tag: 'BodyTube', write: writeTube(false) },
  innertube: { tag: 'BodyTube', write: writeTube(true) },
  centeringring: { tag: 'Ring', write: writeRing },
  bulkhead: { tag: 'Ring', write: writeRing },
  engineblock: { tag: 'Ring', write: writeRing },
  tubecoupler: { tag: 'Ring', write: writeRing },
  launchlug: { tag: 'LaunchLug', write: writeLaunchLug },
  trapezoidfinset: { tag: 'FinSet', write: writeFinSet },
  ellipticalfinset: { tag: 'FinSet', write: writeFinSet },
  freeformfinset: { tag: 'CustomFinSet', write: writeFinSet },
  tubefinset: { tag: 'TubeFinSet', write: writeTubeFinSet },
  parachute: { tag: 'Parachute', write: writeParachute },
  streamer: { tag: 'Streamer', write: writeStreamer },
  shockcord: { tag: 'MassObject', write: writeMassObject(true) },
  masscomponent: { tag: 'MassObject', write: writeMassObject(false) },
  podset: { tag: 'ExternalPod', write: writePod },
  parallelstage: { tag: 'ExternalPod', write: writePod },
};

// RockSim has no flipped flag (`StageDTO.toNoseConeDTO`).
function asTailTransition(n: ComponentNode): ComponentNode {
  const { fore, aft } = profileEnds(n);
  const { shoulderRadius, shoulderLength, ...rest } = n;
  return {
    ...rest,
    type: 'transition',
    foreRadius: fore,
    aftRadius: aft,
    ...(shoulderRadius !== undefined ? { foreShoulderRadius: shoulderRadius } : {}),
    ...(shoulderLength !== undefined ? { foreShoulderLength: shoulderLength } : {}),
  };
}

// As `InnerBodyTubeDTO.handleCluster`.
function clusterMembers(n: ComponentNode): ComponentNode[] {
  const pattern = strOf(n, 'cluster');
  const count = clusterCount(pattern);
  if (n.type !== 'innertube' || count <= 1) return [n];
  const places = clusterPlacesOf(n);
  return places.map((p, i) => ({
    ...n,
    name: `${partLabel(i18n.t, n)} #${i + 1}`,
    cluster: 'single',
    ...p,
  }));
}

/** RockSim keeps a pod child's angle about the airframe (`PodSetDTO.addAngleOffsetToChildren`). */
function withPodAngle(children: ComponentNode[] | undefined, angle: number): ComponentNode[] | undefined {
  if (!children || angle === 0) return children;
  return children.map((child) => {
    const key = rollAngleKey(child.type);
    const turned: ComponentNode = key ? { ...child, [key]: (rollAngleOf(child) ?? 0) + angle } : { ...child };
    if (!isAssembly(child.type)) turned.children = withPodAngle(child.children, angle);
    return turned;
  });
}

// As `PodSetDTO.generatePodSetDTOs`.
function podMembers(n: ComponentNode): ComponentNode[] {
  const fallback = n.type === 'parallelstage' ? KERNEL_DEFAULTS.parallelstage : KERNEL_DEFAULTS.podset;
  const count = countOf(n, 'instanceCount', fallback.instanceCount);
  const override = numOpt(n, 'overrideMass');
  return ringInstanceOffsets(count, 0, numOpt(n, 'angleOffset') ?? 0).map(({ angle }, i): ComponentNode => {
    const member: ComponentNode = { ...n, angleOffset: angle, children: withPodAngle(n.children, angle) };
    if (count === 1) return member;
    return {
      ...member,
      name: `${partLabel(i18n.t, n)} #${i + 1}`,
      instanceCount: 1,
      ...(override !== undefined ? { overrideMass: override / count } : {}),
    };
  });
}

function stationOf(w: Writer, n: ComponentNode): number {
  return w.parentStart + startFromPosition(positionOf(n), axialLength(n), w.parentLength, w.parentStart);
}

// RingHandler reads nothing nested in a `<Ring>`, so a coupler's parts go beside it (TubeCouplerDTO).
function writeCouplerParts(w: Writer, depth: number, coupler: ComponentNode): void {
  const outer = { length: w.parentLength, start: w.parentStart };
  const start = stationOf(w, coupler);
  const placed = (coupler.children ?? []).map((kid): ComponentNode => {
    w.parentLength = axialLength(coupler);
    w.parentStart = start;
    return { ...kid, position: { method: 'absolute', offset: stationOf(w, kid) } };
  });
  w.parentLength = outer.length;
  w.parentStart = outer.start;
  const outerSub = w.inSubtreeMass;
  w.inSubtreeMass ||= coversParts(coupler);
  for (const kid of placed) writePart(w, depth, kid);
  w.inSubtreeMass = outerSub;
}

function writePart(w: Writer, depth: number, n: ComponentNode, at?: number): void {
  if (n.type === 'nosecone' && n['flipped'] === true) {
    writePart(w, depth, asTailTransition(n), at);
    return;
  }
  if ((n.type === 'podset' || n.type === 'parallelstage') && !w.splitPods.has(n)) {
    for (const member of podMembers(n)) {
      w.splitPods.add(member);
      writePart(w, depth, member, at);
    }
    return;
  }
  const spec = PARTS[n.type];
  if (!spec) {
    skip(w, { key: `part.${n.type}` });
    return;
  }
  const members = clusterMembers(n);
  if (members.length > 1) {
    for (const member of members) writePart(w, depth, member, at);
    return;
  }
  if (!isAssembly(n.type) && Math.round(numOpt(n, 'instanceCount') ?? 1) > 1) {
    skip(w, { key: 'errors.rktSkip.instanceCount', values: { name: notePartName(n) } });
  }
  w.emit(depth, `<${spec.tag}>`);
  spec.write(w, depth + 1, n);
  const kids = n.children ?? [];
  const coupler = n.type === 'tubecoupler';
  if (kids.length > 0 && !coupler) {
    w.emit(depth + 1, '<AttachedParts>');
    writeChildren(w, depth + 2, n, at ?? stationOf(w, n));
    w.emit(depth + 1, '</AttachedParts>');
  }
  w.emit(depth, `</${spec.tag}>`);
  if (kids.length > 0 && coupler) writeCouplerParts(w, depth, n);
}

// Body components in a stage or pod stack nose to tail whatever their position says.
function writeChildren(w: Writer, depth: number, parent: ComponentNode, start: number): void {
  const outer = { length: w.parentLength, start: w.parentStart, parent: w.parent, sub: w.inSubtreeMass };
  w.parentStart = start;
  w.parentLength = axialLength(parent);
  w.parent = parent;
  w.inSubtreeMass =
    parent.type === 'stage' || parent.type === 'parallelstage' ? false : outer.sub || coversParts(parent);
  const chained = parent.type === 'stage' || isAssembly(parent.type);
  let x = start;
  for (const kid of parent.children ?? []) {
    if (chained && isChainType(kid.type)) {
      writePart(w, depth, kid, x);
      x += partLength(kid);
    } else writePart(w, depth, kid);
  }
  w.parentLength = outer.length;
  w.parentStart = outer.start;
  w.parent = outer.parent;
  w.inSubtreeMass = outer.sub;
}

const CP_BARROWMAN = 1;
const CP_ROCKSIM = 4;

const BARROWMAN_FIN_COUNTS = new Set([3, 4, 6]);

// A tube fin set is not a `FinSet`, so `supportsBarrowmanEquations` skips it.
const PLANAR_FINS = new Set(['trapezoidfinset', 'ellipticalfinset', 'freeformfinset']);

function barrowmanFits(stages: readonly ComponentNode[]): boolean {
  const fits = (nodes: readonly ComponentNode[] | undefined): boolean =>
    (nodes ?? []).every(
      (n) =>
        (!PLANAR_FINS.has(n.type) ||
          BARROWMAN_FIN_COUNTS.has(countOf(n, 'finCount', kernelDefault(n.type, 'finCount') ?? 3))) &&
        fits(n.children),
    );
  return fits(stages);
}

// `FixedCd` is the whole design's Cd (`RockSimSaver`).
function writeFixedCd(w: Writer, stages: readonly ComponentNode[]): void {
  const only = stages.length === 1 ? stages[0]! : undefined;
  const fixed = only && only['overrideSubcomponentsCD'] === true ? numOpt(only, 'overrideCD') : undefined;
  if (fixed !== undefined) {
    el(w, 3, 'CalculateCD', 0);
    el(w, 3, 'FixedCd', fixed);
    return;
  }
  for (const stage of stages) {
    if (numOpt(stage, 'overrideCD') !== undefined) {
      skip(w, { key: 'errors.rktSkip.cdOverride', values: { name: stage.name || { key: 'part.stage' } } });
    }
  }
}

// All or nothing (`RockSimSaver.setStageOverrides`).
function writeStageOverrides(
  w: Writer,
  tree: RocketTree,
  stages: readonly ComponentNode[],
  figures: readonly StageFigures[] | undefined,
): boolean {
  if (!overridesStages(tree)) return false;
  if (!figures || figures.length < stages.length) {
    for (const stage of stages) {
      if (numOpt(stage, 'overrideMass') !== undefined || numOpt(stage, 'overrideCGX') !== undefined) {
        skip(w, { key: 'errors.rktSkip.stageOverride', values: { name: stage.name || { key: 'part.stage' } } });
      }
    }
    return false;
  }
  stages.forEach((_, i) => el(w, 3, STAGE_MASS_ELEMENTS[i]!, g(figures[i]!.mass)));
  stages.forEach((_, i) => el(w, 3, STAGE_CG_ELEMENTS[i]!, mm(figures[i]!.stackCg)));
  return true;
}

export interface RktExportResult {
  xml: string;
  skipped: Keyed[];
}

export function exportRkt(
  name: string,
  tree: RocketTree,
  componentInfo?: ComponentFigures,
  stageFigures?: readonly StageFigures[],
): RktExportResult {
  const lines: string[] = [];
  const w: Writer = {
    emit: (depth, s) => lines.push('  '.repeat(depth) + s),
    skipped: new Map(),
    parentLength: 0,
    parentStart: 0,
    parent: null,
    componentInfo,
    splitPods: new WeakSet(),
    inSubtreeMass: false,
  };
  let stageStart = 0;

  const stages = asStageNodes(tree);
  const written = Math.min(stages.length, STAGE_ELEMENTS.length);
  if (stages.length > STAGE_ELEMENTS.length) {
    skip(w, { key: 'errors.rktSkip.extraStages', values: { from: STAGE_ELEMENTS.length + 1 } });
  }

  // No XML declaration: `GeneralRocketLoader` requires the first eleven bytes to be `<RockSimDoc`.
  w.emit(0, '<RockSimDocument>');
  w.emit(1, '<FileVersion>4</FileVersion>');
  w.emit(1, '<DesignInformation>');
  w.emit(2, '<RocketDesign>');
  w.emit(3, `<Name>${escapeXml(name)}</Name>`);
  const held = stages.slice(0, written);
  writeFixedCd(w, held);
  for (const [tag, key] of [
    ['Comments', 'comment'],
    ['Designer', 'designer'],
    ['Revisions', 'revision'],
  ] as const) {
    const v = tree[key];
    if (typeof v === 'string' && v.trim()) el(w, 3, tag, v);
  }
  w.emit(3, `<StageCount>${written}</StageCount>`);
  const knownMass = writeStageOverrides(w, tree, held, stageFigures);
  const cpMethod = barrowmanFits(held) ? CP_BARROWMAN : CP_ROCKSIM;
  el(w, 3, 'CPCalcFlags', cpMethod);
  el(w, 3, 'CPSimFlags', cpMethod);
  if (knownMass) el(w, 3, 'UseKnownMass', 1);

  STAGE_ELEMENTS.forEach((elName, i) => {
    const stage = i < written ? stages[i] : undefined;
    const kids = stage?.children ?? [];
    if (!stage || kids.length === 0) {
      w.emit(3, `<${elName}/>`);
      return;
    }
    w.emit(3, `<${elName}>`);
    writeChildren(w, 4, stage, stageStart);
    w.emit(3, `</${elName}>`);
    stageStart += assemblyChainLength(stage);
  });

  w.emit(2, '</RocketDesign>');
  w.emit(1, '</DesignInformation>');
  w.emit(0, '</RockSimDocument>');

  return { xml: lines.join('\n') + '\n', skipped: [...w.skipped.values()] };
}
