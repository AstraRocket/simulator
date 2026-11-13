import type { ComponentNode, ComponentPosition } from '../../../engine/openRocketEngine';
import { nodeShape, shapeParamDefault } from '../../../tree/shapeProfile';
import { num, str } from '../../../tree/nodeProps';
import { radToDeg } from '../../../prefs/units';
import { kernelPresetType } from './presetTypes';
import { escapeXml } from '../xmlUtil';
import { uuid } from '../../app/uuid';
import { COMPONENT_DEFAULTS } from '../../design/componentDefaults';
import { KERNEL_MATERIALS } from '../../../tree/kernelDefaults';
import type { OrkDeployOverride, OrkSepOverride } from '../orkTypes';
import type { OrkWriter } from './exportWriter';
import { passthroughOf } from './passthrough';
import { baysXml, mainDeviceXml } from './orkBays';
import { parseHexColor, rgbChannels } from '../../design/colorHex';
import { INSIDE_COLOR_TYPES, readAppearance, type PartAppearance } from '../../design/appearance';
import { designSeparation } from '../../flight/flightConfigs';
import { FILLET_MATERIAL_KEYS, resolvedMaterial, type ResolvedMaterial } from '../../design/materialSlots';
import type { MaterialType } from '../../materials/materialTypes';
import { DESKTOP_PART_NAMES } from '../desktopPartNames';

const CARDBOARD = KERNEL_MATERIALS.bulk;

/** A Map: `constructor`/`__proto__` from file text would hit Object.prototype. */
const DESKTOP_GROUPS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    Metals: 'Metals',
    Woods: 'Woods',
    Plastics: 'Plastics',
    Fabrics: 'Fabrics',
    Paper: 'PaperProducts',
    PaperProducts: 'PaperProducts',
    Foams: 'Foams',
    Composites: 'Composites',
    Fibers: 'Fibers',
    ThreadsLines: 'ThreadsLines',
    Elastics: 'Elastics',
    Kevlars: 'Kevlars',
    Nylons: 'Nylons',
    Other: 'Other',
    Custom: 'Custom',
  }),
);

export function desktopGroup(group: unknown): string | undefined {
  return typeof group === 'string' ? DESKTOP_GROUPS.get(group) : undefined;
}

function groupAttr(group: unknown): string {
  const known = desktopGroup(group);
  return known ? ` group="${escapeXml(known)}"` : '';
}

/** Absent stays absent: desktop's `MaterialSetter` treats presence as the modulus being set. */
function shearModulusAttr(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? ` shearModulus="${v}"` : '';
}

/** A stated material's group is mapped to desktop's; the kernel defaults' groups are desktop's already. */
function materialXml(tag: string, kind: MaterialType, m: ResolvedMaterial): string {
  const shear = kind === 'bulk' ? shearModulusAttr(m.shearModulus) : '';
  const group = m.stated ? (kind === 'bulk' ? groupAttr(m.group) : '') : ` group="${escapeXml(m.group ?? '')}"`;
  return `<${tag} type="${kind}" density="${m.density}"${shear}${group}>${escapeXml(m.name)}</${tag}>`;
}

export function material(w: OrkWriter, depth: number, node: ComponentNode, kind: MaterialType = 'bulk'): void {
  w.emit(depth, materialXml('material', kind, resolvedMaterial(node, kind)));
}

export function position(
  w: OrkWriter,
  depth: number,
  node: ComponentNode,
  dflt: ComponentPosition['method'] = 'top',
): void {
  const pos = node.position ?? { method: dflt, offset: 0 };
  // The file's original position, for a byte-stable round trip, unless the part has moved.
  const src = pos.ork && pos.method === 'top' && pos.ork.resolved === pos.offset ? pos.ork : pos;
  w.emit(depth, `<axialoffset method="${src.method}">${src.offset}</axialoffset>`);
  w.emit(depth, `<position type="${src.method}">${src.offset}</position>`);
}

export function header(
  w: OrkWriter,
  depth: number,
  node: ComponentNode,
  fallback = DESKTOP_PART_NAMES[node.type] ?? '',
): void {
  w.emit(depth, `<name>${escapeXml(node.name ?? fallback)}</name>`);
  w.emit(depth, `<id>${uuid()}</id>`);
  if (typeof node['comment'] === 'string' && node['comment']) {
    w.emit(depth, `<comment>${escapeXml(node['comment'])}</comment>`);
  }
  if (typeof node['lineStyle'] === 'string' && node['lineStyle']) {
    w.emit(depth, `<linestyle>${escapeXml(node['lineStyle'])}</linestyle>`);
  }
  presetXml(w, depth, node);
  appearanceXml(w, depth, node);
  colorXml(w, depth, node);
  overrides(w, depth, node);
  const bays = baysXml(node);
  if (bays) w.emit(depth, bays);
  const main = mainDeviceXml(node);
  if (main) w.emit(depth, main);
  // Passthrough goes last so it cannot split elements the desktop reader expects in order.
  for (const raw of passthroughOf(node)) w.emit(depth, raw);
}

/** Only with a digest: desktop shows an "Invalid ComponentPreset" dialog otherwise. */
function presetXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  const p = node['preset'] as { type?: string; manufacturer?: string; partNo?: string; digest?: string } | undefined;
  if (!p || typeof p !== 'object' || !p.partNo || !p.digest) return;
  const attr = (name: string, v: string | undefined) => (v ? ` ${name}="${escapeXml(v)}"` : '');
  w.emit(
    depth,
    `<preset${attr('type', kernelPresetType(p.type))}${attr('manufacturer', p.manufacturer)}` +
      `${attr('partno', p.partNo)}${attr('digest', p.digest)}/>`,
  );
}

function appearanceXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  const body = (a: PartAppearance) => {
    const [r, g, b] = rgbChannels(parseHexColor(a.paint) ?? 0);
    w.emit(depth + 1, `<paint red="${r}" green="${g}" blue="${b}" alpha="${a.alpha}"/>`);
    w.emit(depth + 1, `<shine>${a.shine}</shine>`);
    // Written every time, as `RocketComponentSaver` does; absent, desktop reads false.
    w.emit(depth + 1, `<opacityaffectstexture>${a.opacityAffectsTexture === true}</opacityaffectstexture>`);
  };
  const outside = readAppearance(node['appearance']);
  if (outside) {
    w.emit(depth, '<appearance>');
    body(outside);
    w.emit(depth, '</appearance>');
  }
  const inside = INSIDE_COLOR_TYPES.has(node.type) ? readAppearance(node['insideAppearance']) : undefined;
  if (inside) {
    w.emit(depth, '<insideappearance>');
    w.emit(depth + 1, `<edgessameasinside>${node['edgesSameAsInside'] === true}</edgessameasinside>`);
    // The element is named for the opposite of what it holds: `isSeparateInsideOutside()`.
    w.emit(depth + 1, `<insidesameasoutside>${node['separateInsideOutside'] === true}</insidesameasoutside>`);
    body(inside);
    w.emit(depth, '</insideappearance>');
  }
}

function colorXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  const n = parseHexColor(node['color']);
  if (n === null) return;
  const [r, g, b] = rgbChannels(n);
  w.emit(depth, `<color red="${r}" green="${g}" blue="${b}"/>`);
}

function overrides(w: OrkWriter, depth: number, node: ComponentNode): void {
  const sub = (key: string) => (node[key] === true ? 'true' : 'false');
  if (typeof node['overrideMass'] === 'number') {
    w.emit(depth, `<overridemass>${node['overrideMass']}</overridemass>`);
    w.emit(depth, `<overridesubcomponentsmass>${sub('overrideSubcomponentsMass')}</overridesubcomponentsmass>`);
  }
  if (typeof node['overrideCGX'] === 'number') {
    w.emit(depth, `<overridecg>${node['overrideCGX']}</overridecg>`);
    w.emit(depth, `<overridesubcomponentscg>${sub('overrideSubcomponentsCG')}</overridesubcomponentscg>`);
  }
  if (typeof node['overrideCD'] === 'number') {
    w.emit(depth, `<overridecd>${node['overrideCD']}</overridecd>`);
    w.emit(depth, `<overridesubcomponentscd>${sub('overrideSubcomponentsCD')}</overridesubcomponentscd>`);
  }
}

// Written only when set: desktop warns on these extension tags.
export function airfoilXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  const section = node['airfoilSection'];
  if (typeof section === 'string' && section) {
    w.emit(depth, `<airfoilsection>${escapeXml(section)}</airfoilsection>`);
  }
  for (const [key, tag] of [
    ['airfoilLeDiamond', 'airfoillediamond'],
    ['airfoilTeDiamond', 'airfoiltediamond'],
    ['finLeRadius', 'finleradius'],
  ] as const) {
    const v = node[key];
    if (typeof v === 'number' && v > 0) w.emit(depth, `<${tag}>${v}</${tag}>`);
  }
}

/** Underscores removed: the only form DocumentConfig.findEnum matches. */
export const deployEventXml = (ev: string): string => ev.replace(/_/g, '');

const holdsOverride = <T extends object>(o: T | null | undefined): o is T =>
  !!o && Object.values(o).some((v) => v !== undefined);

/** `isDefault` compares identity, so an override equal to the device's values is still written. */
export function deploymentConfigs(w: OrkWriter, depth: number, node: ComponentNode): void {
  for (const c of w.writeConfigs) {
    const o: OrkDeployOverride | undefined = node.id ? c.deployments?.[node.id] : undefined;
    if (!holdsOverride(o)) continue;
    w.emit(depth, `<deploymentconfiguration configid="${escapeXml(c.id)}">`);
    if (o.deployEvent !== undefined)
      w.emit(depth + 1, `<deployevent>${escapeXml(deployEventXml(o.deployEvent))}</deployevent>`);
    if (o.deployAltitude !== undefined) w.emit(depth + 1, `<deployaltitude>${o.deployAltitude}</deployaltitude>`);
    if (o.deployDelay !== undefined) w.emit(depth + 1, `<deploydelay>${o.deployDelay}</deploydelay>`);
    w.emit(depth, '</deploymentconfiguration>');
  }
}

/** Cardboard is the kernel's default fillet material (ApplicationPreferences.getDefaultComponentMaterial). */
export function filletXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  w.emit(depth, `<filletradius>${num(node, 'filletRadius', 0)}</filletradius>`);
  // An empty name goes out as custom: desktop refuses an empty <filletmaterial>.
  const m = resolvedMaterial(node, 'bulk', FILLET_MATERIAL_KEYS, CARDBOARD);
  w.emit(depth, materialXml('filletmaterial', 'bulk', m));
}

export function finAngleXml(w: OrkWriter, depth: number, node: ComponentNode, method: 'relative' | 'fixed'): void {
  const deg = radToDeg(num(node, 'rotation', 0));
  w.emit(depth, `<angleoffset method="${method}">${deg}</angleoffset>`);
  w.emit(depth, `<rotation>${deg}</rotation>`);
}

export function finishXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  w.emit(depth, `<finish>${escapeXml(str(node, 'finish', 'normal'))}</finish>`);
}

// Legacy relativeto first, then the modern one: readers apply the last occurrence.
export function finTabsXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  const h = num(node, 'tabHeight', 0);
  const len = num(node, 'tabLength', 0);
  if (h <= 0 || len <= 0) return;
  const method = typeof node['tabOffsetMethod'] === 'string' ? node['tabOffsetMethod'] : 'middle';
  const legacy = method === 'top' ? 'front' : method === 'bottom' ? 'end' : 'center';
  const offset = num(node, 'tabOffset', 0);
  w.emit(depth, `<tabheight>${h}</tabheight>`);
  w.emit(depth, `<tablength>${len}</tablength>`);
  w.emit(depth, `<tabposition relativeto="${legacy}">${offset}</tabposition>`);
  w.emit(depth, `<tabposition relativeto="${method}">${offset}</tabposition>`);
}

export function thicknessXml(w: OrkWriter, depth: number, node: ComponentNode, fb: number): void {
  w.emit(
    depth,
    node['filled'] === true ? '<thickness>filled</thickness>' : `<thickness>${num(node, 'thickness', fb)}</thickness>`,
  );
}

export function packedXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  w.emit(depth, `<packedlength>${num(node, 'length', COMPONENT_DEFAULTS.recovery.packedLength)}</packedlength>`);
  // `radius`, not `packedRadius`: nothing sets `packedRadius`.
  w.emit(depth, packedRadiusXml(node, COMPONENT_DEFAULTS.recovery.packedRadius));
}

// Transition.Shape.defaultParameter(); any other fallback reshapes the nose (haack's is 0, not 1).
export function shapeParamXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  const dflt = shapeParamDefault(nodeShape(node));
  w.emit(depth, `<shapeparameter>${num(node, 'shapeParameter', dflt)}</shapeparameter>`);
}

export function packedRadiusXml(node: ComponentNode, fallback: number): string {
  const v = num(node, 'radius', fallback);
  return `<packedradius>${node['radiusAuto'] === true ? `auto ${v}` : v}</packedradius>`;
}

export function autoRadius(w: OrkWriter, depth: number, node: ComponentNode, key: string, tag: string): void {
  // The flag decides, not the resolved value; absent means auto, a stated 0 is fixed (DoubleSetter).
  const v = node[key];
  const auto = node[`${key}Auto`] === true || !(typeof v === 'number' && v >= 0);
  w.emit(depth, `<${tag}>${auto ? 'auto' : v}</${tag}>`);
}

/** `isDefault` compares identity, so equal values still write (AxialStageSaver). */
export function separationXml(w: OrkWriter, depth: number, node: ComponentNode): void {
  const { separationEvent: ev, separationDelay: delay, separationAltitude: alt } = designSeparation(node);
  const sep = (d: number, o: OrkSepOverride) => {
    w.emit(d, `<separationevent>${escapeXml(o.separationEvent ?? ev)}</separationevent>`);
    w.emit(d, `<separationaltitude>${o.separationAltitude ?? alt}</separationaltitude>`);
    w.emit(d, `<separationdelay>${o.separationDelay ?? delay}</separationdelay>`);
  };
  sep(depth, {});
  for (const c of w.writeConfigs) {
    const o: OrkSepOverride | undefined = node.id ? c.separations?.[node.id] : undefined;
    if (!holdsOverride(o)) continue;
    w.emit(depth, `<separationconfiguration configid="${escapeXml(c.id)}">`);
    sep(depth + 1, o);
    w.emit(depth, '</separationconfiguration>');
  }
}
