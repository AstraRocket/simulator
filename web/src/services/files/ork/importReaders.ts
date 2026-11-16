import type { ComponentNode, ComponentType } from '../../../engine/openRocketEngine';
import { defaultStageName, freshId } from '../../design/orkTree';
import { shapeParamDefault } from '../../../tree/shapeProfile';
import { xmlText as text } from '../xmlUtil';
import { keyedNote, notePartName } from '../importNote';
import { COMPONENT_DEFAULTS } from '../../design/componentDefaults';
import { RAIL_BUTTON_FALLBACK, settleRailButtonLoad, settleRingOuterLoad } from '../../design/linkedDimensions';
import { clampCount, finiteNum } from './numbers';
import { MAX_ASSEMBLY_INSTANCES, MAX_FIN_POINTS, MAX_LINE_COUNT, checkDepth, countComponent } from './importLimits';
import {
  autoRadiusTag,
  clusterTag,
  crossSectionTag,
  finCountTag,
  massComponentTypeTag,
  nonNegTag,
  numTag,
  readAirfoil,
  isTrueTag,
  readAngleAroundBody,
  readAutoPackedRadius,
  readCommon,
  readDeployment,
  readFinRotation,
  readFinTabs,
  readInstances,
  readPackedSize,
  readSeparation,
  readAutoValue,
  readSoftMaterial,
  shapeTag,
} from './importTags';
import {
  captureDeployments,
  captureSeparations,
  configScoped,
  readMotor,
  type OrkImportContext,
} from './importConfigs';
import { degToRad } from '../../../prefs/units';
import { KERNEL_DEFAULTS } from '../../../tree/kernelDefaults';
import { finCant } from '../../../tree/nodeProps';

type NodeReader = (ctx: OrkImportContext, el: Element) => ComponentNode;

const base = (ctx: OrkImportContext, el: Element, type: ComponentType, withPosition: boolean): ComponentNode => {
  const node: ComponentNode = { type, id: freshId() };
  readCommon(el, node, withPosition, ctx.notes);
  return node;
};

const readThicknessOrFilled = (el: Element, n: ComponentNode, fallback: number) => {
  // `DoubleSetter` compares its special word ignoring case.
  if (text(el, ':scope > thickness')?.toLowerCase() === 'filled') {
    n['filled'] = true;
  } else {
    n['thickness'] = nonNegTag(el, 'thickness', fallback);
  }
};

const readCant = (ctx: OrkImportContext, el: Element, n: ComponentNode) => {
  // Clamped as FinSet.setCantAngle clamps it, so the panel shows the cant that flies.
  const cant = finCant({ type: n.type, cant: degToRad(numTag(el, 'cant', 0)) });
  if (cant !== 0) n['cant'] = cant;
  const cs = crossSectionTag(el, n, ctx.notes);
  if (cs && cs !== 'square') n['crossSection'] = cs;
};

const readCd = (el: Element, n: ComponentNode) => {
  const cdText = text(el, ':scope > cd');
  if (cdText?.toLowerCase() === 'auto') {
    n['cdAuto'] = true;
    return;
  }
  if (cdText) {
    const cdv = finiteNum(cdText);
    if (cdv !== undefined) n['cd'] = cdv;
  }
};

/** <radialposition> (m) + <radialdirection> (deg to rad). */
const readRadial = (el: Element, n: ComponentNode) => {
  const radPos = nonNegTag(el, 'radialposition', 0);
  if (radPos !== 0) n['radialPosition'] = radPos;
  const radDir = numTag(el, 'radialdirection', 0);
  if (radDir !== 0) n['radialDirection'] = degToRad(radDir);
};

const readNosecone: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'nosecone', false);
  n['length'] = nonNegTag(el, 'length', COMPONENT_DEFAULTS.nosecone.length);
  const ncR = autoRadiusTag(el, 'aftradius');
  if (ncR === undefined) n['aftRadiusAuto'] = true;
  n['aftRadius'] = ncR ?? COMPONENT_DEFAULTS.nosecone.aftRadius;
  readThicknessOrFilled(el, n, COMPONENT_DEFAULTS.nosecone.thickness);
  n['shape'] = shapeTag(el, n, ctx.notes, 'ogive');
  n['shapeParameter'] = nonNegTag(el, 'shapeparameter', shapeParamDefault(String(n['shape'])));
  readShoulder(el, n, 'aft', 'shoulder');
  if (isTrueTag(el, 'isflipped')) n['flipped'] = true;
  return n;
};

function readShoulder(el: Element, n: ComponentNode, side: 'fore' | 'aft', key: string): void {
  const r = numTag(el, `${side}shoulderradius`, 0);
  const l = numTag(el, `${side}shoulderlength`, 0);
  if (r > 0) n[`${key}Radius`] = r;
  if (l > 0) n[`${key}Length`] = l;
  const th = numTag(el, `${side}shoulderthickness`, 0);
  if (th > 0) n[`${key}Thickness`] = th;
  if (isTrueTag(el, `${side}shouldercapped`)) n[`${key}Capped`] = true;
}

const readTransition: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'transition', false);
  n['length'] = nonNegTag(el, 'length', COMPONENT_DEFAULTS.transition.length);
  const fore = autoRadiusTag(el, 'foreradius');
  const aft = autoRadiusTag(el, 'aftradius');
  if (fore === undefined) n['foreRadiusAuto'] = true;
  else n['foreRadius'] = fore;
  if (aft === undefined) n['aftRadiusAuto'] = true;
  else n['aftRadius'] = aft;
  readThicknessOrFilled(el, n, COMPONENT_DEFAULTS.transition.thickness);
  n['shape'] = shapeTag(el, n, ctx.notes, 'conical');
  n['shapeParameter'] = nonNegTag(el, 'shapeparameter', shapeParamDefault(String(n['shape'])));
  // Absent keeps the kernel default (clipped, matching the desktop).
  const clip = text(el, ':scope > shapeclipped')?.toLowerCase();
  if (clip === 'true' || clip === 'false') n['clipped'] = clip === 'true';
  readShoulder(el, n, 'fore', 'foreShoulder');
  readShoulder(el, n, 'aft', 'aftShoulder');
  return n;
};

const readBodytube: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'bodytube', false);
  const bt = COMPONENT_DEFAULTS.bodytube;
  n['length'] = nonNegTag(el, 'length', bt.length);
  const btR = autoRadiusTag(el, 'radius');
  if (btR === undefined) n['outerRadiusAuto'] = true;
  n['outerRadius'] = btR ?? bt.outerRadius;
  readThicknessOrFilled(el, n, bt.thickness);
  readMotor(ctx, el, n);
  if (isTrueTag(el, 'caseairframe')) n['caseAirframe'] = true;
  return n;
};

function readPlanarFin(ctx: OrkImportContext, el: Element, n: ComponentNode): void {
  n['thickness'] = nonNegTag(el, 'thickness', COMPONENT_DEFAULTS.finset.thickness);
  readCant(ctx, el, n);
  readAirfoil(el, n);
  readFinRotation(el, n);
}

const readTrapezoidFinset: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'trapezoidfinset', true);
  n['finCount'] = finCountTag(el);
  const fin = COMPONENT_DEFAULTS.trapezoidfinset;
  n['rootChord'] = nonNegTag(el, 'rootchord', fin.rootChord);
  n['tipChord'] = nonNegTag(el, 'tipchord', fin.tipChord);
  // Signed: a negative sweep is a forward-swept fin.
  n['sweep'] = numTag(el, 'sweeplength', fin.sweep);
  n['height'] = nonNegTag(el, 'height', fin.height);
  readPlanarFin(ctx, el, n);
  readFinTabs(el, n);
  return n;
};

const readFreeformFinset: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'freeformfinset', true);
  n['finCount'] = finCountTag(el);
  readPlanarFin(ctx, el, n);
  // Sibling walk: live `children` indexing is O(n) per access in jsdom.
  const pts: [number, number][] = [];
  const finpoints = el.querySelector(':scope > finpoints');
  if (finpoints) {
    let seen = 0;
    let unreadable = 0;
    let pt = finpoints.firstElementChild;
    for (; pt && seen < MAX_FIN_POINTS; pt = pt.nextElementSibling) {
      if (pt.tagName !== 'point') continue;
      seen++;
      const x = finiteNum(pt.getAttribute('x'));
      const y = finiteNum(pt.getAttribute('y'));
      if (x !== undefined && y !== undefined) pts.push([x, y]);
      else unreadable++;
    }
    if (unreadable > 0) {
      ctx.notes.push(keyedNote('importNote.finPointsUnreadable', { part: notePartName(n), count: unreadable }));
    }
    for (; pt; pt = pt.nextElementSibling) {
      if (pt.tagName === 'point') {
        ctx.notes.push(keyedNote('importNote.finPointsCapped', { max: MAX_FIN_POINTS }));
        break;
      }
    }
  }
  if (pts.length >= 3) n['points'] = pts;
  else ctx.notes.push(keyedNote('importNote.finPointsTooFew', { part: notePartName(n) }));
  readFinTabs(el, n);
  return n;
};

const readEllipticalFinset: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'ellipticalfinset', true);
  n['finCount'] = finCountTag(el);
  const fin = COMPONENT_DEFAULTS.ellipticalfinset;
  n['rootChord'] = nonNegTag(el, 'rootchord', fin.rootChord);
  n['height'] = nonNegTag(el, 'height', fin.height);
  readPlanarFin(ctx, el, n);
  readFinTabs(el, n);
  return n;
};

const readTubeFinset: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'tubefinset', true);
  n['finCount'] = finCountTag(el, COMPONENT_DEFAULTS.tubefinset.finCount);
  n['length'] = nonNegTag(el, 'length', COMPONENT_DEFAULTS.tubefinset.length);
  const r = autoRadiusTag(el, 'radius');
  if (r === undefined) n['outerRadiusAuto'] = true;
  else n['outerRadius'] = r;
  const th = numTag(el, 'thickness', NaN);
  if (th >= 0) n['thickness'] = th;
  readFinRotation(el, n);
  return n;
};

const RADIUS_METHODS: ReadonlyMap<string, string> = new Map(
  ['relative', 'free', 'surface', 'coaxial'].map((m) => [m, m]),
);
const ANGLE_METHODS: ReadonlyMap<string, string> = new Map([
  ['relative', 'relative'],
  ['fixed', 'fixed'],
  ['mirrorxy', 'mirror_xy'],
]);
const methodOf = (el: Element, methods: ReadonlyMap<string, string>): string =>
  methods.get((el.getAttribute('method') ?? '').trim().toLowerCase().replace(/_/g, '')) ?? 'relative';

const readInnertube: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'innertube', true);
  const it = COMPONENT_DEFAULTS.innertube;
  n['length'] = nonNegTag(el, 'length', it.length);
  n['outerRadius'] = nonNegTag(el, 'outerradius', it.outerRadius);
  n['thickness'] = nonNegTag(el, 'thickness', it.thickness);
  const cluster = clusterTag(el, n, ctx.notes);
  if (cluster && cluster !== 'single') {
    n['cluster'] = cluster;
    n['clusterScale'] = nonNegTag(el, 'clusterscale', 1);
    n['clusterRotation'] = degToRad(numTag(el, 'clusterrotation', 0));
  }
  // A desktop split cluster puts each tube's offset here; without it they collapse onto the axis.
  readRadial(el, n);
  const mml = numTag(el, 'maxmotorlength', 0);
  if (mml > 0) n['maxMotorLength'] = mml;
  readMotor(ctx, el, n);
  return n;
};

const readTubecoupler: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'tubecoupler', true);
  n['length'] = nonNegTag(el, 'length', COMPONENT_DEFAULTS.tubecoupler.length);
  n['thickness'] = nonNegTag(el, 'thickness', COMPONENT_DEFAULTS.tubecoupler.thickness);
  readRadial(el, n);
  const or = autoRadiusTag(el, 'outerradius');
  if (or === undefined) n['outerRadiusAuto'] = true;
  if (or !== undefined) n['outerRadius'] = or;
  return n;
};

const readCenteringring: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'centeringring', true);
  n['length'] = nonNegTag(el, 'length', COMPONENT_DEFAULTS.centeringring.length);
  readRadial(el, n);
  const cor = autoRadiusTag(el, 'outerradius');
  if (cor === undefined) n['outerRadiusAuto'] = true;
  const cir = autoRadiusTag(el, 'innerradius');
  if (cir === undefined) n['innerRadiusAuto'] = true;
  if (cir !== undefined) n['innerRadius'] = cir;
  // The inner radius's setter raises the outer to meet it, as on desktop load.
  if (cor !== undefined) n['outerRadius'] = cir === undefined ? cor : settleRingOuterLoad(cor, cir);
  readInstances(el, n);
  return n;
};

const readBulkhead: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'bulkhead', true);
  n['length'] = nonNegTag(el, 'length', COMPONENT_DEFAULTS.bulkhead.length);
  readRadial(el, n);
  const bor = autoRadiusTag(el, 'outerradius');
  if (bor === undefined) n['outerRadiusAuto'] = true;
  if (bor !== undefined) n['outerRadius'] = bor;
  readInstances(el, n);
  return n;
};

const readEngineblock: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'engineblock', true);
  n['length'] = nonNegTag(el, 'length', COMPONENT_DEFAULTS.engineblock.length);
  n['thickness'] = nonNegTag(el, 'thickness', COMPONENT_DEFAULTS.engineblock.thickness);
  readRadial(el, n);
  const eor = autoRadiusTag(el, 'outerradius');
  if (eor === undefined) n['outerRadiusAuto'] = true;
  if (eor !== undefined) n['outerRadius'] = eor;
  return n;
};

const readLaunchlug: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'launchlug', true);
  const lug = COMPONENT_DEFAULTS.launchlug;
  n['length'] = nonNegTag(el, 'length', lug.length);
  n['outerRadius'] = nonNegTag(el, 'radius', lug.outerRadius);
  n['thickness'] = nonNegTag(el, 'thickness', lug.thickness);
  n['angleOffset'] = readAngleAroundBody(el);
  readInstances(el, n);
  return n;
};

const readRailbutton: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'railbutton', true);
  const rb = COMPONENT_DEFAULTS.railbutton;
  // Settled as the desktop setters clamp them on load.
  const read: Partial<Record<keyof typeof RAIL_BUTTON_FALLBACK, number>> = {
    outerDiameter: nonNegTag(el, 'outerdiameter', rb.outerDiameter),
  };
  for (const [tag, key] of [
    ['innerdiameter', 'innerDiameter'],
    ['height', 'height'],
    ['baseheight', 'baseHeight'],
    ['flangeheight', 'flangeHeight'],
    ['screwheight', 'screwHeight'],
  ] as const) {
    const v = numTag(el, tag, NaN);
    if (v >= 0) read[key] = v;
  }
  const settled = settleRailButtonLoad(read);
  n['outerDiameter'] = settled.outerDiameter;
  for (const key of ['innerDiameter', 'height', 'baseHeight', 'flangeHeight', 'screwHeight'] as const) {
    if (settled[key] !== rb[key]) n[key] = settled[key];
  }
  n['angleOffset'] = readAngleAroundBody(el);
  readInstances(el, n);
  return n;
};

const readFairing: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'fairing', true);
  const fr = COMPONENT_DEFAULTS.fairing;
  n['length'] = nonNegTag(el, 'length', fr.length);
  n['width'] = nonNegTag(el, 'width', fr.width);
  n['height'] = nonNegTag(el, 'height', fr.height);
  const fs = text(el, ':scope > fairingshape');
  if (fs) n['fairingShape'] = fs;
  n['mass'] = nonNegTag(el, 'mass', fr.mass);
  return n;
};

function readRecoveryDeployment(ctx: OrkImportContext, el: Element, n: ComponentNode): void {
  // Without it every flight takes the single-deployment branch.
  if (isTrueTag(el, 'isdrogue')) n['drogue'] = true;
  readDeployment(el, n, ctx.notes);
  captureDeployments(ctx, el, n);
}

/** With declared configurations every block is an override, so none sets the design's own. */
function undeclaredSeparation(ctx: OrkImportContext, el: Element): Element | null {
  return ctx.chosenConfigId === null ? configScoped(ctx, el, 'separationconfiguration') : null;
}

const readParachute: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'parachute', true);
  readPackedSize(el, n);
  readRadial(el, n);
  const chute = COMPONENT_DEFAULTS.parachute;
  n['diameter'] = nonNegTag(el, 'diameter', chute.diameter);
  readCd(el, n);
  // Zero lines is valid (`Parachute.setLineCount`).
  n['lineCount'] = clampCount(numTag(el, 'linecount', chute.lineCount), 0, MAX_LINE_COUNT);
  if (!readAutoValue(el, n, 'linelength', 'lineLengthAuto'))
    n['lineLength'] = nonNegTag(el, 'linelength', chute.lineLength);
  readSoftMaterial(el, n, 'surface', 'surfaceDensity', 'surfaceMaterialName');
  readSoftMaterial(el, n, 'line', 'lineDensity', 'lineMaterialName', ':scope > linematerial');
  readRecoveryDeployment(ctx, el, n);
  const spill = numTag(el, 'spillholediameter', 0);
  if (spill > 0) n['spillHoleDiameter'] = spill;
  return n;
};

const readStreamer: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'streamer', true);
  readPackedSize(el, n);
  readRadial(el, n);
  n['stripLength'] = nonNegTag(el, 'striplength', COMPONENT_DEFAULTS.streamer.stripLength);
  n['stripWidth'] = nonNegTag(el, 'stripwidth', COMPONENT_DEFAULTS.streamer.stripWidth);
  readCd(el, n);
  readSoftMaterial(el, n, 'surface', 'surfaceDensity', 'surfaceMaterialName');
  readRecoveryDeployment(ctx, el, n);
  return n;
};

const readShockcord: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'shockcord', true);
  readPackedSize(el, n);
  readRadial(el, n);
  if (!readAutoValue(el, n, 'cordlength', 'cordLengthAuto'))
    n['cordLength'] = nonNegTag(el, 'cordlength', COMPONENT_DEFAULTS.shockcord.cordLength);
  readSoftMaterial(el, n, 'line', 'lineDensity', 'lineMaterialName');
  return n;
};

const readMasscomponent: NodeReader = (ctx, el) => {
  const n = base(ctx, el, 'masscomponent', true);
  const mc = COMPONENT_DEFAULTS.masscomponent;
  n['mass'] = nonNegTag(el, 'mass', mc.mass);
  n['length'] = nonNegTag(el, 'packedlength', mc.length);
  n['radius'] = mc.radius;
  if (!readAutoPackedRadius(el, n)) n['radius'] = nonNegTag(el, 'packedradius', mc.radius);
  const mct = massComponentTypeTag(el, n, ctx.notes);
  if (mct && mct !== 'masscomponent') n['massComponentType'] = mct;
  readRadial(el, n);
  return n;
};

const readAssembly =
  (asmType: 'podset' | 'parallelstage'): NodeReader =>
  (ctx, el) => {
    const n = base(ctx, el, asmType, true);
    n['instanceCount'] = clampCount(
      numTag(el, 'instancecount', KERNEL_DEFAULTS[asmType].instanceCount),
      1,
      MAX_ASSEMBLY_INSTANCES,
    );
    const radEl = el.querySelector(':scope > radiusoffset');
    if (radEl) {
      n['radiusOffset'] = finiteNum(radEl.textContent) ?? 0; // meters
      n['radiusMethod'] = methodOf(radEl, RADIUS_METHODS);
    }
    const angEl = el.querySelector(':scope > angleoffset');
    if (angEl) {
      n['angleOffset'] = degToRad(finiteNum(angEl.textContent) ?? 0);
      if (asmType === 'parallelstage') {
        n['angleMethod'] = methodOf(angEl, ANGLE_METHODS);
      }
    }
    if (asmType === 'parallelstage') {
      readSeparation(el, n, undeclaredSeparation(ctx, el), ctx.notes);
      captureSeparations(ctx, el, n);
    }
    return n;
  };

const NODE_READERS: Record<string, NodeReader> = {
  nosecone: readNosecone,
  transition: readTransition,
  bodytube: readBodytube,
  trapezoidfinset: readTrapezoidFinset,
  freeformfinset: readFreeformFinset,
  ellipticalfinset: readEllipticalFinset,
  tubefinset: readTubeFinset,
  innertube: readInnertube,
  tubecoupler: readTubecoupler,
  centeringring: readCenteringring,
  bulkhead: readBulkhead,
  engineblock: readEngineblock,
  launchlug: readLaunchlug,
  railbutton: readRailbutton,
  fairing: readFairing,
  parachute: readParachute,
  streamer: readStreamer,
  shockcord: readShockcord,
  masscomponent: readMasscomponent,
  podset: readAssembly('podset'),
  parallelstage: readAssembly('parallelstage'),
  boosterset: readAssembly('parallelstage'),
};

function convertChildren(ctx: OrkImportContext, parentEl: Element, depth = 0): ComponentNode[] {
  checkDepth(depth, '.ork');
  const out: ComponentNode[] = [];
  const wrap = parentEl.querySelector(':scope > subcomponents');
  if (!wrap) return out;
  for (const el of Array.from(wrap.children)) {
    const read = Object.prototype.hasOwnProperty.call(NODE_READERS, el.tagName) ? NODE_READERS[el.tagName] : undefined;
    if (!read) {
      ctx.ignored.add(el.tagName);
      continue;
    }
    countComponent(ctx, '.ork');
    const node = read(ctx, el);
    const kids = convertChildren(ctx, el, depth + 1);
    if (kids.length > 0) node.children = kids;
    out.push(node);
  }
  return out;
}

export function readStages(ctx: OrkImportContext, stages: Element[]): ComponentNode[] {
  return stages.map((stageEl, i) => {
    countComponent(ctx, '.ork');
    const stage: ComponentNode = {
      type: 'stage',
      id: freshId(),
      name: text(stageEl, ':scope > name') ?? defaultStageName(i),
    };
    readCommon(stageEl, stage, false, ctx.notes);
    stage.name = text(stageEl, ':scope > name') ?? defaultStageName(i);
    // Meters.
    const nozzle = numTag(stageEl, 'nozzleexitdiameter', NaN);
    if (!Number.isNaN(nozzle) && nozzle > 0) stage['nozzleExitDiameter'] = nozzle;
    if (i > 0) {
      readSeparation(stageEl, stage, undeclaredSeparation(ctx, stageEl), ctx.notes);
      captureSeparations(ctx, stageEl, stage);
    }
    const kids = convertChildren(ctx, stageEl);
    if (kids.length > 0) stage.children = kids;
    return stage;
  });
}
