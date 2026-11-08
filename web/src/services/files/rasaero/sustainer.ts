import type { ComponentNode, ComponentPosition } from '../../../engine/openRocketEngine';
import { COMPONENT_DEFAULTS } from '../../design/componentDefaults';
import { nodeShape, profileEnds, shapeParamDefault } from '../../../tree/shapeProfile';
import { IN, fmt, type Cdx1Writer } from './units';
import { SECTION_TO_AIRFOIL } from './surface';
import { bodyTubeRadius, noseConeAftRadius, num, positionOf, str } from '../../../tree/nodeProps';
import { partLength, startFromPosition } from '../../../tree/position';
import { FIN_DEFAULTS, KERNEL_DEFAULTS } from '../../../tree/kernelDefaults';
import { finPlanformPoints, finSpan, trapezoidDims } from '../../../tree/finPlanform';
import { isPlanarFinSet } from '../../../tree/tubefins';
import { isAssembly } from '../../../tree/assembly';
import { walkNodes } from '../../../tree/treeWalk';
import { KeyedError } from '../../../i18n/keyedError';
import { notePartName } from '../importNote';
import { mathEquals } from '../../motors/mathEquals';
import { roundFixed } from '../../app/numbers';

export const partName = notePartName;

const FIN_MIN = 3;
const FIN_MAX = 8;

type Trapezoid = { root: number; tip: number; sweep: number; height: number };

/** Same root chord, span, area and centroid, as FinDTO.setEquivalentTrapezoid. */
function finPlanform(w: Cdx1Writer, fin: ComponentNode): Trapezoid {
  if (fin.type === 'trapezoidfinset') return trapezoidDims(fin);
  w.warn({ key: 'errors.exportRasaeroFinShape', values: { name: partName(fin) } });
  const pts = finPlanformPoints(fin) ?? [];
  const first = pts[0] ?? [0, 0];
  const root = (pts.at(-1) ?? first)[0] - first[0];
  const height = finSpan(fin);
  let area = 0;
  let moment = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross / 2;
    moment += ((x0 + x1) * cross) / 6;
  }
  const centroidX = moment / area - first[0];
  area = Math.abs(area);
  const tip = Math.max(0, (2 * area) / height - root);
  const sweep = (3 * (root + tip) * centroidX - (root * root + root * tip + tip * tip)) / (root + 2 * tip);
  return { root, tip, sweep, height };
}

/** `below` is body past the parent's bottom within one RASAero part, as Location is measured from that part's bottom. */
export function finXml(w: Cdx1Writer, parent: ComponentNode, parentStart: number, below = 0): void {
  const { emit } = w;
  const kids = parent.children ?? [];
  const tubeFins = kids.find((c) => c.type === 'tubefinset');
  if (tubeFins) throw new KeyedError('errors.rasaero.tubeFinsUnsupported', { name: partName(tubeFins) });
  const finSets = kids.filter((c) => isPlanarFinSet(c.type));
  if (finSets.length === 0) return;
  for (const other of finSets.slice(1)) {
    w.warn({ key: 'errors.exportRasaeroExtraFins', values: { name: partName(other), part: partName(parent) } });
  }
  const fin = finSets[0]!;
  const plan = finPlanform(w, fin);
  const count = Math.round(num(fin, 'finCount', 3));
  if (count < FIN_MIN || count > FIN_MAX) {
    throw new KeyedError('errors.rasaero.finCount', { found: count, name: partName(fin) });
  }
  const pos: ComponentPosition = fin.position ? positionOf(fin) : { method: 'bottom', offset: 0 };
  const tubeLen = partLength(parent);
  const bottomOffset = startFromPosition(pos, plan.root, tubeLen, parentStart) + plan.root - tubeLen;
  // The front edge measured from the part's bottom.
  const locIn = (plan.root - bottomOffset + below) * IN;
  const cs = str(fin, 'crossSection', 'square');
  const section = SECTION_TO_AIRFOIL.get(str(fin, 'airfoilSection', ''));
  // No <PartType> inside <Fin>: RASAero's parser is rigid.
  emit('<Fin>');
  emit(`<Count>${count}</Count>`);
  emit(`<Chord>${fmt(plan.root * IN)}</Chord>`);
  emit(`<Span>${fmt(plan.height * IN)}</Span>`);
  emit(`<SweepDistance>${fmt(plan.sweep * IN)}</SweepDistance>`);
  emit(`<TipChord>${fmt(plan.tip * IN)}</TipChord>`);
  emit(`<Thickness>${fmt(num(fin, 'thickness', FIN_DEFAULTS.thickness) * IN)}</Thickness>`);
  emit(`<LERadius>${section ? fmt(num(fin, 'finLeRadius', 0) * IN) : '0'}</LERadius>`);
  emit(`<Location>${fmt(locIn)}</Location>`);
  emit(
    `<AirfoilSection>${section ?? (cs === 'airfoil' ? 'Subsonic NACA' : cs === 'rounded' ? 'Rounded' : 'Square')}</AirfoilSection>`,
  );
  emit(`<FX1>${section ? fmt(num(fin, 'airfoilLeDiamond', 0) * IN) : '0'}</FX1>`);
  emit(`<FX3>${fin['airfoilSection'] === 'hexagonal' ? fmt(num(fin, 'airfoilTeDiamond', 0) * IN) : '0'}</FX3>`);
  emit('</Fin>');
}

function noseXml(w: Cdx1Writer, node: ComponentNode): void {
  const { emit } = w;
  if (node['flipped'] === true) throw new KeyedError('errors.rasaero.noseFlipped', { name: partName(node) });
  const shape = nodeShape(node);
  const param = num(node, 'shapeParameter', shapeParamDefault(shape));
  let rasShape: string;
  let powerLaw: number | null = null;
  const value = roundFixed(param, 3);
  if (shape === 'conical') rasShape = 'Conical';
  else if (shape === 'ogive') {
    if (!mathEquals(param, 1))
      throw new KeyedError('errors.rasaero.noseOgiveParameter', { name: partName(node), value });
    rasShape = 'Tangent Ogive';
  } else if (shape === 'ellipsoid') rasShape = 'Elliptical';
  else if (shape === 'haack') {
    if (mathEquals(param, 0)) rasShape = 'Von Karman Ogive';
    // LV-Haack is C = 1/3; desktop accepts it within 1%.
    else if (mathEquals(param, 1 / 3, 0.01)) rasShape = 'LV-Haack';
    else throw new KeyedError('errors.rasaero.noseHaackParameter', { name: partName(node), value });
  } else if (shape === 'power') {
    rasShape = 'Power Law';
    powerLaw = param;
  } else throw new KeyedError('errors.rasaero.noseShape', { shape: { key: `noseShape.${shape}` } });
  const len = partLength(node);
  emit('<NoseCone>');
  emit('<PartType>NoseCone</PartType>');
  emit(`<Length>${fmt(len * IN)}</Length>`);
  emit(`<Diameter>${fmt(noseConeAftRadius(node) * 2 * IN)}</Diameter>`);
  emit(`<Shape>${rasShape}</Shape>`);
  emit('<BluntRadius>0</BluntRadius>');
  emit(`<Location>${fmt(w.locM * IN)}</Location>`);
  emit('<Color>Black</Color>');
  if (powerLaw !== null) emit(`<PowerLaw>${fmt(powerLaw)}</PowerLaw>`);
  emit('</NoseCone>');
  w.locM += len;
}

export const aftRadius = (node: ComponentNode): number =>
  node.type === 'bodytube' ? bodyTubeRadius(node) : profileEnds(node).aft;

function tubeXml(w: Cdx1Writer, node: ComponentNode, previous: ComponentNode | undefined): void {
  const { emit } = w;
  // RASAero resizes a tube to the aft diameter of the part ahead (BodyTubeDTO, RASAeroExport.error15).
  if (previous && !mathEquals(bodyTubeRadius(node), aftRadius(previous))) {
    throw new KeyedError('errors.rasaero.tubeStep', { name: partName(node), previous: partName(previous) });
  }
  const len = partLength(node);
  emit('<BodyTube>');
  emit('<PartType>BodyTube</PartType>');
  emit(`<Length>${fmt(len * IN)}</Length>`);
  emit(`<Diameter>${fmt(bodyTubeRadius(node) * 2 * IN)}</Diameter>`);
  const lug = (node.children ?? []).find((c) => c.type === 'launchlug');
  const ll = KERNEL_DEFAULTS.launchlug;
  emit(`<LaunchLugDiameter>${fmt(lug ? num(lug, 'outerRadius', ll.outerRadius) * 2 * IN : 0)}</LaunchLugDiameter>`);
  emit(`<LaunchLugLength>${fmt(lug ? num(lug, 'length', ll.length) * IN : 0)}</LaunchLugLength>`);
  const rail = (node.children ?? []).find((c) => c.type === 'railbutton');
  const rb = COMPONENT_DEFAULTS.railbutton;
  emit(`<RailGuideDiameter>${fmt(rail ? num(rail, 'outerDiameter', rb.outerDiameter) * IN : 0)}</RailGuideDiameter>`);
  emit(`<RailGuideHeight>${fmt(rail ? num(rail, 'height', rb.height) * IN : 0)}</RailGuideHeight>`);
  emit('<LaunchShoeArea>0</LaunchShoeArea>');
  emit(`<Location>${fmt(w.locM * IN)}</Location>`);
  emit('<Color>Black</Color>');
  emit('<BoattailLength>0</BoattailLength>');
  emit('<BoattailRearDiameter>0</BoattailRearDiameter>');
  emit('<BoattailOffset>0</BoattailOffset>');
  emit('<Overhang>0</Overhang>');
  finXml(w, node, w.locM);
  emit('</BodyTube>');
  w.locM += len;
}

function transitionXml(w: Cdx1Writer, node: ComponentNode, boattail: boolean): void {
  const { emit } = w;
  if (nodeShape(node) !== 'conical') {
    throw new KeyedError('errors.rasaero.transitionShape');
  }
  const len = partLength(node);
  const tag = boattail ? 'BoatTail' : 'Transition';
  emit(`<${tag}>`);
  emit(`<PartType>${tag}</PartType>`);
  emit(`<Length>${fmt(len * IN)}</Length>`);
  // <Diameter> is the aft one too, as BasePartDTO writes it.
  const rear = fmt(profileEnds(node).aft * 2 * IN);
  emit(`<Diameter>${rear}</Diameter>`);
  emit(`<RearDiameter>${rear}</RearDiameter>`);
  emit(`<Location>${fmt(w.locM * IN)}</Location>`);
  emit('<Color>Black</Color>');
  finXml(w, node, w.locM);
  emit(`</${tag}>`);
  w.locM += len;
}

// Whole tree, not only a stage's direct child as desktop error33: the editor mounts them on tubes.
export function refuseAssemblies(stagesIn: readonly ComponentNode[]): void {
  for (const node of walkNodes(stagesIn.flatMap((st) => st.children ?? []))) {
    if (isAssembly(node.type)) {
      throw new KeyedError(node.type === 'podset' ? 'errors.rasaero.noPods' : 'errors.rasaero.noParallel', {
        name: partName(node),
      });
    }
  }
}

// Order rules from RocketDesignDTO.
export function writeSustainerChain(w: Cdx1Writer, sustainer: ComponentNode, stageCount: number): void {
  const chain = (sustainer.children ?? []).filter(
    (c) => c.type === 'nosecone' || c.type === 'bodytube' || c.type === 'transition',
  );
  chain.forEach((node, i) => {
    const last = i === chain.length - 1;
    if (i === 0 && node.type !== 'nosecone') {
      throw new KeyedError('errors.rasaero.noseFirst', { name: partName(node) });
    }
    if (i === 1 && !(node.type === 'bodytube' || (node.type === 'transition' && last))) {
      throw new KeyedError('errors.rasaero.secondPart', { name: partName(node) });
    }
    if (node.type === 'nosecone') {
      if (i !== 0) throw new KeyedError('errors.rasaero.noseNotFirst', { name: partName(node) });
      noseXml(w, node);
    } else if (node.type === 'bodytube') tubeXml(w, node, chain[i - 1]);
    else transitionXml(w, node, stageCount === 1 && last);
  });
}
