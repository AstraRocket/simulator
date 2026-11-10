import type { ComponentNode, ComponentPosition } from '../../../engine/openRocketEngine';
import { appPresetType } from './presetTypes';
import { xmlText as text } from '../xmlUtil';
import { COMPONENT_DEFAULTS } from '../../design/componentDefaults';
import { clampCount, finiteNum } from './numbers';
import { MAX_ASSEMBLY_INSTANCES, MAX_FIN_COUNT } from './importLimits';
import { EXTRA_KEY, readPassthrough } from './passthrough';
import { BAYS_KEY, MAIN_DEVICE_KEY, readBays, readMainDevice } from './orkBays';
import type { OrkDeployOverride, OrkSepOverride } from '../orkTypes';
import { hexOf, packRgb } from '../../design/colorHex';
import { BUILDER_DEFAULT, INSIDE_COLOR_TYPES, type PartAppearance } from '../../design/appearance';
import { degToRad } from '../../../prefs/units';
import { KERNEL_SEPARATION } from '../../../tree/kernelDefaults';
import { DEPLOY_EVENTS, MASS_COMPONENT_TYPES, SEPARATION_EVENTS } from '../../design/componentFields';
import { CLUSTER_POINTS } from '../../../tree/cluster';
import { keyedNote, notePartName, type ImportNote } from '../importNote';
import { PROFILE_SHAPES } from '../../../tree/shapeProfile';
import { rebaseTabOffset } from '../../../tree/finPlanform';

/** `BooleanSetter` ignores case. */
export function isTrueTag(el: Element, tag: string): boolean {
  return text(el, `:scope > ${tag}`)?.toLowerCase() === 'true';
}

export function numTag(el: Element, tag: string, fallback: number): number {
  const t = text(el, `:scope > ${tag}`);
  // Values like "auto 0.012" carry an automatic flag + last value.
  const v = t ? Number(t.split(/\s+/).pop()) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

/** Not for signed values (sweep, offsets, angles), which keep `numTag`. */
export function nonNegTag(el: Element, tag: string, fallback: number): number {
  return Math.max(0, numTag(el, tag, fallback));
}

/** `undefined` when unreadable, so the earlier value stands, as desktop's `parseDouble` NaN leaves it. */
export function optNonNegTag(el: Element, tag: string): number | undefined {
  const v = numTag(el, tag, NaN);
  return Number.isFinite(v) ? Math.max(0, v) : undefined;
}

/** `undefined` means automatic; `numTag` would lose the flag. */
export function autoRadiusTag(el: Element, tag: string): number | undefined {
  const t = text(el, `:scope > ${tag}`)?.trim();
  if (!t || t.toLowerCase().startsWith('auto')) return undefined;
  // A stated 0 is kept: desktop's phantom tubes carry fins on a pod at its own axis.
  const v = finiteNum(t);
  return v !== undefined && v >= 0 ? v : undefined;
}

export function isDrogueTag(el: Element): boolean {
  return (text(el, ':scope > isdrogue') ?? '').trim().toLowerCase() === 'true';
}

export function finCountTag(el: Element, fallback: number = COMPONENT_DEFAULTS.finset.finCount): number {
  return clampCount(numTag(el, 'fincount', fallback), 1, MAX_FIN_COUNT);
}

export function readAutoPackedRadius(el: Element, node: ComponentNode): boolean {
  const raw = text(el, ':scope > packedradius')?.trim() ?? '';
  if (!raw.toLowerCase().startsWith('auto')) return false;
  node['radiusAuto'] = true;
  const v = finiteNum(raw.slice(4));
  if (v !== undefined && v > 0) node['radius'] = v;
  return true;
}

/** Keyed `length` / `radius`: any other key would fly the 12.5 mm default. */
export function readPackedSize(el: Element, node: ComponentNode): void {
  node['length'] = nonNegTag(el, 'packedlength', COMPONENT_DEFAULTS.recovery.packedLength);
  if (readAutoPackedRadius(el, node)) return;
  const r = numTag(el, 'packedradius', NaN);
  if (r >= 0 && r !== COMPONENT_DEFAULTS.recovery.packedRadius) node['radius'] = r;
}

export function readAutoValue(el: Element, node: ComponentNode, tag: string, flag: string): boolean {
  if (
    (text(el, `:scope > ${tag}`)?.trim().toLowerCase() ?? '') === 'auto' ||
    (text(el, `:scope > ${tag}auto`)?.trim().toLowerCase() ?? '') === 'true'
  ) {
    node[flag] = true;
    return true;
  }
  return false;
}

const positiveAttr = (el: Element, name: string): number | undefined => {
  const v = finiteNum(el.getAttribute(name));
  return v !== undefined && v > 0 ? v : undefined;
};

function matName(m: Element): string | undefined {
  const name = m.textContent?.trim();
  return name && name.toLowerCase() !== 'custom' ? name : undefined;
}

// Their `<material>` is surface or line, or a mass object has none (`DocumentConfig`).
const NOT_BULK_TYPES: ReadonlySet<string> = new Set(['parachute', 'streamer', 'shockcord', 'masscomponent']);

/** `MaterialSetter` checks a type only when one is stated; otherwise the part decides the kind. */
function readBulkMaterial(el: Element, node: ComponentNode): void {
  const m = el.querySelector(':scope > material');
  if (!m) return;
  const type = m.getAttribute('type');
  if (type !== 'bulk' && (type !== null || NOT_BULK_TYPES.has(node.type))) return;
  const density = positiveAttr(m, 'density');
  if (density !== undefined) node.density = density;
  const name = matName(m);
  if (name) node['materialName'] = name;
  const group = m.getAttribute('group');
  if (group) node['materialGroup'] = group;
  // Absent stays absent: `MaterialSetter` treats its presence as user-set.
  const shear = finiteNum(m.getAttribute('shearModulus'));
  if (shear !== undefined && shear >= 0) node['shearModulus'] = shear;
}

export function readSoftMaterial(
  el: Element,
  node: ComponentNode,
  kind: 'surface' | 'line',
  densityKey: string,
  nameKey: string,
  selector = ':scope > material',
): void {
  const m = el.querySelector(selector);
  if (!m) return;
  const type = m.getAttribute('type');
  if (type !== null && type !== kind) return;
  // 0 is legal, as desktop's `MaterialSetter` takes it: a massless canopy stays massless.
  const d = finiteNum(m.getAttribute('density'));
  if (d !== undefined && d >= 0) node[densityKey] = d;
  const name = matName(m);
  if (name) node[nameKey] = name;
}

export function readInstances(el: Element, node: ComponentNode): void {
  const count = clampCount(numTag(el, 'instancecount', 1), 1, MAX_ASSEMBLY_INSTANCES);
  if (count > 1) node['instanceCount'] = count;
  // A stated 0 is kept: absent means the kernel's constructor spacing (60 mm for a lug).
  const sep = numTag(el, 'instanceseparation', NaN);
  if (Number.isFinite(sep)) node['instanceSeparation'] = sep;
}

/** Radians from degrees, clamped as LaunchLug/RailButton.setAngleOffset clamp it on load. */
export function readAngleAroundBody(el: Element): number {
  const a = numTag(el, 'angleoffset', NaN);
  const deg = Number.isFinite(a) ? a : numTag(el, 'radialdirection', 180);
  return Math.min(Math.PI, Math.max(-Math.PI, degToRad(deg)));
}

export function readAirfoil(el: Element, node: ComponentNode): void {
  const section = text(el, ':scope > airfoilsection');
  if (section) node['airfoilSection'] = section;
  const led = numTag(el, 'airfoillediamond', 0);
  if (led > 0) node['airfoilLeDiamond'] = led;
  const ted = numTag(el, 'airfoiltediamond', 0);
  if (ted > 0) node['airfoilTeDiamond'] = ted;
  const ler = numTag(el, 'finleradius', 0);
  if (ler > 0) node['finLeRadius'] = ler;
  readFillet(el, node);
}

function readFillet(el: Element, node: ComponentNode): void {
  const r = numTag(el, 'filletradius', 0);
  if (r > 0) node['filletRadius'] = r;
  // Kept at a 0 radius too, as desktop keeps it.
  const m = el.querySelector(':scope > filletmaterial');
  // `MaterialSetter` refuses a stated type other than bulk.
  if (!m || (m.getAttribute('type') ?? 'bulk') !== 'bulk') return;
  const d = positiveAttr(m, 'density');
  if (d !== undefined) node['filletDensity'] = d;
  const group = m.getAttribute('group');
  if (group) node['filletMaterialGroup'] = group;
  const name = (m.textContent ?? '').trim();
  if (name) node['filletMaterialName'] = name;
}

export function readFinRotation(el: Element, node: ComponentNode): void {
  const deg = numTag(el, 'rotation', 0);
  if (deg !== 0) node['rotation'] = degToRad(deg);
}

/** `FinTabPositionSetter`: legacy names by substring, then the enum's exact lower-case name. */
function tabMethod(relativeTo: string | null): string | undefined {
  if (relativeTo === null) return undefined;
  if (relativeTo.includes('front')) return 'top';
  if (relativeTo.includes('center')) return 'middle';
  if (relativeTo.includes('end')) return 'bottom';
  const method = relativeTo.trim();
  return method === 'top' || method === 'middle' || method === 'bottom' ? method : undefined;
}

/**
 * Desktop files carry two <tabposition>, replayed in file order as desktop does: a valid one
 * rebases the tab as `setTabOffsetMethod`, then sets its offset if readable. Read after the
 * fin's geometry, which the rebase measures.
 */
export function readFinTabs(el: Element, node: ComponentNode): void {
  const h = numTag(el, 'tabheight', 0);
  const len = numTag(el, 'tablength', 0);
  if (h <= 0 || len <= 0) return;
  node['tabHeight'] = h;
  node['tabLength'] = len;
  for (const pos of Array.from(el.querySelectorAll(':scope > tabposition'))) {
    const method = tabMethod(pos.getAttribute('relativeto'));
    if (!method) continue;
    Object.assign(node, rebaseTabOffset(node, method));
    const offset = finiteNum(pos.textContent);
    if (offset !== undefined) node['tabOffset'] = offset;
  }
}

function readPosition(el: Element): ComponentPosition | undefined {
  // OpenRocket ≤ 15.03 files have only <position type="...">.
  const off = el.querySelector(':scope > axialoffset') ?? el.querySelector(':scope > position');
  if (!off) return undefined;
  const method = (off.getAttribute('method') ?? off.getAttribute('type') ?? 'top') as ComponentPosition['method'];
  // A rejected method falls back to the parent's top, so 'after' must be listed.
  if (!['top', 'middle', 'bottom', 'absolute', 'after'].includes(method)) return undefined;
  return { method, offset: finiteNum(off.textContent) ?? 0 };
}

const enumToken = (raw: string): string => raw.trim().toLowerCase().replace(/_/g, '');

/** Includes `ComponentFactory.finishOf`'s `regular` alias for NORMAL. */
const FINISHES: ReadonlyMap<string, string> = new Map([
  ...[
    'rough',
    'roughunfinished',
    'unfinished',
    'normal',
    'smooth',
    'polished',
    'finishpolished',
    'optimum',
    'mirror',
  ].map((f): [string, string] => [f, f]),
  ['regular', 'normal'],
]);

const SHAPES: ReadonlyMap<string, string> = new Map(PROFILE_SHAPES.map((s) => [s, s]));

const CROSS_SECTIONS: ReadonlyMap<string, string> = new Map(['square', 'rounded', 'airfoil'].map((s) => [s, s]));

const NOTE_VALUE_CHARS = 40;

/** Only a name the bridge builds gets through: the bridge hands it to a `valueOf`-style switch. */
function enumTag(
  el: Element,
  tag: string,
  accepted: ReadonlyMap<string, string>,
  noteKey: string,
  node: ComponentNode,
  notes: ImportNote[] | undefined,
): string | undefined {
  const raw = text(el, `:scope > ${tag}`);
  if (raw === null || raw.trim() === '') return undefined;
  const value = accepted.get(enumToken(raw));
  if (value !== undefined) return value;
  notes?.push(keyedNote(noteKey, { part: notePartName(node), value: raw.trim().slice(0, NOTE_VALUE_CHARS) }));
  return undefined;
}

export function shapeTag(el: Element, node: ComponentNode, notes: ImportNote[] | undefined, fallback: string): string {
  return enumTag(el, 'shape', SHAPES, 'importNote.shapeUnknown', node, notes) ?? fallback;
}

export function crossSectionTag(el: Element, node: ComponentNode, notes: ImportNote[] | undefined): string | undefined {
  return enumTag(el, 'crosssection', CROSS_SECTIONS, 'importNote.crossSectionUnknown', node, notes);
}

const MASS_TYPES: ReadonlyMap<string, string> = new Map(MASS_COMPONENT_TYPES.map((s) => [enumToken(s), s]));

const CLUSTERS: ReadonlyMap<string, string> = new Map(Object.keys(CLUSTER_POINTS).map((s) => [enumToken(s), s]));

export function massComponentTypeTag(
  el: Element,
  node: ComponentNode,
  notes: ImportNote[] | undefined,
): string | undefined {
  return enumTag(el, 'masscomponenttype', MASS_TYPES, 'importNote.massTypeUnknown', node, notes);
}

export function clusterTag(el: Element, node: ComponentNode, notes: ImportNote[] | undefined): string | undefined {
  return enumTag(el, 'clusterconfiguration', CLUSTERS, 'importNote.clusterUnknown', node, notes);
}

const DEPLOY_EVENT_NAMES: ReadonlyMap<string, string> = new Map(DEPLOY_EVENTS.map((ev) => [enumToken(ev), ev]));

const SEPARATION_EVENT_NAMES: ReadonlyMap<string, string> = new Map(SEPARATION_EVENTS.map((ev) => [enumToken(ev), ev]));

export function readDeployment(el: Element, node: ComponentNode, notes: ImportNote[] | undefined): void {
  Object.assign(node, readDeploymentTags(el, node, notes));
}

/** Altitude is floored: a negative one never fires the kernel's altitude trigger. */
export function readDeploymentTags(
  src: Element,
  node: ComponentNode,
  notes: ImportNote[] | undefined,
): OrkDeployOverride {
  const o: OrkDeployOverride = {};
  const event = enumTag(src, 'deployevent', DEPLOY_EVENT_NAMES, 'importNote.deployEventUnknown', node, notes);
  if (event) o.deployEvent = event;
  const altitude = optNonNegTag(src, 'deployaltitude');
  if (altitude !== undefined) o.deployAltitude = altitude;
  const delay = optNonNegTag(src, 'deploydelay');
  if (delay !== undefined) o.deployDelay = delay;
  return o;
}

export function readSeparationTags(src: Element, node: ComponentNode, notes: ImportNote[] | undefined): OrkSepOverride {
  const o: OrkSepOverride = {};
  const event = enumTag(
    src,
    'separationevent',
    SEPARATION_EVENT_NAMES,
    'importNote.separationEventUnknown',
    node,
    notes,
  );
  if (event) o.separationEvent = event;
  const delay = optNonNegTag(src, 'separationdelay');
  if (delay !== undefined) o.separationDelay = delay;
  const altitude = optNonNegTag(src, 'separationaltitude');
  if (altitude !== undefined) o.separationAltitude = altitude;
  return o;
}

export function readSeparation(
  el: Element,
  node: ComponentNode,
  configEl: Element | null,
  notes: ImportNote[] | undefined,
): void {
  const o = { ...readSeparationTags(el, node, notes), ...(configEl ? readSeparationTags(configEl, node, notes) : {}) };
  if (o.separationEvent && o.separationEvent !== KERNEL_SEPARATION.separationEvent)
    node['separationEvent'] = o.separationEvent;
  if (o.separationDelay !== undefined && o.separationDelay !== KERNEL_SEPARATION.separationDelay)
    node['separationDelay'] = o.separationDelay;
  if (o.separationAltitude !== undefined && o.separationAltitude !== KERNEL_SEPARATION.separationAltitude)
    node['separationAltitude'] = o.separationAltitude;
}

export function readCommon(el: Element, node: ComponentNode, withPosition: boolean, notes?: ImportNote[]): void {
  // First, so a node carrying only unknown elements still carries them.
  const extra = readPassthrough(el);
  if (extra) node[EXTRA_KEY] = extra;
  const bays = readBays(el);
  if (bays) node[BAYS_KEY] = bays;
  if (readMainDevice(el)) node[MAIN_DEVICE_KEY] = true;
  const nm = text(el, ':scope > name');
  if (nm) node.name = nm;
  const cmt = text(el, ':scope > comment');
  if (cmt) node['comment'] = cmt;
  const ls = text(el, ':scope > linestyle');
  if (ls) node['lineStyle'] = ls;
  const preset = el.querySelector(':scope > preset');
  if (preset) {
    const partNo = preset.getAttribute('partno');
    if (partNo) {
      node['preset'] = {
        // The file carries the kernel's enum constant (NOSE_CONE).
        type: appPresetType(preset.getAttribute('type') ?? ''),
        manufacturer: preset.getAttribute('manufacturer') ?? '',
        partNo,
        ...(preset.getAttribute('digest') ? { digest: preset.getAttribute('digest') } : {}),
      };
    }
  }
  readBulkMaterial(el, node);
  const fin = enumTag(el, 'finish', FINISHES, 'importNote.finishUnknown', node, notes);
  if (fin && fin !== 'normal') node['finish'] = fin;
  const col = orColor(el.querySelector(':scope > color'));
  if (col) node['color'] = col.paint;
  readAppearances(el, node);
  readOverrides(el, node);
  if (withPosition) {
    const pos = readPosition(el);
    if (pos) node.position = pos;
  }
}

function orColor(col: Element | null): { paint: string; alpha: number } | null {
  if (!col) return null;
  const ch = (name: string): number | null => {
    const raw = col.getAttribute(name);
    if (raw == null || !/^[+-]?\d+$/.test(raw)) return null;
    const v = Number(raw);
    return v >= 0 && v <= 255 ? v : null;
  };
  const [r, g, b] = [ch('red'), ch('green'), ch('blue')];
  const alpha = col.hasAttribute('alpha') ? ch('alpha') : 255;
  if (r === null || g === null || b === null || alpha === null) return null;
  return { paint: hexOf(packRgb(r, g, b)), alpha };
}

function readAppearanceBlock(el: Element): PartAppearance {
  const out: PartAppearance = { ...BUILDER_DEFAULT };
  const paint = orColor(el.querySelector(':scope > paint'));
  if (paint) Object.assign(out, paint);
  const shine = Number(text(el, ':scope > shine')?.trim() ?? NaN);
  // The `Appearance` constructor clamps the shine to 0-1.
  if (Number.isFinite(shine)) out.shine = Math.min(1, Math.max(0, shine));
  if (text(el, ':scope > opacityaffectstexture')?.trim().toLowerCase() === 'true') out.opacityAffectsTexture = true;
  return out;
}

/** The inside block only for an `InsideColorComponent`, as `InsideAppearanceHandler` does. */
function readAppearances(el: Element, node: ComponentNode): void {
  const outside = el.querySelector(':scope > appearance');
  if (outside) node['appearance'] = readAppearanceBlock(outside);
  const inside = el.querySelector(':scope > insideappearance');
  if (!inside || !INSIDE_COLOR_TYPES.has(node.type)) return;
  node['insideAppearance'] = readAppearanceBlock(inside);
  const flag = (...tags: string[]) => {
    for (const tag of tags) {
      const v = text(inside, `:scope > ${tag}`);
      if (v != null) return v.trim().toLowerCase() === 'true';
    }
    return false;
  };
  // `<insidesameasoutside>` holds `isSeparateInsideOutside()`, whatever its name says.
  if (flag('insidesameasoutside', 'insideSameAsOutside')) node['separateInsideOutside'] = true;
  if (flag('edgessameasinside', 'edgesSameAsInside')) node['edgesSameAsInside'] = true;
}

function readOverrides(el: Element, node: ComponentNode): void {
  const om = numTag(el, 'overridemass', NaN);
  if (Number.isFinite(om)) node['overrideMass'] = Math.max(om, 0);
  const ocg = numTag(el, 'overridecg', NaN);
  if (Number.isFinite(ocg)) node['overrideCGX'] = ocg;
  // A negative Cd is valid (`setOverrideCD`): it offsets the rest of the design's drag.
  const ocd = numTag(el, 'overridecd', NaN);
  if (Number.isFinite(ocd)) node['overrideCD'] = ocd;
  const legacyAll = isTrueTag(el, 'overridesubcomponents');
  if (legacyAll || isTrueTag(el, 'overridesubcomponentsmass')) {
    node['overrideSubcomponentsMass'] = true;
  }
  if (legacyAll || isTrueTag(el, 'overridesubcomponentscg')) {
    node['overrideSubcomponentsCG'] = true;
  }
  if (legacyAll || isTrueTag(el, 'overridesubcomponentscd')) {
    node['overrideSubcomponentsCD'] = true;
  }
}
