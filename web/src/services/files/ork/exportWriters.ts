import type { ComponentNode, ComponentType } from '../../../engine/openRocketEngine';
import { nodeShape, shapeIsClippable } from '../../../tree/shapeProfile';
import { noseConeAftRadius, num, str } from '../../../tree/nodeProps';
import { radToDeg } from '../../../prefs/units';
import { escapeXml } from '../xmlUtil';
import { COMPONENT_DEFAULTS } from '../../design/componentDefaults';
import type { OrkWriter } from './exportWriter';
import { mountConfigs, motorMountXml } from './exportMotorConfigs';
import {
  airfoilXml,
  autoRadius,
  deployEventXml,
  deploymentConfigs,
  filletXml,
  finAngleXml,
  finishXml,
  finTabsXml,
  header,
  material,
  packedRadiusXml,
  packedXml,
  position,
  separationXml,
  shapeParamXml,
  thicknessXml,
} from './exportParts';
import { stageFileName } from '../../design/orkTree';
import {
  KERNEL_DEFAULTS,
  KERNEL_DEPLOYMENT,
  KERNEL_FREEFORM_POINTS,
  KERNEL_MATERIALS,
  defaultSeparation,
} from '../../../tree/kernelDefaults';
import { MATERIAL_KEYS, statedMaterial } from '../../design/materialSlots';

// Each writer follows the element order of the desktop's saver for that type.

type NodeWriter = (w: OrkWriter, node: ComponentNode, d: number) => void;

const finCountXml = (w: OrkWriter, d: number, node: ComponentNode, fb: number) => {
  w.emit(d, `<instancecount>${num(node, 'finCount', fb)}</instancecount>`);
  w.emit(d, `<fincount>${num(node, 'finCount', fb)}</fincount>`);
};

const instancesXml = (w: OrkWriter, d: number, node: ComponentNode, fb: number) => {
  w.emit(d, `<instancecount>${num(node, 'instanceCount', fb)}</instancecount>`);
  w.emit(
    d,
    `<instanceseparation>${num(node, 'instanceSeparation', defaultSeparation(node.type))}</instanceseparation>`,
  );
};

const planarFinHead = (w: OrkWriter, node: ComponentNode, d: number) => {
  header(w, d, node);
  finCountXml(w, d, node, COMPONENT_DEFAULTS.finset.finCount);
  w.emit(d, '<radiusoffset method="surface">0.0</radiusoffset>');
  finAngleXml(w, d, node, 'relative');
  position(w, d, node, 'bottom');
  finishXml(w, d, node);
  material(w, d, node);
  w.emit(d, `<thickness>${num(node, 'thickness', COMPONENT_DEFAULTS.finset.thickness)}</thickness>`);
  w.emit(d, `<crosssection>${escapeXml(str(node, 'crossSection', 'square'))}</crosssection>`);
  airfoilXml(w, d, node);
  w.emit(d, `<cant>${radToDeg(num(node, 'cant', 0))}</cant>`);
  finTabsXml(w, d, node);
  filletXml(w, d, node);
};

/** Meters and degrees; centered keeps desktop's literal 0.0. */
const radialXml = (w: OrkWriter, d: number, node: ComponentNode) => {
  const pos = num(node, 'radialPosition', 0);
  const dir = radToDeg(num(node, 'radialDirection', 0));
  w.emit(d, `<radialposition>${pos === 0 ? '0.0' : pos}</radialposition>`);
  w.emit(d, `<radialdirection>${dir === 0 ? '0.0' : dir}</radialdirection>`);
};

const recoveryHead = (w: OrkWriter, node: ComponentNode, d: number) => {
  header(w, d, node);
  position(w, d, node, 'top');
  packedXml(w, d, node);
  radialXml(w, d, node);
  w.emit(d, `<cd>${node['cdAuto'] === true || typeof node['cd'] !== 'number' ? 'auto' : node['cd']}</cd>`);
  material(w, d, node, 'surface');
  if (node['drogue'] === true) w.emit(d, '<isdrogue>true</isdrogue>');
  w.emit(
    d,
    `<deployevent>${escapeXml(deployEventXml(str(node, 'deployEvent', KERNEL_DEPLOYMENT.deployEvent)))}</deployevent>`,
  );
  w.emit(d, `<deployaltitude>${num(node, 'deployAltitude', KERNEL_DEPLOYMENT.deployAltitude)}</deployaltitude>`);
  w.emit(d, `<deploydelay>${num(node, 'deployDelay', KERNEL_DEPLOYMENT.deployDelay)}</deploydelay>`);
  deploymentConfigs(w, d, node);
};

/** `instanced`: the ring savers that write an instance count (centering rings and bulkheads). */
const ringLikeBody = (w: OrkWriter, node: ComponentNode, d: number, length: number, instanced = false) => {
  header(w, d, node);
  if (instanced) instancesXml(w, d, node, 1);
  position(w, d, node, 'bottom');
  material(w, d, node);
  w.emit(d, `<length>${num(node, 'length', length)}</length>`);
  radialXml(w, d, node);
  autoRadius(w, d, node, 'outerRadius', 'outerradius');
};

const writeNosecone: NodeWriter = (w, node, d) => {
  header(w, d, node);
  finishXml(w, d, node);
  material(w, d, node);
  w.emit(d, `<length>${num(node, 'length', COMPONENT_DEFAULTS.nosecone.length)}</length>`);
  thicknessXml(w, d, node, COMPONENT_DEFAULTS.nosecone.thickness);
  w.emit(d, `<shape>${escapeXml(nodeShape(node))}</shape>`);
  w.emit(d, '<shapeclipped>false</shapeclipped>');
  shapeParamXml(w, d, node);
  w.emit(d, `<aftradius>${node['aftRadiusAuto'] === true ? 'auto' : noseConeAftRadius(node)}</aftradius>`);
  shoulderXml(w, d, node, 'aft', 'shoulder');
  w.emit(d, `<isflipped>${node['flipped'] === true}</isflipped>`);
};

function shoulderXml(w: OrkWriter, d: number, node: ComponentNode, side: 'fore' | 'aft', key: string): void {
  w.emit(d, `<${side}shoulderradius>${num(node, `${key}Radius`, 0)}</${side}shoulderradius>`);
  w.emit(d, `<${side}shoulderlength>${num(node, `${key}Length`, 0)}</${side}shoulderlength>`);
  w.emit(d, `<${side}shoulderthickness>${num(node, `${key}Thickness`, 0)}</${side}shoulderthickness>`);
  w.emit(d, `<${side}shouldercapped>${node[`${key}Capped`] === true}</${side}shouldercapped>`);
}

const writeTransition: NodeWriter = (w, node, d) => {
  header(w, d, node);
  finishXml(w, d, node);
  material(w, d, node);
  w.emit(d, `<length>${num(node, 'length', COMPONENT_DEFAULTS.transition.length)}</length>`);
  thicknessXml(w, d, node, COMPONENT_DEFAULTS.transition.thickness);
  w.emit(d, `<shape>${escapeXml(nodeShape(node))}</shape>`);
  // Only for clippable shapes; the kernel's default there is true (setShapeType).
  if (shapeIsClippable(nodeShape(node))) {
    const clippedOut = typeof node['clipped'] === 'boolean' ? node['clipped'] : true;
    w.emit(d, `<shapeclipped>${clippedOut}</shapeclipped>`);
  }
  shapeParamXml(w, d, node);
  // A missing value also means automatic.
  const transAuto = (key: 'foreRadius' | 'aftRadius') =>
    node[`${key}Auto`] === true || typeof node[key] !== 'number' ? 'auto' : String(node[key]);
  w.emit(d, `<foreradius>${transAuto('foreRadius')}</foreradius>`);
  w.emit(d, `<aftradius>${transAuto('aftRadius')}</aftradius>`);
  shoulderXml(w, d, node, 'fore', 'foreShoulder');
  shoulderXml(w, d, node, 'aft', 'aftShoulder');
};

const mountXml: NodeWriter = (w, node, d) => {
  if (node['motorMount'] === true || mountConfigs(w, node.id).length > 0) {
    motorMountXml(w, d, node);
  }
};

const writeBodytube: NodeWriter = (w, node, d) => {
  header(w, d, node);
  finishXml(w, d, node);
  material(w, d, node);
  const bt = COMPONENT_DEFAULTS.bodytube;
  w.emit(d, `<length>${num(node, 'length', bt.length)}</length>`);
  thicknessXml(w, d, node, bt.thickness);
  w.emit(d, `<radius>${node['outerRadiusAuto'] === true ? 'auto' : num(node, 'outerRadius', bt.outerRadius)}</radius>`);
  if (node['caseAirframe'] === true) {
    w.emit(d, '<caseairframe>true</caseairframe>');
  }
  mountXml(w, node, d);
};

const writeTrapezoidFinset: NodeWriter = (w, node, d) => {
  planarFinHead(w, node, d);
  const fin = COMPONENT_DEFAULTS.trapezoidfinset;
  w.emit(d, `<rootchord>${num(node, 'rootChord', fin.rootChord)}</rootchord>`);
  w.emit(d, `<tipchord>${num(node, 'tipChord', fin.tipChord)}</tipchord>`);
  w.emit(d, `<sweeplength>${num(node, 'sweep', fin.sweep)}</sweeplength>`);
  w.emit(d, `<height>${num(node, 'height', fin.height)}</height>`);
};

const writeFreeformFinset: NodeWriter = (w, node, d) => {
  planarFinHead(w, node, d);
  w.emit(d, '<finpoints>');
  const ffPts = (node['points'] as [number, number][] | undefined) ?? KERNEL_FREEFORM_POINTS;
  for (const [px, py] of ffPts) {
    w.emit(d + 1, `<point x="${px}" y="${py}"/>`);
  }
  w.emit(d, '</finpoints>');
};

const writeEllipticalFinset: NodeWriter = (w, node, d) => {
  planarFinHead(w, node, d);
  const fin = COMPONENT_DEFAULTS.ellipticalfinset;
  w.emit(d, `<rootchord>${num(node, 'rootChord', fin.rootChord)}</rootchord>`);
  w.emit(d, `<height>${num(node, 'height', fin.height)}</height>`);
};

const writeTubeFinset: NodeWriter = (w, node, d) => {
  header(w, d, node);
  finCountXml(w, d, node, COMPONENT_DEFAULTS.tubefinset.finCount);
  w.emit(d, '<radiusoffset method="coaxial">0.0</radiusoffset>');
  finAngleXml(w, d, node, 'fixed');
  position(w, d, node, 'bottom');
  finishXml(w, d, node);
  material(w, d, node);
  autoRadius(w, d, node, 'outerRadius', 'radius');
  w.emit(d, `<length>${num(node, 'length', COMPONENT_DEFAULTS.tubefinset.length)}</length>`);
  // No wall, no tag: a fallback would fly differently (ComponentFactory.applyWallThickness).
  if (typeof node['thickness'] === 'number') w.emit(d, `<thickness>${node['thickness']}</thickness>`);
};

const writeInnertube: NodeWriter = (w, node, d) => {
  header(w, d, node);
  position(w, d, node, 'bottom');
  material(w, d, node);
  const it = COMPONENT_DEFAULTS.innertube;
  w.emit(d, `<length>${num(node, 'length', it.length)}</length>`);
  radialXml(w, d, node);
  w.emit(d, `<outerradius>${num(node, 'outerRadius', it.outerRadius)}</outerradius>`);
  w.emit(d, `<thickness>${num(node, 'thickness', it.thickness)}</thickness>`);
  // Desktop stores cluster rotation in degrees; the tree keeps radians.
  w.emit(
    d,
    `<clusterconfiguration>${escapeXml(typeof node['cluster'] === 'string' ? node['cluster'] : 'single')}</clusterconfiguration>`,
  );
  w.emit(d, `<clusterscale>${num(node, 'clusterScale', 1)}</clusterscale>`);
  w.emit(d, `<clusterrotation>${radToDeg(num(node, 'clusterRotation', 0))}</clusterrotation>`);
  if (typeof node['maxMotorLength'] === 'number') {
    w.emit(d, `<maxmotorlength>${node['maxMotorLength']}</maxmotorlength>`);
  }
  mountXml(w, node, d);
};

const writeTubecoupler: NodeWriter = (w, node, d) => {
  ringLikeBody(w, node, d, COMPONENT_DEFAULTS.tubecoupler.length);
  w.emit(d, `<thickness>${num(node, 'thickness', COMPONENT_DEFAULTS.tubecoupler.thickness)}</thickness>`);
};

const writeCenteringring: NodeWriter = (w, node, d) => {
  ringLikeBody(w, node, d, COMPONENT_DEFAULTS.centeringring.length, true);
  autoRadius(w, d, node, 'innerRadius', 'innerradius');
};

const writeBulkhead: NodeWriter = (w, node, d) => {
  ringLikeBody(w, node, d, COMPONENT_DEFAULTS.bulkhead.length, true);
  // No inner radius, as RadiusRingComponentSaver skips it for Bulkhead.
};

const writeEngineblock: NodeWriter = (w, node, d) => {
  ringLikeBody(w, node, d, COMPONENT_DEFAULTS.engineblock.length);
  w.emit(d, `<thickness>${num(node, 'thickness', COMPONENT_DEFAULTS.engineblock.thickness)}</thickness>`);
};

const writeFairing: NodeWriter = (w, node, d) => {
  header(w, d, node, 'Camera shroud');
  position(w, d, node, 'middle');
  finishXml(w, d, node);
  const fr = COMPONENT_DEFAULTS.fairing;
  w.emit(d, `<length>${num(node, 'length', fr.length)}</length>`);
  w.emit(d, `<width>${num(node, 'width', fr.width)}</width>`);
  w.emit(d, `<height>${num(node, 'height', fr.height)}</height>`);
  w.emit(d, `<fairingshape>${escapeXml(str(node, 'fairingShape', 'halfround'))}</fairingshape>`);
  w.emit(d, `<mass>${num(node, 'mass', fr.mass)}</mass>`);
};

const writeLaunchlug: NodeWriter = (w, node, d) => {
  header(w, d, node);
  instancesXml(w, d, node, 1);
  const lug = COMPONENT_DEFAULTS.launchlug;
  const lugAngle = KERNEL_DEFAULTS.launchlug.angleOffset;
  w.emit(d, `<angleoffset method="relative">${radToDeg(num(node, 'angleOffset', lugAngle))}</angleoffset>`);
  w.emit(d, `<radialdirection>${radToDeg(num(node, 'angleOffset', lugAngle))}</radialdirection>`);
  position(w, d, node, 'middle');
  finishXml(w, d, node);
  material(w, d, node);
  w.emit(d, `<radius>${num(node, 'outerRadius', lug.outerRadius)}</radius>`);
  w.emit(d, `<length>${num(node, 'length', lug.length)}</length>`);
  w.emit(d, `<thickness>${num(node, 'thickness', lug.thickness)}</thickness>`);
};

const writeRailbutton: NodeWriter = (w, node, d) => {
  header(w, d, node);
  instancesXml(w, d, node, 1);
  const rbAngle = KERNEL_DEFAULTS.railbutton.angleOffset;
  w.emit(d, `<angleoffset method="relative">${radToDeg(num(node, 'angleOffset', rbAngle))}</angleoffset>`);
  position(w, d, node, 'middle');
  finishXml(w, d, node);
  const rb = COMPONENT_DEFAULTS.railbutton;
  material(w, d, node);
  w.emit(d, `<outerdiameter>${num(node, 'outerDiameter', rb.outerDiameter)}</outerdiameter>`);
  w.emit(d, `<innerdiameter>${num(node, 'innerDiameter', rb.innerDiameter)}</innerdiameter>`);
  w.emit(d, `<height>${num(node, 'height', rb.height)}</height>`);
  w.emit(d, `<baseheight>${num(node, 'baseHeight', rb.baseHeight)}</baseheight>`);
  w.emit(d, `<flangeheight>${num(node, 'flangeHeight', rb.flangeHeight)}</flangeheight>`);
  w.emit(d, `<screwheight>${num(node, 'screwHeight', rb.screwHeight)}</screwheight>`);
};

/** As `ParachuteSaver` and `ShockCordSaver` write it: `auto` for an automatic length, else the length. */
function autoLengthXml(
  w: OrkWriter,
  d: number,
  node: ComponentNode,
  key: 'lineLength' | 'cordLength',
  flag: 'lineLengthAuto' | 'cordLengthAuto',
  tag: string,
  fallback: number,
): void {
  w.emit(d, `<${tag}>${node[flag] === true ? 'auto' : num(node, key, fallback)}</${tag}>`);
}

const writeParachute: NodeWriter = (w, node, d) => {
  recoveryHead(w, node, d);
  const chute = COMPONENT_DEFAULTS.parachute;
  w.emit(d, `<diameter>${num(node, 'diameter', chute.diameter)}</diameter>`);
  if (typeof node['spillHoleDiameter'] === 'number' && node['spillHoleDiameter'] > 0) {
    w.emit(d, `<spillholediameter>${node['spillHoleDiameter']}</spillholediameter>`);
  }
  w.emit(d, `<linecount>${num(node, 'lineCount', chute.lineCount)}</linecount>`);
  autoLengthXml(w, d, node, 'lineLength', 'lineLengthAuto', 'linelength', chute.lineLength);
  const line = statedMaterial(node, MATERIAL_KEYS.line, false);
  if (line) {
    w.emit(d, `<linematerial type="line" density="${line.density}">${escapeXml(line.name)}</linematerial>`);
  } else {
    const kernelLine = KERNEL_MATERIALS.line;
    w.emit(
      d,
      `<linematerial type="line" density="${kernelLine.density}" group="${kernelLine.group}">${escapeXml(kernelLine.name)}</linematerial>`,
    );
  }
};

const writeStreamer: NodeWriter = (w, node, d) => {
  recoveryHead(w, node, d);
  w.emit(d, `<striplength>${num(node, 'stripLength', COMPONENT_DEFAULTS.streamer.stripLength)}</striplength>`);
  w.emit(d, `<stripwidth>${num(node, 'stripWidth', COMPONENT_DEFAULTS.streamer.stripWidth)}</stripwidth>`);
};

const writeShockcord: NodeWriter = (w, node, d) => {
  header(w, d, node);
  position(w, d, node, 'top');
  packedXml(w, d, node);
  radialXml(w, d, node);
  autoLengthXml(w, d, node, 'cordLength', 'cordLengthAuto', 'cordlength', COMPONENT_DEFAULTS.shockcord.cordLength);
  material(w, d, node, 'line');
};

const writeMasscomponent: NodeWriter = (w, node, d) => {
  header(w, d, node);
  position(w, d, node, 'top');
  const mc = COMPONENT_DEFAULTS.masscomponent;
  w.emit(d, `<packedlength>${num(node, 'length', mc.length)}</packedlength>`);
  w.emit(d, packedRadiusXml(node, mc.radius));
  radialXml(w, d, node);
  w.emit(d, `<mass>${num(node, 'mass', mc.mass)}</mass>`);
  w.emit(d, `<masscomponenttype>${escapeXml(str(node, 'massComponentType', 'masscomponent'))}</masscomponenttype>`);
};

/** No <radialdirection>: desktop suppresses it for assemblies. */
const assemblyHead = (w: OrkWriter, node: ComponentNode, d: number) => {
  header(w, d, node);
  const assembly = node.type === 'podset' ? KERNEL_DEFAULTS.podset : KERNEL_DEFAULTS.parallelstage;
  w.emit(d, `<instancecount>${num(node, 'instanceCount', assembly.instanceCount)}</instancecount>`);
  const rMethod = ['free', 'surface', 'coaxial'].includes(String(node['radiusMethod']))
    ? String(node['radiusMethod'])
    : 'relative';
  w.emit(d, `<radiusoffset method="${rMethod}">${num(node, 'radiusOffset', 0)}</radiusoffset>`); // meters
  const aMethod = ['fixed', 'mirror_xy'].includes(String(node['angleMethod']))
    ? String(node['angleMethod'])
    : 'relative';
  // Radians in the tree, degrees on disk.
  w.emit(d, `<angleoffset method="${aMethod}">${radToDeg(num(node, 'angleOffset', 0))}</angleoffset>`);
  position(w, d, node, 'bottom');
};

const writePodset: NodeWriter = (w, node, d) => {
  assemblyHead(w, node, d);
};

const writeParallelstage: NodeWriter = (w, node, d) => {
  assemblyHead(w, node, d);
  separationXml(w, d, node);
};

const NODE_WRITERS: Record<ComponentType, NodeWriter | null> = {
  stage: null,
  nosecone: writeNosecone,
  transition: writeTransition,
  bodytube: writeBodytube,
  trapezoidfinset: writeTrapezoidFinset,
  freeformfinset: writeFreeformFinset,
  ellipticalfinset: writeEllipticalFinset,
  tubefinset: writeTubeFinset,
  innertube: writeInnertube,
  tubecoupler: writeTubecoupler,
  centeringring: writeCenteringring,
  bulkhead: writeBulkhead,
  engineblock: writeEngineblock,
  fairing: writeFairing,
  launchlug: writeLaunchlug,
  railbutton: writeRailbutton,
  parachute: writeParachute,
  streamer: writeStreamer,
  shockcord: writeShockcord,
  masscomponent: writeMasscomponent,
  podset: writePodset,
  parallelstage: writeParallelstage,
};

function emitChildren(w: OrkWriter, node: ComponentNode, depth: number): void {
  const kids = node.children ?? [];
  if (kids.length === 0) return;
  w.emit(depth, '<subcomponents>');
  for (const kid of kids) {
    emitNode(w, kid, depth + 1);
  }
  w.emit(depth, '</subcomponents>');
}

function emitNode(w: OrkWriter, node: ComponentNode, depth: number): void {
  const write = NODE_WRITERS[node.type];
  if (!write) return;
  w.emit(depth, `<${node.type}>`);
  write(w, node, depth + 1);
  emitChildren(w, node, depth + 1);
  w.emit(depth, `</${node.type}>`);
}

export function stageXml(w: OrkWriter, depth: number, st: ComponentNode, i: number): void {
  const { emit } = w;
  emit(depth, '<stage>');
  header(w, depth + 1, { ...st, name: stageFileName(st, i) }, '');
  // Meters; only when > 0 so a plain design round-trips exactly.
  if (typeof st['nozzleExitDiameter'] === 'number' && st['nozzleExitDiameter'] > 0) {
    emit(depth + 1, `<nozzleexitdiameter>${st['nozzleExitDiameter']}</nozzleexitdiameter>`);
  }
  if (i > 0) {
    separationXml(w, depth + 1, st);
  }
  emit(depth + 1, '<subcomponents>');
  for (const node of st.children ?? []) {
    emitNode(w, node, depth + 2);
  }
  emit(depth + 1, '</subcomponents>');
  emit(depth, '</stage>');
}
