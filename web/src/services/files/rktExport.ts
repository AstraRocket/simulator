import i18n from '../../i18n';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { clusterCount, clusterPlacesOf } from '../../tree/cluster';
import { isChainType, rollAngleKey, rollAngleOf } from '../../tree/componentKinds';
import { countOf, numOpt, positionOf } from '../../tree/nodeProps';
import { axialLength, freeformPoints, partLength, startFromPosition } from '../../tree/position';
import { assemblyParentRadius, isAssembly, resolveAssemblyRadius, ringInstanceOffsets } from '../../tree/assembly';
import { profileEnds } from '../../tree/shapeProfile';
import { finRootChord, tabPosition } from '../../tree/finPlanform';
import { KERNEL_DEFAULTS, KERNEL_MATERIALS, kernelDefault } from '../../tree/kernelDefaults';
import { asStageNodes } from '../design/orkTree';
import { escapeXml } from './xmlUtil';
import { plainDecimal } from './numberText';
import { radToDeg } from '../../prefs/units';
import type { Keyed } from '../../i18n/keyedError';
import { notePartName } from './importNote';
import { partLabel } from '../../i18n/format';
import { MATERIAL_KEYS, statedMaterial } from '../design/materialSlots';
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

export type { StageFigures } from './rocksim/stageStacks';

/**
 * RockSim (`.rkt`) export.
 *
 * The mirror of `rktImport.ts`, written against the same schema
 * (`RockSimCommonConstants.java` and `file/rocksim/export/*DTO.java`), so
 * everything the reader understands the writer produces. What RockSim cannot
 * carry (a part's drag override, a stage's other than a single stage's) is
 * left out and named in the export's skipped list rather than written
 * approximately.
 *
 * Scope: this writes a design, not a full RockSim document: no simulations,
 * no engine selections, no view state. RockSim keeps its motor choices and
 * launch setup with its simulations, which is a different object from the
 * rocket, and inventing a simulation block to carry ours would mean guessing
 * at fields RockSim would then treat as authoritative. The file opens in
 * RockSim as a design with no motor loaded.
 *
 * Some of what we can build has no RockSim element at all (rail buttons, the
 * app's own fairing extension). Those are skipped and named in the result, so
 * the user is told which parts are missing from the file.
 */

/** m → mm. */
const mm = (v: number): number => v * 1000;
/** radius in m → diameter in mm. */
const dia = (v: number): number => v * 2000;
/** kg → g. */
const g = (v: number): number => v * 1000;

/**
 * The code tables below are Maps, not plain objects: each is indexed by a
 * token a file carried (a finish, a shape, a cross section, a placement
 * method), and `constructor` or `__proto__` on a plain object would resolve to
 * an Object.prototype member rather than to nothing.
 */

/** Record something left out of the file, once however often it is met. */
function skip(w: Writer, what: Keyed): void {
  w.skipped.set(JSON.stringify(what), what);
}

interface Writer {
  emit: (depth: number, s: string) => void;
  /**
   * What had no RockSim element, once each, as keyed text the caller renders:
   * a part type (`part.<type>`, the tree's own label) or a reason.
   */
  skipped: Map<string, Keyed>;
  /** Axial length (m) of the part whose children are being written. */
  parentLength: number;
  /** Station (m from the nose tip) of the front of that part. */
  parentStart: number;
  /** The part whose children are being written; null at the top of a stage. */
  parent: ComponentNode | null;
  /** The kernel's figures for a part, by node id, where the caller has a build. */
  componentInfo?: ComponentFigures;
  /** Single pods already split out of their set, written as they are. */
  splitPods: WeakSet<ComponentNode>;
  /** Whether a part above the one being written overrides the mass of the parts inside it. */
  inSubtreeMass: boolean;
}

/**
 * Whether a part's mass override covers the parts inside it, which RockSim's
 * own known mass never does (`CRocketPart::GetMass` leaves the attached parts
 * out). A stage's does too, but goes on the design instead, so it is not
 * counted here, and neither is anything inside a booster, where `BasePartDTO`
 * stops looking up the parents.
 */
const coversParts = (n: ComponentNode): boolean =>
  n.type !== 'stage' &&
  n.type !== 'parallelstage' &&
  numOpt(n, 'overrideMass') !== undefined &&
  n['overrideSubcomponentsMass'] === true;

/**
 * A part's own mass (kg) and its CG from its own front (m), as the kernel
 * computes them: `RocketComponent.getComponentMass` and `getCG().getX()`,
 * which desktop's `BasePartDTO` writes as `CalcMass` and `CalcCG`. Undefined
 * when the build does not hold the part.
 */
export type ComponentFigures = (id: string) =>
  | {
      mass: number;
      cgX: number;
      /** A shock cord's cord length as it flies, automatic or not (m). */
      cordLength?: number;
      /** A parachute's shroud line length as it flies, automatic or not (m). */
      lineLength?: number;
      /** A recovery device's drag coefficient as it flies, automatic or not. */
      cd?: number;
    }
  | undefined;

// --------------------------------------------------------------- helpers ---

/** A number as RockSim writes them: plain decimal, no exponent, no long tail. */
const fmt = (v: number): string => plainDecimal(v, 6, '0');

const el = (w: Writer, depth: number, name: string, value: string | number): void => {
  w.emit(depth, `<${name}>${typeof value === 'number' ? fmt(value) : escapeXml(value)}</${name}>`);
};

const strOf = (n: ComponentNode, key: string): string | undefined => {
  const v = n[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
};

type MaterialKind = 'bulk' | 'surface' | 'line' | 'none';

/** `RockSimDensityType` ordinals, by material kind. */
const DENSITY_TYPES = { bulk: 0, surface: 1, line: 2 } as const;

/** The node keys each material kind is kept under. */
/**
 * The material a part is weighed with, as `Material` and `Density`.
 *
 * Desktop builds a part's material from those two elements alone, and a part
 * with no `Density` opens weighing nothing. The bridge (`ComponentFactory`)
 * takes a bulk material only from a positive density and a surface or line one
 * from any density (`statedMaterial`, the rule every writer reads), so a part
 * without one flies the kernel's default (`KERNEL_MATERIALS`), and that is what
 * goes out for it. A density with no name goes out as `custom`.
 */
function materialOf(n: ComponentNode, kind: Exclude<MaterialKind, 'none'>): { name: string; density: number } {
  return statedMaterial(n, MATERIAL_KEYS[kind], kind === 'bulk') ?? KERNEL_MATERIALS[kind];
}

/** Write a length/diameter/mass element only when the node carries the field. */
const put = (w: Writer, d: number, name: string, v: number | undefined, scale: (x: number) => number): void => {
  if (v !== undefined) el(w, d, name, scale(v));
};

/**
 * The header every RockSim part shares: name, material and density, the
 * measured mass/CG pair, finish, and the axial placement.
 *
 * `UseKnownCG` is the single switch RockSim has where we have three overrides.
 * It is written as 1 only when the node overrides mass, or overrides its CG
 * with its own mass known (stated, or the kernel's figure), because setting
 * it makes RockSim stop computing both from the geometry: turning it on for a
 * part that only overrides drag would freeze its mass at whatever we wrote.
 *
 * `ownMass` is the part's own mass where the writer states one (a mass object
 * carries it in KnownMass). KnownMass is written once per part, as
 * BasePartDTO writes `getMass()`: the override when there is one, else the
 * part's own mass.
 *
 * `kind` is the part's material slot, or `none` for a part weighed by a mass
 * it states (a mass component) or by its children (a pod).
 */
function writeCommon(
  w: Writer,
  d: number,
  n: ComponentNode,
  withPosition: boolean,
  kind: MaterialKind = 'bulk',
  ownMass?: number,
): void {
  el(w, d, 'Name', n.name ?? '');
  if (kind !== 'none') {
    const material = materialOf(n, kind);
    el(w, d, 'Material', material.name);
    // A surface density goes back out in g/cm2, which is a tenth of kg/m2. The
    // `BasePartDTO(RocketComponent)` constructor multiplies by the same constant
    // the reader divides by, so the two directions are one factor, not two;
    // writing x10 here would make an exported canopy a hundred times too heavy
    // in RockSim.
    el(w, d, 'Density', kind === 'surface' ? material.density * SURFACE_DENSITY : material.density);
    el(w, d, 'DensityType', DENSITY_TYPES[kind]);
  }

  const overrideMass = numOpt(n, 'overrideMass');
  const overrideCg = numOpt(n, 'overrideCGX');
  const figures = typeof n.id === 'string' ? w.componentInfo?.(n.id) : undefined;
  // The switch overrides mass and CG together, so each half the part does not
  // override is written as the part's own, as BasePartDTO writes them: a
  // CG-only override takes the mass the writer states, else the kernel's; a
  // mass-only override takes the kernel's CG for the part (getOverrideCGX is
  // the part's own CG while the CG is not overridden).
  const cgOnlyMass = overrideMass === undefined && overrideCg !== undefined ? (ownMass ?? figures?.mass) : undefined;
  const massOnlyCg = overrideMass !== undefined && overrideCg === undefined ? figures?.cgX : undefined;
  if (w.inSubtreeMass) {
    // Inside a part whose override covers its parts, which that part's
    // KnownMass already holds: written weighing nothing, as BasePartDTO does,
    // so RockSim does not count the part twice. With no mass the CG moves
    // nothing, so a part with no kernel figures goes out at its front.
    el(w, d, 'KnownMass', 0);
    el(w, d, 'KnownCG', mm(overrideCg ?? figures?.cgX ?? 0));
    el(w, d, 'UseKnownCG', 1);
  } else if (overrideMass !== undefined && overrideCg === undefined && massOnlyCg === undefined) {
    // No kernel figures, so no CG to pair with the mass: a CG of 0 would move the
    // part's CG to its front. Left out and named, with the part's own mass.
    if (ownMass !== undefined) el(w, d, 'KnownMass', g(ownMass));
    skip(w, { key: 'errors.rktSkip.massOverride', values: { name: notePartName(n) } });
  } else if (overrideMass !== undefined || cgOnlyMass !== undefined) {
    el(w, d, 'KnownMass', g(overrideMass ?? cgOnlyMass!));
    el(w, d, 'KnownCG', mm(overrideCg ?? massOnlyCg!));
    el(w, d, 'UseKnownCG', 1);
  } else {
    if (ownMass !== undefined) el(w, d, 'KnownMass', g(ownMass));
    // With no kernel figures there is no own mass to pair with the CG, so the
    // override is left out and named.
    if (overrideCg !== undefined) {
      skip(w, { key: 'errors.rktSkip.cgOverride', values: { name: notePartName(n) } });
    }
  }
  // RockSim's switch covers the part alone (`BaseHandler.setOverride` clears
  // the flags for the parts inside), and it has no drag override, which desktop
  // drops. A mass and CG that both cover the parts inside go out whole, the
  // parts inside weighing nothing (`inSubtreeMass`); one of the two alone does
  // not, since the parts inside still weigh what they do and move the CG. Both
  // are named rather than lost quietly.
  const label = { name: notePartName(n) };
  const subMass = n['overrideSubcomponentsMass'] === true && overrideMass !== undefined;
  const subCg = n['overrideSubcomponentsCG'] === true && overrideCg !== undefined;
  if (!w.inSubtreeMass && (subMass || subCg) && !(subMass && subCg)) {
    skip(w, { key: 'errors.rktSkip.subtreeOverride', values: label });
  }
  if (numOpt(n, 'overrideCD') !== undefined) skip(w, { key: 'errors.rktSkip.cdOverride', values: label });

  el(w, d, 'FinishCode', FINISH_CODES.get(strOf(n, 'finish') ?? 'normal') ?? MATT);

  if (withPosition) {
    // A part with no position stands where its constructor puts it, as it flies.
    const { method, offset } = positionOf(n);
    // Bottom flips sign, as the reader does. Middle becomes a top offset, as
    // desktop's BasePartDTO writes it: the gap from the parent's top to this
    // part's top when centered, plus the offset.
    const xb =
      method === 'bottom' ? -offset : method === 'middle' ? offset + (w.parentLength - axialLength(n)) / 2 : offset;
    el(w, d, 'Xb', mm(xb));
    el(w, d, 'LocationMode', LOCATION_CODES.get(method) ?? 0);
  }
}

/** `ConstructionType` + `WallThickness`, for the two shaped bodies. */
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
  el(w, d, 'ShapeCode', SHAPE_CODES.get(shape) ?? SHAPE_CODES.get(fallback)!);
  const param = numOpt(n, 'shapeParameter');
  if (param !== undefined) el(w, d, 'ShapeParameter', param);
}

// --------------------------------------------------------------- writers ---

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

/**
 * `RadialAngle` in degrees from radians; a zero angle is left out.
 *
 * A deliberate departure from desktop, which writes the radian value into this
 * degree element (and reads it back the same way). RockSim reads degrees, so
 * the conversion here and in `rktImport.readRadialAngle` is what makes the file
 * open with its parts where they were. A fin's `CantAngle` is not converted:
 * see `writeFinSet`.
 */
function writeRadialAngle(w: Writer, d: number, angle: number | undefined): void {
  if (angle) el(w, d, 'RadialAngle', radToDeg(angle));
}

/**
 * A tube's outer radius and wall as `OD` and `ID`; `ID` needs both.
 * `boreFirst` writes `ID` before `OD`, which a launch lug needs: desktop's
 * LaunchLugHandler applies them in file order, and
 * LaunchLug.setInnerRadius rebuilds the outer radius as the bore plus the
 * current wall, so an `ID` read second would undo the `OD`.
 */
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

/**
 * Off-axis placement, written where desktop's exporter writes it: an inner
 * tube and every ring part (BasePartDTO's RingComponent branch) and a mass
 * component or shock cord (MassObjectDTO). A parachute or streamer has neither,
 * and desktop's importer reads the pair back only for an inner tube or a pod.
 */
function writeRadial(w: Writer, d: number, n: ComponentNode): void {
  put(w, d, 'RadialLoc', numOpt(n, 'radialPosition'), mm);
  writeRadialAngle(w, d, numOpt(n, 'radialDirection'));
}

/** Both our tube types are one RockSim element, told apart by `IsInsideTube`. */
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
  // A bulkhead is solid; a centering ring states its bore; the tube-like rings
  // state a wall, so their ID comes from the thickness instead.
  const ir = numOpt(n, 'innerRadius');
  const th = numOpt(n, 'thickness');
  if (n.type === 'bulkhead') el(w, d, 'ID', 0);
  else if (ir !== undefined) el(w, d, 'ID', dia(ir));
  else if (or !== undefined && th !== undefined) el(w, d, 'ID', dia(or - th));
  writeRadial(w, d, n);
};

/** A tube on the outside of the airframe: its length, its wall, and where around the body it sits. */
const writeSurfaceTube = (w: Writer, d: number, n: ComponentNode, boreFirst = false): void => {
  put(w, d, 'Len', numOpt(n, 'length'), mm);
  writeTubeWall(w, d, n, boreFirst);
  writeRadialAngle(w, d, numOpt(n, rollAngleKey(n.type)!));
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
    // RockSim's order: trailing root point first, back to `0,0`, each pair
    // closed by `|`, as desktop's `CustomFinSetDTO.convertFreeFormPoints`
    // writes it. The outline is the kernel's (first point at `0,0`), so the
    // reversed list ends there and every reader turns it back the right way.
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

  // Radians, unconverted, as `FinSetDTO` writes it and `FinSetHandler` reads it,
  // to nine places: the six every other number takes would round a cant of a
  // degree or two to four figures.
  const cant = numOpt(n, 'cant');
  if (cant) el(w, d, 'CantAngle', plainDecimal(cant, 9, '0'));
  writeRadialAngle(w, d, numOpt(n, 'rotation'));
  // The fin's cross section, which RockSim calls a tip shape
  // (the `FinSetDTO(FinSet)` constructor). Without it RockSim reads every fin as square.
  const crossSection = strOf(n, 'crossSection') ?? 'square';
  el(w, d, 'TipShapeCode', TIP_SHAPE_CODES.get(crossSection) ?? 0);
  // An airfoil fin set with no override of its own opens with `CalcMass` and
  // `CalcCG` as its override (`FinSetHandler.endHandler`), so without them it
  // weighs nothing in desktop OpenRocket. The figures are the kernel's.
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
    // `FinSetDTO` writes `getTabOffset(AxialMethod.TOP)` and `FinSetHandler`
    // reads it as top, so the offset goes out measured from the root's front
    // whatever method the part keeps it in.
    const method = strOf(n, 'tabOffsetMethod') ?? 'middle';
    el(w, d, 'TabOffset', mm(tabPosition(numOpt(n, 'tabOffset') ?? 0, tabLength, finRootChord(n), method)));
  }
};

const writeTubeFinSet: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true);
  el(w, d, 'TubeCount', countOf(n, 'finCount', KERNEL_DEFAULTS.tubefinset.finCount));
  writeSurfaceTube(w, d, n);
};

/**
 * A value the kernel works out while the part's flag for it is on (an
 * automatic cord or line length, an automatic Cd). RockSim has no automatic
 * value, so it is written as the number the kernel flies; the stored one is
 * whatever it was when the flag went on. With no kernel figures the field is
 * left out and the part named.
 */
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
  writeCommon(w, d, n, true, 'surface'); // canopy fabric is a surface density
  // `Dia` is a diameter on both sides, not halved, unlike every other
  // circular field in the format.
  put(w, d, 'Dia', numOpt(n, 'diameter'), mm);
  // One round canopy, as `ParachuteDTO` writes it: RockSim reads a chute with
  // no `SideCount` as a hexagon, about a sixth smaller in area than the circle
  // the kernel flies. No `SpillHoleDia` either: the kernel flies no spill
  // hole (the app keeps one only as an `.ork` extension), and RockSim would
  // take it out of the area.
  el(w, d, 'SideCount', 0);
  const cd = flown(w, n, 'cd', 'cdAuto');
  if (cd !== undefined) el(w, d, 'DragCoefficient', cd);
  el(w, d, 'ShroudLineCount', numOpt(n, 'lineCount') ?? 6);
  put(w, d, 'ShroudLineLen', flown(w, n, 'lineLength', 'lineLengthAuto'), mm);
  el(w, d, 'ChuteCount', 1);
  // The density first: `ParachuteHandler` builds the line material when
  // `ShroudLineMaterial` closes, from the density it has read by then, so the
  // other order gives the lines a density of 0. kg/m straight through, despite
  // the element's name: see the note on the reader's side.
  // `ROCKSIM_TO_OPENROCKET_LINE_DENSITY` is 1.
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
    // A cord always states a length: with no kernel figure for an automatic one,
    // the stored length (the part is named as left unresolved).
    const len = (shockCord ? flown(w, n, 'cordLength', 'cordLengthAuto') : undefined) ?? numOpt(n, 'cordLength') ?? 0;
    // RockSim states a shock cord's mass, not its line density.
    const ownMass = shockCord ? (numOpt(n, 'lineDensity') ?? 0) * len : (numOpt(n, 'mass') ?? 0);
    // Desktop weighs a cord by its line material alone
    // (`mapMassObjectAsShockCord` drops `KnownMass` unless `UseKnownCG` is
    // set), and a mass component by the `KnownMass` it states.
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

/**
 * One pod, or one strap-on booster, which RockSim writes as a pod that
 * separates (`ParallelStageDTO`: `Detachable` 1). A set of several is split
 * into single pods before it gets here (`podMembers`).
 */
const writePod: PartWriter = (w, d, n) => {
  writeCommon(w, d, n, true, 'none');
  // `PodHandler` reads `RadialLoc` as a distance from the parent's centerline
  // (`RadiusMethod.FREE`), and `PodSetDTO` writes the resolved distance, so a
  // pod placed against the parent's surface goes out at its axis's distance.
  el(w, d, 'RadialLoc', mm(resolveAssemblyRadius(n, assemblyParentRadius(w.parent))));
  writeRadialAngle(w, d, numOpt(n, 'angleOffset'));
  el(w, d, 'Detachable', n.type === 'parallelstage' ? 1 : 0);
  el(w, d, 'Removed', 0);
};

/** Our type → its RockSim element name and the writer that fills it. */
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

/**
 * A flipped nose cone (a tail cone) as the transition RockSim can hold.
 *
 * RockSim has no flipped flag, so a `<NoseCone>` always points forward.
 * Desktop's `StageDTO.toNoseConeDTO` and `PodSetDTO` write a flipped cone as a
 * `TransitionDTO`: its base at the front, a point at the rear, and its base
 * shoulder as the front shoulder.
 */
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

/**
 * A clustered motor mount as the tubes RockSim can actually hold.
 *
 * RockSim has no cluster: it knows one tube per motor, each placed by its own
 * radial distance and angle. OpenRocket keeps one inner tube carrying a cluster
 * pattern, and the desktop's own exporter splits it on the way out
 * (`InnerBodyTubeDTO.handleCluster`). Without the split a three-motor cluster
 * would be saved as a single tube holding one motor.
 *
 * Every member keeps the mount's children, so an engine block inside the cluster
 * is written into each tube rather than only the first. The pattern itself is
 * dropped from the copies, because each one is a single tube.
 *
 * The member's radial place is the cluster offset added to whatever offset the
 * mount itself carried, composed in Cartesian and handed back as the distance
 * and angle the format states.
 */
function clusterMembers(n: ComponentNode): ComponentNode[] {
  const pattern = strOf(n, 'cluster');
  const count = clusterCount(pattern);
  if (n.type !== 'innertube' || count <= 1) return [n];
  const places = clusterPlacesOf(n);
  return places.map((p, i) => ({
    ...n,
    // Desktop's InnerBodyTubeDTO names each member `<name> #<n>`; a mount with
    // no name of its own takes its type's name, as a new desktop part does.
    name: `${partLabel(i18n.t, n)} #${i + 1}`,
    cluster: 'single',
    ...p,
  }));
}

/**
 * Parts inside a pod with the pod's roll added to their own.
 *
 * RockSim keeps a pod child's angle about the airframe, and the app keeps it
 * relative to the pod, so desktop's `PodSetDTO.addAngleOffsetToChildren` adds
 * the pod's angle on the way out and `PodHandler.subtractAngleOffset` takes it
 * off on the way in. Like desktop's, it stops at a nested pod: that pod's own
 * angle takes the addition, and it adds its own to its children when written.
 */
function withPodAngle(children: ComponentNode[] | undefined, angle: number): ComponentNode[] | undefined {
  if (!children || angle === 0) return children;
  return children.map((child) => {
    const key = rollAngleKey(child.type);
    const turned: ComponentNode = key ? { ...child, [key]: rollAngleOf(child)! + angle } : { ...child };
    if (!isAssembly(child.type)) turned.children = withPodAngle(child.children, angle);
    return turned;
  });
}

/**
 * A pod set or a set of strap-on boosters as the single pods RockSim holds.
 *
 * RockSim has one pod per element, so desktop's `PodSetDTO.generatePodSetDTOs`
 * splits a set the way `RocketComponent.splitInstances` does: one copy per
 * instance, each turned by its share of the circle, named `<name> #<n>`, with
 * the set's mass override shared between them. Each copy's parts carry its
 * angle ({@link withPodAngle}).
 */
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

/** Station (m from the nose tip) of a part's front, placed in the current parent. */
function stationOf(w: Writer, n: ComponentNode): number {
  return w.parentStart + startFromPosition(positionOf(n), axialLength(n), w.parentLength, w.parentStart);
}

/**
 * A tube coupler's own parts, written beside it in its parent's attached parts.
 *
 * Desktop's RingHandler reads nothing nested in a `<Ring>`, so parts left
 * inside the coupler (an e-bay's bulkheads, sled, altimeter) are lost with
 * their mass when desktop opens the file. Desktop's own writer
 * (TubeCouplerDTO) puts each child into the coupler's parent right after the
 * coupler, switched to AxialMethod.ABSOLUTE, so it goes out as LocationMode 1
 * with Xb at its station from the nose tip. A coupler inside a coupler goes
 * into the same parent the same way, and its parts are placed from its own
 * station.
 */
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
  // Still the coupler's parts, wherever the file puts them, so its override
  // covers them as it covers what is attached to any other part.
  const outerSub = w.inSubtreeMass;
  w.inSubtreeMass ||= coversParts(coupler);
  for (const kid of placed) writePart(w, depth, kid);
  w.inSubtreeMass = outerSub;
}

/**
 * One part and, in `<AttachedParts>`, everything mounted on it. A tube
 * coupler's parts follow it instead (writeCouplerParts). `at` is the part's
 * station when its place comes from the body chain rather than its position.
 */
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
  // RockSim has no repeat count, so a line of lugs or rings goes out as its
  // first copy; desktop's own export drops the count the same way. Named
  // rather than lost quietly.
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

/**
 * A stage's or an assembly's children, or any part's attached parts, with the
 * parent's front at station `start`. Body components in a stage or a pod stack
 * nose to tail, whatever their position field says, as resolveFilePositions
 * lays them out.
 */
function writeChildren(w: Writer, depth: number, parent: ComponentNode, start: number): void {
  const outer = { length: w.parentLength, start: w.parentStart, parent: w.parent, sub: w.inSubtreeMass };
  w.parentStart = start;
  w.parentLength = axialLength(parent);
  w.parent = parent;
  // A stage or a booster starts afresh; any other part adds its own override.
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

// ------------------------------------------------------------ the design ---

/** `RocketDesignDTO.CP_METHOD_BARROWMAN` and `CP_METHOD_ROCKSIM`, RockSim's CP method flags. */
const CP_BARROWMAN = 1;
const CP_ROCKSIM = 4;

/** The fin counts RockSim's Barrowman equations take (`RockSimSaver.supportsBarrowmanEquations`). */
const BARROWMAN_FIN_COUNTS = new Set([3, 4, 6]);

/** The planar fin sets, the ones `supportsBarrowmanEquations` counts (a tube fin set is not a `FinSet`). */
const PLANAR_FINS = new Set(['trapezoidfinset', 'ellipticalfinset', 'freeformfinset']);

/** Whether every planar fin set in the stages written has a fin count RockSim's Barrowman equations take. */
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

/**
 * The single stage's Cd override as RockSim's fixed Cd.
 *
 * `RockSimSaver`: `CalculateCD` 0 makes RockSim fly the design's `FixedCd`
 * instead of its own figure, which is the Cd of the whole design, so only a
 * single stage whose override covers its parts goes out as one. Any other
 * stage Cd override has no element, and is named: a stage carries none of the
 * part elements (`writeCommon`) that would name it otherwise.
 */
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

/**
 * Every stage's mass and the CG of every stack, when any stage overrides
 * either; true when they were written, which `UseKnownMass` follows.
 *
 * `RockSimSaver.setStageOverrides`: RockSim's stage overrides are all or
 * nothing. With `UseKnownMass` set it flies each stack of stages at the sum of
 * the stage masses and at that stack's CG from the nose tip, so the figures
 * written are the kernel's: each stage's structure mass, its override and its
 * parts included, and each stack's CG (`Stage3CG` for the sustainer alone,
 * `Stage32CG` with the first booster, `Stage321CG` with every stage). Read
 * back, they fly the stacks as the design does, whatever the stage overrides
 * cover. With no kernel figures they are left out and each stage named.
 */
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

// ----------------------------------------------------------------- entry ---

export interface RktExportResult {
  xml: string;
  /** What had no RockSim element and was left out, as keyed text to render. */
  skipped: Keyed[];
}

/**
 * Write a design as RockSim XML.
 *
 * Returns what was left out beside the text rather than throwing or silently
 * dropping them, so the caller can tell the user what did not make it into the
 * file they are about to hand to someone else.
 *
 * `componentInfo` gives the kernel's figures for a part, for the fields
 * desktop writes from the kernel (`CalcMass`, `CalcCG`), and `stageFigures`
 * the kernel's for each stage (see {@link StageFigures}), which a stage mass or
 * CG override needs; without them a part or stage that needs them is named in
 * `skipped`.
 */
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
  // Station of the current stage's front: stages stack nose to tail.
  let stageStart = 0;

  // RockSim reads at most three stages, nose-first. A design with more loses
  // the extras. A strap-on booster is not one of them: it is written where it
  // sits, as a pod that separates (writePod).
  const stages = asStageNodes(tree);
  const written = Math.min(stages.length, STAGE_ELEMENTS.length);
  if (stages.length > STAGE_ELEMENTS.length) {
    skip(w, { key: 'errors.rktSkip.extraStages', values: { from: STAGE_ELEMENTS.length + 1 } });
  }

  // No XML declaration. `GeneralRocketLoader` identifies a RockSim file by the
  // first eleven bytes being `<RockSimDoc` exactly (unlike its OpenRocket
  // check, which scans the buffer), so a declaration in front of the root
  // element makes desktop OpenRocket reject the file as "Unsupported or
  // corrupt file". The desktop's own `RockSimSaver` writes none either.
  w.emit(0, '<RockSimDocument>');
  // Version 4 is what OpenRocket's own saver writes and what its loader reads.
  w.emit(1, '<FileVersion>4</FileVersion>');
  w.emit(1, '<DesignInformation>');
  w.emit(2, '<RocketDesign>');
  w.emit(3, `<Name>${escapeXml(name)}</Name>`);
  const held = stages.slice(0, written);
  writeFixedCd(w, held);
  // The design's comments, designer credit and revision history, which
  // `RocketDesignDTO` carries and `RockSimHandler` reads back into the rocket.
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
  // RockSim's CP method for its drawings and its flights, as `RockSimSaver`
  // picks it: the Barrowman equations only where RockSim supports them
  // (`CRocket::SupportsBarrowmanEquations`: every fin set of 3, 4 or 6 fins),
  // and RockSim's own stability equations otherwise.
  const cpMethod = barrowmanFits(held) ? CP_BARROWMAN : CP_ROCKSIM;
  el(w, 3, 'CPCalcFlags', cpMethod);
  el(w, 3, 'CPSimFlags', cpMethod);
  if (knownMass) el(w, 3, 'UseKnownMass', 1);

  STAGE_ELEMENTS.forEach((elName, i) => {
    const stage = i < written ? stages[i] : undefined;
    const kids = stage?.children ?? [];
    if (kids.length === 0) {
      // Written empty even when unused: RockSim's own files always carry all
      // three blocks, and its reader keys off StageCount rather than presence.
      w.emit(3, `<${elName}/>`);
      return;
    }
    w.emit(3, `<${elName}>`);
    writeChildren(w, 4, stage!, stageStart);
    w.emit(3, `</${elName}>`);
    stageStart += kids.reduce((sum, n) => sum + (isChainType(n.type) ? partLength(n) : 0), 0);
  });

  w.emit(2, '</RocketDesign>');
  w.emit(1, '</DesignInformation>');
  w.emit(0, '</RockSimDocument>');

  return { xml: lines.join('\n') + '\n', skipped: [...w.skipped.values()] };
}
