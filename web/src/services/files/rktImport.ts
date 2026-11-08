import i18n from '../../i18n';
import type { ComponentNode, ComponentType } from '../../engine/openRocketEngine';
import { syncAutoRadii } from '../design/autoRadius';
import { defaultStageName, freshId } from '../design/orkTree';
import { xmlText as text } from './xmlUtil';
import { parseOrkXml, unpackOrk } from './ork/importUnpack';
import { clampCount, finiteNum } from './ork/numbers';
import { MAX_FIN_COUNT, MAX_FIN_POINTS, MAX_LINE_COUNT, checkDepth, countComponent } from './ork/importLimits';
import { ignoredNotes } from './ork/importNotes';
import { keyedNote, notePartName, type ImportNote } from './importNote';
import { KeyedError } from '../../i18n/keyedError';
import { type OrkFlightConfig, type OrkImportResult, defaultOrkConfig } from './orkTypes';
import { finCant, numOpt } from '../../tree/nodeProps';
import { bodyRadiusAt, trapezoidPoints } from '../../tree/finPlanform';
import { isAssembly } from '../../tree/assembly';
import { isChainType, rollAngleKey, rollAngleOf } from '../../tree/componentKinds';
import { partLength } from '../../tree/position';
import { shapeParamMax } from '../../tree/shapeProfile';
import { partLabel } from '../../i18n/format';
import { canHost } from '../design/treeEdit';
import { hexOf, parseHexColor } from '../design/colorHex';
import { degToRad } from '../../prefs/units';
import {
  CROSS_SECTIONS,
  FINISHES,
  LOCATION_METHODS,
  RING_TYPES,
  SECANT_OGIVE,
  SHAPES,
  SHAPE_PARAMETERS,
  STAGE_CG_ELEMENTS,
  STAGE_ELEMENTS,
  STAGE_MASS_ELEMENTS,
  SURFACE_DENSITY,
  UNKNOWN_SHAPE_CODE,
} from './rocksim/schema';

// RockSim units are mm and g, and circular dimensions are diameters.

const LENGTH = 1000;
/** Diameter in mm to radius in m. */
const RADIUS = 2000;
const MASS = 1000;

/** Bulk (kg/m³), surface (g/cm²), line (kg/m); only surface converts. */
const DENSITY_DIVISORS = [1, SURFACE_DENSITY, 1];

interface RktContext {
  notes: ImportNote[];
  ignored: Set<string>;
  dropped: Set<string>;
  incompatible: Set<string>;
  removed: string[];
  nodeCount: number;
}

/** Case-sensitive. */
const tag = (el: Element, name: string): string | null => text(el, `:scope > ${name}`);

const num = (el: Element, name: string): number | undefined => finiteNum(tag(el, name));

const mm = (el: Element, name: string): number | undefined => {
  const v = num(el, name);
  return v === undefined ? undefined : v / LENGTH;
};

const mmPos = (el: Element, name: string): number | undefined => nonNeg(mm(el, name));

/** A diameter in mm to a radius in m. */
const dia = (el: Element, name: string): number | undefined => {
  const v = num(el, name);
  return v === undefined ? undefined : Math.max(0, v / RADIUS);
};

/** 0 bulk, 1 surface, 2 line. */
const densityType = (el: Element): number => clampCount(num(el, 'DensityType') ?? 0, 0, 2);

// A Map, not a plain object: a file-supplied `constructor` would hit Object.prototype.
// cspell:ignore grey -- a CSS color keyword, not prose: CSS defines `gray` and
const BASIC_COLORS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    black: '#000000',
    silver: '#c0c0c0',
    gray: '#808080',
    grey: '#808080',
    white: '#ffffff',
    maroon: '#800000',
    red: '#ff0000',
    purple: '#800080',
    fuchsia: '#ff00ff',
    magenta: '#ff00ff',
    green: '#008000',
    lime: '#00ff00',
    olive: '#808000',
    yellow: '#ffff00',
    navy: '#000080',
    blue: '#0000ff',
    teal: '#008080',
    aqua: '#00ffff',
    cyan: '#00ffff',
  }),
);

// Anything else would mean different things to SVG, three.js and the exporter.
const rktColor = (raw: string | null | undefined): string | undefined => {
  const t = raw?.trim();
  if (!t) return undefined;
  const named = BASIC_COLORS.get(t.toLowerCase());
  if (named) return named;
  if (/^(#[0-9a-f]{3}|#?[0-9a-f]{6})$/i.test(t)) {
    const rgb = parseHexColor(t);
    if (rgb !== null) return hexOf(rgb);
  }
  return undefined;
};

const nonNeg = (v: number | undefined): number | undefined => (v === undefined ? undefined : Math.max(0, v));

/** A zero ID means a solid part, not a missing value (`setInnerRadius` is `setThickness(getOuterRadius() - r)`). */
const wallFrom = (od: number | undefined, id: number | undefined): number | undefined =>
  od !== undefined && id !== undefined && od >= id ? od - id : undefined;

const put = (n: ComponentNode, key: string, v: number | string | undefined): void => {
  if (v !== undefined) n[key] = v;
};

const readTubeWall = (el: Element, n: ComponentNode): void => {
  const od = dia(el, 'OD');
  put(n, 'outerRadius', od);
  put(n, 'thickness', wallFrom(od, dia(el, 'ID')));
};

/** Degrees to radians, deliberately unlike desktop, which passes degrees to the radian setters. */
const readRadialAngle = (el: Element, n: ComponentNode, key: 'angleOffset' | 'rotation' | 'radialDirection'): void => {
  const angle = num(el, 'RadialAngle');
  if (angle) n[key] = degToRad(angle);
};

// Overrides are self-only: `BaseHandler` clears "apply to subcomponents".
function readCommon(el: Element, n: ComponentNode, withPosition: boolean): void {
  const name = tag(el, 'Name');
  if (name) n.name = name;

  const density = num(el, 'Density');
  if (density !== undefined && density > 0) {
    n.density = density / DENSITY_DIVISORS[densityType(el)]!;
  }
  const material = tag(el, 'Material');
  if (material) n['materialName'] = material;

  const finish = num(el, 'FinishCode');
  if (finish !== undefined) {
    const f = FINISHES[clampCount(finish, 0, FINISHES.length - 1)]!;
    if (f !== 'normal') n['finish'] = f;
  }

  if (tag(el, 'UseKnownCG') === '1') {
    const knownMass = num(el, 'KnownMass');
    const knownCg = mm(el, 'KnownCG');
    if (knownMass !== undefined) n['overrideMass'] = Math.max(0, knownMass / MASS);
    if (knownCg !== undefined) n['overrideCGX'] = Math.max(0, knownCg);
  }

  const color = rktColor(tag(el, 'Color'));
  if (color) n['color'] = color;

  if (withPosition) {
    const offset = mm(el, 'Xb') ?? 0;
    const method = LOCATION_METHODS[clampCount(num(el, 'LocationMode') ?? 0, 0, 2)]!;
    // Only bottom flips sign (`PositionDependentHandler.setLocation`).
    n.position = { method, offset: method === 'bottom' ? -offset : offset };
  }
}

const base = (el: Element, type: ComponentType, withPosition: boolean): ComponentNode => {
  const n: ComponentNode = { type, id: freshId() };
  readCommon(el, n, withPosition);
  return n;
};

const readWall = (el: Element, n: ComponentNode): void => {
  if (num(el, 'ConstructionType') === 0) {
    n['filled'] = true;
    return;
  }
  put(n, 'thickness', mmPos(el, 'WallThickness'));
};

const PARAMETERIZED_SHAPES = new Set(['power', 'parabolic', 'haack']);

/** `MathUtil.EPSILON`. */
const EPSILON = 1e-8;

const readShape = (ctx: RktContext, el: Element, n: ComponentNode, fallbackCode: number): void => {
  const raw = num(el, 'ShapeCode');
  const stated = raw === undefined ? fallbackCode : Math.round(raw);
  const code = stated >= 0 && stated < SHAPES.length ? stated : UNKNOWN_SHAPE_CODE;
  const shape = SHAPES[code]!;
  n['shape'] = shape;
  // The file's `ShapeParameter` does not override an implied one.
  const implied = SHAPE_PARAMETERS[code];
  if (implied !== undefined) {
    n['shapeParameter'] = implied;
    if (code === SECANT_OGIVE) ctx.notes.push(keyedNote('importNote.rktSecantOgive', { part: notePartName(n) }));
    return;
  }
  // RockSim writes ShapeParameter on every shape; the mesh and writers read the key.
  const param = num(el, 'ShapeParameter');
  if (!PARAMETERIZED_SHAPES.has(shape) || param === undefined) return;
  // Clamped as `Transition.setShapeParameter` does: RockSim allows Haack past 1/3.
  const clamped = Math.min(shapeParamMax(shape), Math.max(0, param));
  n['shapeParameter'] = clamped;
  if (Math.abs(clamped - param) > EPSILON) {
    ctx.notes.push(
      keyedNote('importNote.rktShapeParameter', {
        part: notePartName(n),
        value: tag(el, 'ShapeParameter') ?? String(param),
        used: Number(clamped.toPrecision(4)),
      }),
    );
  }
};

const readMount = (el: Element, n: ComponentNode): void => {
  if (tag(el, 'IsMotorMount') !== '1') return;
  n['motorMount'] = true;
  const overhang = mm(el, 'EngineOverhang');
  if (overhang !== undefined && overhang !== 0) n['motorOverhang'] = overhang;
};

// Left unset, the kernel takes the previous part's wall.
const shoulderWall = (el: Element, n: ComponentNode, shoulderRadius: number | undefined): number | undefined =>
  n['filled'] === true ? shoulderRadius : mmPos(el, 'WallThickness');

/** Desktop sets shoulder radii through clamping setters. */
const shoulderAtMost = (radius: number | undefined, end: unknown): number | undefined =>
  radius !== undefined && typeof end === 'number' ? Math.min(radius, end) : radius;

// No shoulder cap key: desktop reads a `.rkt` shoulder open.

const readNoseCone = (ctx: RktContext, el: Element): ComponentNode => {
  const n = base(el, 'nosecone', false);
  put(n, 'length', mmPos(el, 'Len'));
  put(n, 'aftRadius', dia(el, 'BaseDia'));
  readWall(el, n);
  readShape(ctx, el, n, 1);
  const shR = shoulderAtMost(dia(el, 'ShoulderOD'), n['aftRadius']);
  const shL = mmPos(el, 'ShoulderLen');
  put(n, 'shoulderRadius', shR);
  put(n, 'shoulderLength', shL);
  put(n, 'shoulderThickness', shoulderWall(el, n, shR));
  if (n['filled'] === true && (num(el, 'CoreDia') ?? 0) > 0 && (num(el, 'CoreLen') ?? 0) > 0) {
    ctx.notes.push(keyedNote('importNote.rktDrilledCore', { part: notePartName(n) }));
  }
  return n;
};

// As `NoseConeHandler.addBaseExtension`; a nose mass override already covers the extension.
function baseExtension(el: Element, nose: ComponentNode): ComponentNode | undefined {
  const length = mmPos(el, 'BaseExtensionLen');
  if (!length) return undefined;
  const ext: ComponentNode = {
    type: 'transition',
    id: freshId(),
    name: i18n.t('importNote.rktBaseExtensionName', { name: partLabel(i18n.t, nose) }),
    shape: 'conical',
    length,
  };
  put(ext, 'foreRadius', numOpt(nose, 'aftRadius'));
  put(ext, 'aftRadius', numOpt(nose, 'aftRadius'));
  if (nose['filled'] === true) ext['filled'] = true;
  for (const key of ['thickness', 'density', 'materialName', 'finish', 'color']) {
    const v = nose[key];
    if (typeof v === 'number' || typeof v === 'string') put(ext, key, v);
  }
  put(ext, 'aftShoulderRadius', numOpt(nose, 'shoulderRadius'));
  put(ext, 'aftShoulderLength', numOpt(nose, 'shoulderLength'));
  put(ext, 'aftShoulderThickness', numOpt(nose, 'shoulderThickness'));
  if (nose['shoulderLength'] !== undefined) nose['shoulderLength'] = 0;
  if (nose['overrideMass'] !== undefined) ext['overrideMass'] = 0;
  return ext;
}

// No placement: `TransitionHandler` is not a `PositionDependentHandler`, so desktop ignores `Xb`.
const readTransition = (ctx: RktContext, el: Element): ComponentNode => {
  const n = base(el, 'transition', false);
  put(n, 'length', mmPos(el, 'Len'));
  put(n, 'foreRadius', dia(el, 'FrontDia'));
  put(n, 'aftRadius', dia(el, 'RearDia'));
  readWall(el, n);
  readShape(ctx, el, n, 0);
  const fShR = shoulderAtMost(dia(el, 'FrontShoulderDia'), n['foreRadius']);
  const aShR = shoulderAtMost(dia(el, 'RearShoulderDia'), n['aftRadius']);
  const fShL = mmPos(el, 'FrontShoulderLen');
  const aShL = mmPos(el, 'RearShoulderLen');
  put(n, 'foreShoulderRadius', fShR);
  put(n, 'foreShoulderLength', fShL);
  put(n, 'aftShoulderRadius', aShR);
  put(n, 'aftShoulderLength', aShL);
  put(n, 'foreShoulderThickness', shoulderWall(el, n, fShR));
  put(n, 'aftShoulderThickness', shoulderWall(el, n, aShR));
  return n;
};

// Decided by the parent, not `IsInsideTube`, as desktop does.
const readBodyTube = (el: Element, parent: ComponentNode | undefined): ComponentNode => {
  const inner = parent !== undefined && !isAssembly(parent.type);
  const n = base(el, inner ? 'innertube' : 'bodytube', inner);
  put(n, 'length', mmPos(el, 'Len'));
  readTubeWall(el, n);
  readMount(el, n);
  if (inner) {
    put(n, 'radialPosition', mmPos(el, 'RadialLoc'));
    readRadialAngle(el, n, 'radialDirection');
  }
  return n;
};

const readRing = (el: Element): ComponentNode => {
  const n = base(el, RING_TYPES[num(el, 'UsageCode') ?? 0] ?? 'centeringring', true);
  put(n, 'length', mmPos(el, 'Len'));
  const id = dia(el, 'ID');
  // With no `OD`, desktop's `setInnerRadius` raises the outer radius to the bore and turns Automatic off.
  const od = dia(el, 'OD') ?? ((n.type === 'centeringring' || n.type === 'bulkhead') && id ? id : undefined);
  put(n, 'outerRadius', od);
  // An `ID` of 0 leaves the bore automatic: `setInnerRadius(0)` returns before turning Automatic off.
  if (n.type === 'centeringring') {
    if (id) put(n, 'innerRadius', id);
    else n['innerRadiusAuto'] = true;
  }
  if (n.type === 'tubecoupler' || n.type === 'engineblock') put(n, 'thickness', wallFrom(od, id));
  return n;
};

const readLaunchLug = (el: Element): ComponentNode => {
  const n = base(el, 'launchlug', true);
  put(n, 'length', mmPos(el, 'Len'));
  readTubeWall(el, n);
  // `LaunchLug.setInnerRadius` keeps the 1 mm wall, so desktop reads ID/2 + 1 mm whatever OD says.
  const inner = dia(el, 'ID');
  if (inner !== undefined) {
    n['thickness'] = LUG_WALL;
    n['outerRadius'] = inner + LUG_WALL;
  }
  readRadialAngle(el, n, 'angleOffset');
  return n;
};

const LUG_WALL = 0.001;

// `Transition.isCompatible` admits only freeform fins.
const FREEFORM_ONLY_PARENTS = new Set(['nosecone', 'transition']);

// Unsnapped: desktop's `convertFinSet` detaches the fin first.
function trapezoidOutline(n: ComponentNode): [number, number][] {
  const root = numOpt(n, 'rootChord') ?? 0;
  const tip = numOpt(n, 'tipChord') ?? 0;
  const span = numOpt(n, 'height') ?? 0;
  const sweep = numOpt(n, 'sweep') ?? 0;
  return trapezoidPoints(root, tip, sweep, span);
}

function readFinSet(ctx: RktContext, el: Element, parent?: ComponentNode): ComponentNode {
  const shape = clampCount(num(el, 'ShapeCode') ?? 0, 0, 2);
  const type: ComponentType = shape === 1 ? 'ellipticalfinset' : shape === 2 ? 'freeformfinset' : 'trapezoidfinset';
  const n = base(el, type, true);
  n['finCount'] = clampCount(num(el, 'FinCount') ?? 3, 1, MAX_FIN_COUNT);
  put(n, 'thickness', mmPos(el, 'Thickness'));

  if (type === 'trapezoidfinset') {
    put(n, 'rootChord', mmPos(el, 'RootChord'));
    put(n, 'tipChord', mmPos(el, 'TipChord'));
    put(n, 'height', mmPos(el, 'SemiSpan'));
    put(n, 'sweep', mm(el, 'SweepDistance'));
  } else if (type === 'ellipticalfinset') {
    put(n, 'rootChord', mmPos(el, 'RootChord'));
    put(n, 'height', mmPos(el, 'SemiSpan'));
  } else {
    const pts = readPointList(ctx, el, n);
    if (pts.length >= 3) n['points'] = pts;
    else ctx.notes.push(keyedNote('importNote.finPointsTooFew', { part: notePartName(n) }));
  }

  // Radians, unconverted both ways (unlike `RadialAngle`).
  const cant = finCant({ type: n.type, cant: num(el, 'CantAngle') ?? 0 });
  if (cant !== 0) n['cant'] = cant;
  readRadialAngle(el, n, 'rotation');

  const cross = CROSS_SECTIONS[clampCount(num(el, 'TipShapeCode') ?? 0, 0, CROSS_SECTIONS.length - 1)]!;
  if (cross !== 'square') n['crossSection'] = cross;

  // As `FinSetHandler.endHandler`: otherwise the two disagree drastically.
  if (cross === 'airfoil' && n['overrideMass'] === undefined) {
    const calcMass = num(el, 'CalcMass');
    const calcCg = mm(el, 'CalcCG');
    if (calcMass !== undefined) n['overrideMass'] = Math.max(0, calcMass / MASS);
    if (calcCg !== undefined) n['overrideCGX'] = Math.max(0, calcCg);
  }

  const tabLength = mmPos(el, 'TabLength');
  if (tabLength !== undefined && tabLength > 0) {
    n['tabLength'] = tabLength;
    const tabOffset = mm(el, 'TabOffset') ?? 0;
    const tabDepth = mmPos(el, 'TabDepth');
    if (tabDepth !== undefined) {
      // From the parent's fore end, not the fin: desktop reads the radius before attaching.
      const front = parent ? (bodyRadiusAt(parent, tabOffset) ?? 0) : 0;
      const back = parent ? (bodyRadiusAt(parent, tabOffset + tabLength) ?? 0) : 0;
      n['tabHeight'] = Math.max(0, tabDepth - Math.max(front - back, 0));
    }
    n['tabOffset'] = tabOffset;
    n['tabOffsetMethod'] = 'top';
  }
  return n;
}

// As `FinSetHandler.toCoordinates`. `indexOf`, not `split`, so the cap bounds the work on a crafted list.
function readPointList(ctx: RktContext, el: Element, fin: ComponentNode): [number, number][] {
  const raw = tag(el, 'PointList');
  if (!raw) return [];
  const out: [number, number][] = [];
  let unreadable = 0;
  let at = 0;
  while (at <= raw.length) {
    if (out.length >= MAX_FIN_POINTS) {
      ctx.notes.push(keyedNote('importNote.finPointsCapped', { max: MAX_FIN_POINTS }));
      break;
    }
    const bar = raw.indexOf('|', at);
    const pair = raw.slice(at, bar === -1 ? raw.length : bar);
    const comma = pair.indexOf(',');
    if (comma !== -1) {
      const x = finiteNum(pair.slice(0, comma));
      const y = finiteNum(pair.slice(comma + 1));
      const last = out[out.length - 1];
      const repeatedOrigin = x === 0 && y === 0 && last?.[0] === 0 && last[1] === 0;
      if (x === undefined || y === undefined) unreadable++;
      else if (!repeatedOrigin) out.push([x / LENGTH, y / LENGTH]);
    } else if (pair.trim() !== '') {
      unreadable++;
    }
    if (bar === -1) break;
    at = bar + 1;
  }
  if (unreadable > 0) {
    ctx.notes.push(keyedNote('importNote.finPointsUnreadable', { part: notePartName(fin), count: unreadable }));
  }
  const last = out[out.length - 1];
  if (last?.[0] === 0 && last[1] === 0) out.reverse();
  return out;
}

const readTubeFinSet = (el: Element): ComponentNode => {
  const n = base(el, 'tubefinset', true);
  n['finCount'] = clampCount(num(el, 'TubeCount') ?? 6, 1, MAX_FIN_COUNT);
  put(n, 'length', mmPos(el, 'Len'));
  readTubeWall(el, n);
  readRadialAngle(el, n, 'rotation');
  return n;
};

/** kg/m2 (`RecoveryDeviceHandler.computeDensity`); line converts as surface. */
function canopyDensity(el: Element, area: number): number | undefined {
  const type = densityType(el);
  const thickness = mmPos(el, 'Thickness');
  const raw = num(el, 'Density');
  if (raw !== undefined && raw > 0) {
    if (type !== 0) return raw / SURFACE_DENSITY;
    return thickness === undefined ? undefined : raw * thickness;
  }
  const calcMass = num(el, 'CalcMass');
  if (calcMass === undefined || !(area > 0)) return undefined;
  const perArea = Math.max(0, calcMass / MASS) / area;
  if (type !== 0) return perArea;
  return thickness === undefined ? undefined : perArea * thickness;
}

function applySurfaceMaterial(n: ComponentNode, density: number | undefined): void {
  if (density !== undefined) {
    n['surfaceDensity'] = density;
    n['surfaceMaterialName'] = n['materialName'];
  }
  delete n.density;
  delete n['materialName'];
}

// As `ParachuteHandler` approximates it.
function packedRadius(parent: ComponentNode | undefined, diameter: number | undefined): number | undefined {
  const outer = typeof parent?.['outerRadius'] === 'number' ? parent['outerRadius'] : undefined;
  if (parent?.type === 'bodytube' && outer !== undefined) return outer * 0.9;
  if (parent?.type === 'innertube' && outer !== undefined) {
    const wall = typeof parent['thickness'] === 'number' ? parent['thickness'] : 0;
    return Math.max(0, outer - wall) * 0.9;
  }
  return diameter === undefined ? undefined : diameter * 0.025;
}

/** `ParachuteHandler.setEquivalentDiameter`; the spill hole is folded in, so it must not also be carried. */
function equivalentDiameter(ctx: RktContext, el: Element, n: ComponentNode, diameter: number): number {
  const sides = Math.round(num(el, 'SideCount') ?? 6);
  const chutes = Math.max(1, Math.round(num(el, 'ChuteCount') ?? 1));
  const spill = mmPos(el, 'SpillHoleDia') ?? 0;
  const r = diameter / 2;
  const canopy = sides < 3 ? Math.PI * r * r : 0.5 * sides * r * r * Math.sin((2 * Math.PI) / sides);
  const area = chutes * (canopy - Math.PI * (spill / 2) ** 2);
  if (!(area > 0)) return diameter;
  const round = 2 * Math.sqrt(area / Math.PI);
  if (Math.abs(round - diameter) <= EPSILON) return diameter;
  ctx.notes.push(
    keyedNote('importNote.rktParachuteArea', {
      part: notePartName(n),
      diameter: (round * LENGTH).toFixed(1),
      original: (diameter * LENGTH).toFixed(1),
    }),
  );
  return round;
}

const readParachute = (ctx: RktContext, el: Element, parent?: ComponentNode): ComponentNode => {
  const n = base(el, 'parachute', true);
  // A diameter on both sides, so it converts by LENGTH, not RADIUS.
  const diameter = mmPos(el, 'Dia');
  put(n, 'diameter', diameter && equivalentDiameter(ctx, el, n, diameter));
  put(n, 'cd', num(el, 'DragCoefficient'));
  const lines = num(el, 'ShroudLineCount');
  if (lines !== undefined) n['lineCount'] = clampCount(lines, 0, MAX_LINE_COUNT);
  put(n, 'lineLength', mmPos(el, 'ShroudLineLen'));
  const lineMaterial = tag(el, 'ShroudLineMaterial');
  if (lineMaterial) n['lineMaterialName'] = lineMaterial;
  // Despite "PerMM", this is kg/m and passes through unscaled. 0 is kept, as desktop does.
  const lineDensity = num(el, 'ShroudLineMassPerMM');
  if (lineDensity !== undefined && lineDensity >= 0) n['lineDensity'] = lineDensity;
  applySurfaceMaterial(n, canopyDensity(el, Math.PI * (diameter ?? 0) ** 2 * 0.25));
  const packed = packedRadius(parent, diameter);
  put(n, 'radius', packed);
  put(n, 'length', packed);
  return n;
};

const readStreamer = (el: Element): ComponentNode => {
  const n = base(el, 'streamer', true);
  const stripLength = mmPos(el, 'Len');
  const stripWidth = mmPos(el, 'Width');
  put(n, 'stripLength', stripLength);
  put(n, 'stripWidth', stripWidth);
  put(n, 'cd', num(el, 'DragCoefficient'));
  applySurfaceMaterial(n, canopyDensity(el, (stripLength ?? 0) * (stripWidth ?? 0)));
  return n;
};

/** `MassObjectHandler.MASS_LEN_FUDGE_FACTOR`. */
const CORD_PACKED_RATIO = 100;

// `MassObjectHandler.inferAsShockCord`: RockSim's type code is unreliable.
const isShockCord = (el: Element, parent: ComponentNode | undefined, len: number | undefined): boolean => {
  if (num(el, 'TypeCode') === 1) return true;
  const parentLen = typeof parent?.['length'] === 'number' ? parent['length'] : undefined;
  return len !== undefined && parentLen !== undefined && len >= 2 * parentLen && densityType(el) === 2;
};

const readMassObject = (el: Element, parent?: ComponentNode): ComponentNode => {
  const len = mmPos(el, 'Len');
  const shockCord = isShockCord(el, parent, len);
  const n = base(el, shockCord ? 'shockcord' : 'masscomponent', true);
  const mass = num(el, 'KnownMass');
  if (shockCord) {
    put(n, 'cordLength', len);
    if (len !== undefined) n['length'] = len / CORD_PACKED_RATIO;
    // With no stated density desktop leaves the line weightless, not the kernel's default cord.
    const stated = typeof n.density === 'number';
    n['lineDensity'] = stated ? n.density : 0;
    n['lineMaterialName'] = stated ? n['materialName'] : '';
    delete n.density;
    delete n['materialName'];
    const bore = coaxialBore(parent);
    put(n, 'radius', bore ?? dia(el, 'Dia'));
  } else {
    put(n, 'length', len);
    if (mass !== undefined) n['mass'] = Math.max(0, mass / MASS);
    put(n, 'radius', dia(el, 'Dia'));
  }
  // RockSim's CG is already in the position; kept, it would count twice (`MassObjectHandler`).
  if (n['overrideCGX'] !== undefined) n['overrideCGX'] = 0;
  return n;
};

// As `RingTailHandler`: a mass component, its drag not flown.
const readRingTail = (el: Element): ComponentNode => {
  const n = base(el, 'masscomponent', true);
  put(n, 'length', mmPos(el, 'Len'));
  if (n['overrideMass'] === undefined) {
    n['mass'] = Math.max(0, (num(el, 'CalcMass') ?? 0) / MASS);
    n['overrideCGX'] = mm(el, 'CalcCG') ?? 0;
  }
  return n;
};

function coaxialBore(parent: ComponentNode | undefined): number | undefined {
  if (!parent) return undefined;
  if (!['bodytube', 'innertube', 'tubecoupler', 'engineblock'].includes(parent.type)) return undefined;
  const outer = typeof parent['outerRadius'] === 'number' ? parent['outerRadius'] : undefined;
  if (outer === undefined) return undefined;
  const wall = typeof parent['thickness'] === 'number' ? parent['thickness'] : 0;
  return Math.max(0, outer - wall);
}

const readPod = (ctx: RktContext, el: Element): ComponentNode => {
  const separates = tag(el, 'Detachable') === '1' || tag(el, 'Removed') === '1';
  const n = base(el, separates ? 'parallelstage' : 'podset', true);
  put(n, 'radiusOffset', mmPos(el, 'RadialLoc'));
  n['radiusMethod'] = 'free';
  readRadialAngle(el, n, 'angleOffset');
  n['instanceCount'] = 1;
  if (tag(el, 'Removed') === '1' && n.id) ctx.removed.push(n.id);
  return n;
};

/** RockSim stores pod children's angles absolute (`PodHandler.subtractAngleOffset`). */
function subtractAngleOffset(children: ComponentNode[], angle: number): void {
  for (const child of children) {
    const key = rollAngleKey(child.type);
    if (key) child[key] = (rollAngleOf(child) ?? 0) - angle;
    if (!isAssembly(child.type) && child.children) {
      subtractAngleOffset(child.children, angle);
    }
  }
}

/** Wrapped, not clamped: the setters clamp, so 270° would fly at 180°. */
function wrapMountAngles(nodes: ComponentNode[]): ComponentNode[] {
  for (const n of nodes) {
    const a = n['angleOffset'];
    const mount = n.type === 'launchlug' || n.type === 'railbutton';
    if (mount && typeof a === 'number' && Number.isFinite(a) && Math.abs(a) > Math.PI) {
      n['angleOffset'] = a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
    }
    if (n.children) wrapMountAngles(n.children);
  }
  return nodes;
}

type Reader = (ctx: RktContext, el: Element, parent?: ComponentNode) => ComponentNode;

const READERS: Record<string, Reader> = {
  NoseCone: readNoseCone,
  BodyTube: (_c, el, parent) => readBodyTube(el, parent),
  Transition: readTransition,
  Ring: (_c, el) => readRing(el),
  LaunchLug: (_c, el) => readLaunchLug(el),
  FinSet: readFinSet,
  CustomFinSet: readFinSet,
  TubeFinSet: (_c, el) => readTubeFinSet(el),
  Parachute: readParachute,
  Streamer: (_c, el) => readStreamer(el),
  MassObject: (_c, el, parent) => readMassObject(el, parent),
  RingTail: (_c, el) => readRingTail(el),
  ExternalPod: readPod,
};

function readParts(ctx: RktContext, container: Element, depth = 0, parent?: ComponentNode): ComponentNode[] {
  checkDepth(depth, '.rkt');
  const out: ComponentNode[] = [];
  for (const el of Array.from(container.children)) {
    if (el.tagName === 'AttachedParts') {
      out.push(...readParts(ctx, el, depth + 1, parent));
      continue;
    }
    if (el.tagName === 'SubAssembly') {
      ctx.dropped.add('importNote.rktSubassembly');
      out.push(...readParts(ctx, el, depth + 1, parent));
      continue;
    }
    const read = Object.prototype.hasOwnProperty.call(READERS, el.tagName) ? READERS[el.tagName] : undefined;
    if (!read) {
      if (el.children.length > 0) ctx.ignored.add(el.tagName);
      continue;
    }
    countComponent(ctx, '.rkt');
    const node = read(ctx, el, parent);
    if (parent !== undefined && FREEFORM_ONLY_PARENTS.has(parent.type)) {
      if (node.type === 'trapezoidfinset') {
        node['points'] = trapezoidOutline(node);
        delete node['rootChord'];
        delete node['tipChord'];
        delete node['height'];
        delete node['sweep'];
        node.type = 'freeformfinset';
      } else if (node.type === 'ellipticalfinset') {
        ctx.dropped.add('importNote.rktEllipticalOnBody');
        continue;
      }
    }
    // `BaseHandler.isCompatible`: kept, it would make the kernel's `addChild` throw.
    const parentType = parent?.type ?? 'stage';
    if (!canHost(parentType, node.type)) {
      const pair = `${node.type}|${parentType}`;
      if (!ctx.incompatible.has(pair)) {
        ctx.incompatible.add(pair);
        ctx.notes.push(
          keyedNote('importNote.rktIncompatible', {
            part: { key: `part.${node.type}` },
            parent: { key: `part.${parentType}` },
          }),
        );
      }
      continue;
    }
    const kids = readParts(ctx, el, depth + 1, node);
    if (kids.length > 0) node.children = kids;
    if (isAssembly(node.type) && node.children) {
      subtractAngleOffset(node.children, numOpt(node, 'angleOffset') ?? 0);
    }
    out.push(node);
    if (el.tagName === 'RingTail') {
      ctx.notes.push(keyedNote('importNote.rktRingTail', { part: notePartName(node) }));
    }
    const ext = node.type === 'nosecone' && canHost(parentType, 'transition') ? baseExtension(el, node) : undefined;
    if (ext) {
      countComponent(ctx, '.rkt');
      out.push(ext);
      ctx.notes.push(keyedNote('importNote.rktBaseExtension', { part: notePartName(node), extension: ext.name ?? '' }));
    }
  }
  return out;
}

const NEWEST_FILE_VERSION = 4;

/** The file's CGs are of the whole stack from the nose tip, so each stage CG comes from mass moments. */
function applyStageOverrides(design: Element, stages: ComponentNode[]): void {
  if ((num(design, 'UseKnownMass') ?? 0) === 0) return;
  let stackMass = 0;
  let stackMoment = 0;
  let cgKnown = true;
  let front = 0;
  stages.forEach((stage, i) => {
    const start = front;
    front += (stage.children ?? []).reduce((sum, n) => sum + (isChainType(n.type) ? partLength(n) : 0), 0);
    const mass = (num(design, STAGE_MASS_ELEMENTS[i]!) ?? 0) / MASS;
    if (!(mass > 0)) {
      cgKnown = false;
      return;
    }
    stage['overrideMass'] = mass;
    stage['overrideSubcomponentsMass'] = true;
    const stackCg = mm(design, STAGE_CG_ELEMENTS[i]!) ?? 0;
    cgKnown &&= stackCg > 0;
    if (cgKnown) {
      stage['overrideCGX'] = (stackCg * (stackMass + mass) - stackMoment) / mass - start;
      stage['overrideSubcomponentsCG'] = true;
    }
    stackMass += mass;
    stackMoment = stackCg * stackMass;
  });
}

// Single-stage only: which Cd RockSim flies each stack with is unknown.
function applyFixedCd(ctx: RktContext, design: Element, stages: ComponentNode[]): void {
  const fixed = num(design, 'FixedCd') ?? 0;
  if (num(design, 'CalculateCD') !== 0 || !(fixed > 0) || stages.length === 0) return;
  if (stages.length > 1) {
    ctx.notes.push(keyedNote('importNote.rktFixedCdStages'));
    return;
  }
  stages[0]!['overrideCD'] = fixed;
  stages[0]!['overrideSubcomponentsCD'] = true;
}

export function importRkt(data: ArrayBuffer | string): OrkImportResult {
  const doc = parseOrkXml(unpackOrk(data).xml, '.rkt');
  const design = doc.querySelector('RockSimDocument > DesignInformation > RocketDesign');
  if (!design) throw new KeyedError('errors.file.notRkt');

  const name = tag(design, 'Name') ?? i18n.t('library.untitled');
  const ctx: RktContext = {
    notes: [],
    ignored: new Set(),
    dropped: new Set(),
    incompatible: new Set(),
    removed: [],
    nodeCount: 0,
  };

  // Counted from the nose: a single-stage design lives in Stage3Parts.
  const stageCount = clampCount(num(design, 'StageCount') ?? 1, 1, STAGE_ELEMENTS.length);
  const present = STAGE_ELEMENTS.slice(0, stageCount);

  const components: ComponentNode[] = [];
  present.forEach((elName, i) => {
    const stageEl = design.querySelector(`:scope > ${elName}`);
    countComponent(ctx, '.rkt');
    const stage: ComponentNode = {
      type: 'stage',
      id: freshId(),
      name: defaultStageName(i),
    };
    const kids = stageEl ? readParts(ctx, stageEl) : [];
    if (kids.length > 0) stage.children = kids;
    components.push(stage);
  });

  if (components.every((s) => (s.children ?? []).length === 0)) {
    throw new KeyedError('errors.file.noComponents');
  }
  applyStageOverrides(design, components);
  applyFixedCd(ctx, design, components);

  const version = num(doc.documentElement, 'FileVersion');
  if (version !== undefined && version > NEWEST_FILE_VERSION) {
    ctx.notes.unshift(
      keyedNote('importNote.rktNewerVersion', {
        version: tag(doc.documentElement, 'FileVersion') ?? String(version),
        supported: 4,
      }),
    );
  }

  const notes = [...ctx.notes];
  notes.push(...ignoredNotes(ctx.ignored));
  for (const d of ctx.dropped) notes.push(keyedNote(d));
  notes.push(keyedNote('importNote.rocksimNoMotors'));
  const grounding: OrkFlightConfig | null = ctx.removed.length
    ? defaultOrkConfig({ grounded: [...ctx.removed] })
    : null;

  const comment = tag(design, 'Comments') ?? undefined;
  const designer = tag(design, 'Designer') ?? undefined;
  const revision = tag(design, 'Revisions') ?? undefined;

  return {
    name,
    tree: syncAutoRadii({
      name,
      components: wrapMountAngles(components),
      ...(designer ? { designer } : {}),
      ...(comment ? { comment } : {}),
      ...(revision ? { revision } : {}),
    }),
    motors: {},
    configs: grounding ? [grounding] : [],
    chosenConfigId: grounding?.id ?? null,
    ignored: [...ctx.ignored],
    notes,
  };
}
