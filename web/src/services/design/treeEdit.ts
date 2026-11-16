import { must } from '../app/must';
import type { ComponentNode, ComponentType, RocketTree } from '../../engine/openRocketEngine';
import { defaultStageName } from './orkTree';
import type { Component, ParachuteComponent, TubeComponent } from '../parts/componentDb';
import { pinSavedSize, presetNode } from '../parts/customParts';
import { KERNEL_DEFAULTS, KERNEL_MATERIALS } from '../../tree/kernelDefaults.js';
import { COMPONENT_DEFAULTS } from './componentDefaults.js';
import { EXTERNAL_COMPONENT_TYPES, isChainType, type ChainType } from '../../tree/componentKinds';
import { uuid } from '../app/uuid';
import { isZero, mathEquals } from '../motors/mathEquals';
import { KeyedError } from '../../i18n/keyedError';
import { endShoulderClamp, shoulderSeed, syncAutoShoulders } from './autoShoulder';
import { syncAutoRadii } from './autoRadius';
import {
  findNode as findNodeIn,
  findSiblings,
  findWithParent,
  replaceNode,
  stageNodes,
  lineageOf,
  collectNodes,
} from '../../tree/treeWalk';
import { shapeChange } from '../../tree/shapeProfile';
import { num } from '../../tree/nodeProps';
import { clampToBounds, RING_BOUNDS } from './linkedDimensions';
import { repairNode } from './repairValues';

/** Radii first, since a shoulder follows the bore. Every tree rewrite must end with this. */
export const syncDerived = (tree: RocketTree): RocketTree => syncAutoShoulders(syncAutoRadii(tree));

/** Not a counter: one restarts on page load while persisted ids remain, so ids could collide. */
function newId(): string {
  return uuid();
}

/** Mutates a deep copy, then runs `syncDerived`. */
export function editCopy(tree: RocketTree, mutate: (next: RocketTree) => void): RocketTree {
  const next = structuredClone(tree);
  mutate(next);
  return syncDerived(next);
}

export function findNode(tree: RocketTree, id: string): ComponentNode | null {
  return findNodeIn(tree.components, id);
}

const BULK_MATERIAL = ['materialName', 'density'];
const SURFACE_MATERIAL = ['surfaceMaterialName', 'surfaceDensity'];
const TAPER = ['length', 'shape', 'shapeParameter', 'aftRadius', 'aftRadiusAuto', 'thickness', 'filled'];
const THICKNESS_RING = ['length', 'outerRadius', 'thickness', ...BULK_MATERIAL];

/** Keys whose setter calls `clearPreset()` in the engine's OpenRocket (`rocketcomponent`); others keep the link. */
const PRESET_SETTERS: Record<string, ReadonlySet<string>> = {
  nosecone: new Set([...TAPER, 'flipped', 'shoulderRadius', ...BULK_MATERIAL]),
  transition: new Set([
    ...TAPER,
    'foreRadius',
    'foreRadiusAuto',
    'foreShoulderRadius',
    'aftShoulderRadius',
    ...BULK_MATERIAL,
  ]),
  bodytube: new Set(['outerRadius', 'outerRadiusAuto', 'thickness', 'filled', ...BULK_MATERIAL]),
  innertube: new Set(THICKNESS_RING),
  tubecoupler: new Set(THICKNESS_RING),
  engineblock: new Set(THICKNESS_RING),
  centeringring: new Set(['length', 'outerRadius', 'innerRadius', ...BULK_MATERIAL]),
  bulkhead: new Set(['length', 'outerRadius', 'outerRadiusAuto', ...BULK_MATERIAL]),
  launchlug: new Set(['outerRadius', 'thickness', ...BULK_MATERIAL]),
  railbutton: new Set([
    'outerDiameter',
    'innerDiameter',
    'height',
    'baseHeight',
    'flangeHeight',
    'screwHeight',
    ...BULK_MATERIAL,
  ]),
  parachute: new Set(['diameter', 'lineCount', 'cd', ...SURFACE_MATERIAL]),
  streamer: new Set(['stripWidth', 'cd', ...SURFACE_MATERIAL]),
};

/** `Parachute.setLineLength` and `setLineMaterial` clear the link only on a chute that has lines. */
const PARACHUTE_LINE_KEYS = ['lineLength', 'lineMaterialName', 'lineDensity'];

/** `MathUtil.equals`, as the kernel's setters compare before returning early. */
const differs = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' ? !mathEquals(a, b) : a !== b;

function breaksPreset(before: ComponentNode, after: ComponentNode, patch: Partial<ComponentNode>): boolean {
  if ('preset' in patch) return false; // the picker sets the link and the dimensions together
  const changed = (k: string) => differs(before[k], after[k]);
  const setters = PRESET_SETTERS[before.type];
  if (setters && [...setters].some(changed)) return true;
  if (before.type !== 'parachute') return false;
  const lines = after['lineCount'] as number | undefined;
  return lines !== 0 && PARACHUTE_LINE_KEYS.some(changed);
}

/** `updateNode` always returns a fresh tree; check this first to skip a no-op rebuild and undo step. */
export function patchChangesNode(tree: RocketTree, id: string, patch: Partial<ComponentNode>): boolean {
  const node = findNode(tree, id);
  if (!node) return false;
  for (const key of Object.keys(patch)) {
    if (node[key] !== patch[key]) return true;
  }
  return false;
}

export function updateNode(tree: RocketTree, id: string, patch: Partial<ComponentNode>): RocketTree {
  let before = undefined as ComponentNode | undefined;
  const components = replaceNode(tree.components, id, (n) => {
    before = n;
    const patched = { ...n, ...patch };
    const seeded = { ...patched, ...shoulderSeed(n, patched, patch, tree.components) };
    const next = { ...seeded, ...endShoulderClamp(n, seeded, patch) };
    if (n['preset'] && breaksPreset(n, next, patch)) delete next['preset'];
    return next;
  });
  const synced = syncDerived({ ...tree, components });
  return before?.['preset'] && !('preset' in patch) ? unlinkMovedShoulder(synced, id, before) : synced;
}

const SHOULDER_RADII = ['shoulderRadius', 'foreShoulderRadius', 'aftShoulderRadius'];

/** On desktop a synced shoulder radius goes through `setShoulderRadius`, which clears the preset. */
function unlinkMovedShoulder(tree: RocketTree, id: string, before: ComponentNode): RocketTree {
  const after = findNode(tree, id);
  if (!after?.['preset'] || !SHOULDER_RADII.some((k) => differs(before[k], after[k]))) return tree;
  const components = replaceNode(tree.components, id, (n) => {
    const out = { ...n };
    delete out['preset'];
    return out;
  });
  return { ...tree, components };
}

export function removeNode(tree: RocketTree, id: string): RocketTree {
  return editCopy(tree, (next) => {
    const hit = findSiblings(next.components, id);
    if (hit) hit.siblings.splice(hit.index, 1);
  });
}

export function addChild(tree: RocketTree, parentId: string, node: ComponentNode): RocketTree {
  return editCopy(tree, (next) => {
    const parent = findNodeIn(next.components, parentId);
    if (parent) (parent.children ??= []).push(node);
  });
}

export function findMounts(tree: RocketTree): ComponentNode[] {
  return collectNodes(tree.components, (n) => n.motorMount === true);
}

export function findRecoveryDevices(tree: RocketTree): ComponentNode[] {
  return collectNodes(tree.components, (n) => isRecoveryDevice(n.type));
}

/** Pre-order matches the kernel's stage numbering and the `.ork`'s `<stage number="n">`. */
export function findStages(tree: RocketTree): ComponentNode[] {
  return collectNodes(tree.components, (n) => n.type === 'stage' || n.type === 'parallelstage');
}

export function findSeparators(tree: RocketTree): ComponentNode[] {
  return [
    ...stageNodes(tree)
      .filter((n) => typeof n.id === 'string')
      .slice(1),
    ...collectNodes(tree.components, (n) => n.type === 'parallelstage'),
  ];
}

export function isAxial(type: string): boolean {
  return isChainType(type);
}

/** Kernel `isCompatible` rules: looser fails to build, tighter rejects desktop files. A `fairing` is built as a mass component. */
const INTERNAL: ReadonlySet<string> = new Set([
  'innertube',
  'tubecoupler',
  'centeringring',
  'bulkhead',
  'engineblock',
  'parachute',
  'streamer',
  'shockcord',
  'masscomponent',
  'fairing',
]);
const BODY: ReadonlySet<string> = new Set(['nosecone', 'bodytube', 'transition'] satisfies ChainType[]);
const ON_BODY: ReadonlySet<string> = new Set([...EXTERNAL_COMPONENT_TYPES].filter((t) => !BODY.has(t)));
const ALL_TYPES: readonly ComponentType[] = [
  'stage',
  ...BODY,
  ...ON_BODY,
  ...INTERNAL,
  'podset',
  'parallelstage',
] as ComponentType[];

export function canHost(parentType: string, childType: string): boolean {
  switch (parentType) {
    case 'rocket':
      return childType === 'stage';
    case 'stage':
    case 'parallelstage':
    case 'podset':
      return BODY.has(childType);
    case 'bodytube':
      return (
        childType === 'podset' || childType === 'parallelstage' || INTERNAL.has(childType) || ON_BODY.has(childType)
      );
    // Transition.isCompatible (inherited by NoseCone).
    case 'transition':
    case 'nosecone':
      return INTERNAL.has(childType) || childType === 'freeformfinset';
    case 'innertube':
    case 'tubecoupler':
    case 'masscomponent':
      return INTERNAL.has(childType);
    default:
      return false;
  }
}

export function allowedChildren(parentType: string | undefined): ComponentType[] {
  const parent = parentType ?? 'stage';
  return ALL_TYPES.filter((type) => canHost(parent, type));
}

const CATALOG_TYPES: ReadonlySet<string> = new Set([
  'nosecone',
  'bodytube',
  'transition',
  'innertube',
  'tubecoupler',
  'centeringring',
  'bulkhead',
  'engineblock',
  'launchlug',
  'parachute',
  'streamer',
  'railbutton',
]);
export function hasCatalog(type: string): boolean {
  return CATALOG_TYPES.has(type);
}

const MATERIAL_TYPES: ReadonlySet<string> = new Set([
  'nosecone',
  'bodytube',
  'transition',
  // Not 'fairing': `writeFairing` has no <material>, so a material would be lost.
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
  'tubefinset',
  'innertube',
  'tubecoupler',
  'centeringring',
  'bulkhead',
  'engineblock',
  'launchlug',
  'railbutton',
]);
export function hasMaterial(type: string): boolean {
  return MATERIAL_TYPES.has(type);
}

export function isRecoveryDevice(type: string): boolean {
  return type === 'parachute' || type === 'streamer';
}

/** A user-saved part gets no link: it would claim a manufacturer's part number. */
export function presetRef(p: Component): Partial<ComponentNode> {
  if (p.custom || !p.partNo) return { preset: undefined };
  return {
    preset: presetLink(p.type, p.mfr, p.partNo, (p as { digest?: string }).digest),
  };
}

/** The digest is omitted when empty: the desktop warns on a link with an empty checksum. */
export function presetLink(type: string, manufacturer: string, partNo: string, digest: string | undefined) {
  return { type, manufacturer, partNo, ...(digest ? { digest } : {}) };
}

/** Stating a dimension clears its auto flag, or `syncAutoRadii` would overwrite the picked part. */
const AUTO_FLAG_OF: Record<string, string> = {
  outerRadius: 'outerRadiusAuto',
  innerRadius: 'innerRadiusAuto',
  foreRadius: 'foreRadiusAuto',
  aftRadius: 'aftRadiusAuto',
  radius: 'radiusAuto',
};

function pinStated(patch: Partial<ComponentNode>): Partial<ComponentNode> {
  const out: Record<string, unknown> = { ...patch };
  for (const [dim, flag] of Object.entries(AUTO_FLAG_OF)) {
    if (out[dim] !== undefined && out[flag] === undefined) out[flag] = false;
  }
  return out;
}

export function catalogPatch(p: Component, node?: ComponentNode): Partial<ComponentNode> {
  return pinStated(statedPatch(p, node));
}

/** A solid part's "wall" is its whole radius and would keep the new cone solid. */
function hollowWall(node: ComponentNode | undefined, radius: number): Partial<ComponentNode> {
  const n = node as Record<string, unknown> | undefined;
  const wall = typeof n?.['thickness'] === 'number' ? n['thickness'] : null;
  const wasSolid = n?.['filled'] === true || wall == null || wall >= radius;
  return wasSolid ? { thickness: KERNEL_DEFAULTS.nosecone.thickness } : {};
}

/**
 * `Transition.loadFromPreset`. A part with no prior shoulder is set uncapped: `ComponentPresetFactory`
 * spreads a stated mass over the uncapped volume, so a cap would fly heavy.
 */
function presetShoulder(
  side: '' | 'fore' | 'aft',
  diameter: number | null,
  length: number | null,
  end: number,
  p: { filled?: boolean; thickness?: number | null },
  node: ComponentNode | undefined,
): Partial<ComponentNode> {
  if (diameter == null) return {};
  const key = (k: string) => (side ? `${side}${k}` : k.charAt(0).toLowerCase() + k.slice(1));
  const radius = Math.min(diameter / 2, end);
  const wall = p.filled ? diameter / 2 : p.thickness;
  const hadShoulder = node !== undefined && !isZero(num(node, key('ShoulderLength'), 0));
  return {
    [key('ShoulderAuto')]: false,
    [key('ShoulderRadius')]: radius,
    ...(hadShoulder ? {} : { [key('ShoulderCapped')]: false }),
    ...(length == null ? {} : { [key('ShoulderLength')]: length }),
    ...(wall == null ? {} : { [key('ShoulderThickness')]: wall }),
  };
}

const DEFAULT_LINE_COUNT = 6;

/** `Parachute.loadFromPreset`: unstated values reset to a new parachute's, not the replaced part's. */
function parachutePatch(p: ParachuteComponent): Partial<ComponentNode> {
  // Only values above 0 count as stated (Parachute.java:233-282).
  const stated = (v: number | null | undefined): number | null => (typeof v === 'number' && v > 0 ? v : null);
  const packedLength = stated(p.packedLength);
  const packedDiameter = stated(p.packedDiameter);
  const cd = stated(p.cd);
  return {
    name: p.desc ? p.desc : undefined,
    diameter: p.diameter,
    cd: cd ?? KERNEL_DEFAULTS.parachute.cd,
    cdAuto: cd == null,
    lineCount: stated(p.lineCount) ?? DEFAULT_LINE_COUNT,
    lineLength: stated(p.lineLength) ?? KERNEL_DEFAULTS.parachute.lineLength,
    lineLengthAuto: false,
    surfaceMaterialName: p.material ?? KERNEL_MATERIALS.surface.name,
    surfaceDensity: p.materialDensity ?? KERNEL_MATERIALS.surface.density,
    lineMaterialName: p.lineMaterial ?? KERNEL_MATERIALS.line.name,
    lineDensity: p.lineMaterialDensity ?? KERNEL_MATERIALS.line.density,
    ...(packedLength != null ? { length: packedLength } : {}),
    ...(packedDiameter != null ? { radius: packedDiameter / 2, radiusAuto: packedLength != null } : {}),
    overrideMass: p.mass != null && p.mass > 0 ? p.mass : undefined,
  };
}

type Stated<T extends Component['type']> = Extract<Component, { type: T }>;

function statedMaterial(p: Component) {
  return 'materialDensity' in p && p.materialDensity
    ? { density: p.materialDensity, materialName: (p as { material?: string }).material }
    : {};
}

function nosePatch(p: Stated<'nosecone'>, node?: ComponentNode): Partial<ComponentNode> {
  const radius = p.outerDiameter / 2;
  // A stated mass without a wall was spread over DEFAULT_THICKNESS (NoseCone.loadFromPreset).
  const wall = p.filled
    ? { thickness: radius }
    : p.thickness != null
      ? { thickness: p.thickness }
      : p.mass != null
        ? { thickness: KERNEL_DEFAULTS.nosecone.thickness }
        : hollowWall(node, radius);
  return {
    ...shapeChange('nosecone', p.shape),
    length: p.length,
    aftRadius: radius,
    // Set both ways: the kernel reads solidness from this flag, not the thickness.
    filled: !!p.filled,
    ...wall,
    ...presetShoulder('', p.shoulderDiameter ?? null, p.shoulderLength ?? null, radius, p, node),
    ...statedMaterial(p),
  };
}

function ringPatch(p: TubeComponent, node?: ComponentNode): Partial<ComponentNode> {
  const outerRadius = p.outerDiameter / 2;
  const kept = typeof node?.['innerRadius'] === 'number' ? node['innerRadius'] : null;
  const bore = p.innerDiameter != null ? p.innerDiameter / 2 : kept != null && kept > outerRadius ? kept : null;
  return {
    outerRadius,
    ...(bore != null
      ? { innerRadius: clampToBounds({ outerRadius } as unknown as ComponentNode, RING_BOUNDS.innerRadius, bore) }
      : {}),
    innerRadiusAuto: false,
    length: p.length,
    ...statedMaterial(p),
  };
}

function transitionPatch(p: Stated<'transition'>, node?: ComponentNode): Partial<ComponentNode> {
  const shoulder = (side: 'fore' | 'aft', diameter: number | null, length: number | null) =>
    presetShoulder(side, diameter, length, (side === 'fore' ? p.foreOuterDiameter : p.aftOuterDiameter) / 2, p, node);
  return {
    ...shapeChange('transition', p.shape),
    length: p.length,
    foreRadius: p.foreOuterDiameter / 2,
    aftRadius: p.aftOuterDiameter / 2,
    filled: !!p.filled,
    ...(p.thickness != null && !p.filled ? { thickness: p.thickness } : {}),
    ...shoulder('fore', p.foreShoulderDiameter, p.foreShoulderLength),
    ...shoulder('aft', p.aftShoulderDiameter, p.aftShoulderLength),
    ...statedMaterial(p),
  };
}

function railButtonPatch(p: Stated<'railbutton'>): Partial<ComponentNode> {
  return {
    outerDiameter: p.outerDiameter,
    height: p.height,
    ...(p.innerDiameter != null ? { innerDiameter: p.innerDiameter } : {}),
    ...(p.baseHeight != null ? { baseHeight: p.baseHeight } : {}),
    ...(p.flangeHeight != null ? { flangeHeight: p.flangeHeight } : {}),
    ...(p.screwHeight != null ? { screwHeight: p.screwHeight } : {}),
    ...(p.mass != null ? { overrideMass: p.mass } : {}),
    ...(p.cd != null && p.cd > 0 ? { overrideCD: p.cd } : {}),
    ...statedMaterial(p),
  };
}

function statedPatch(p: Component, node?: ComponentNode): Partial<ComponentNode> {
  // Storage may hold anything, so a saved part goes through repairNode.
  // Pinned here too, for parts saved before the save pinned them.
  if (p.custom && p.patch) return pinSavedSize(presetNode(repairNode(p.patch as ComponentNode).node), p.type);
  const mat = statedMaterial(p);
  switch (p.type) {
    case 'nosecone':
      return nosePatch(p, node);
    // A stated inner diameter of 0 is a solid part (balsa nose blocks), not a missing one.
    case 'bodytube':
    case 'tubecoupler':
    case 'engineblock':
    case 'launchlug':
      return {
        outerRadius: p.outerDiameter / 2,
        length: p.length,
        ...(p.innerDiameter != null ? { thickness: Math.max(0.0001, (p.outerDiameter - p.innerDiameter) / 2) } : {}),
        // BodyTube.loadFromPreset always clears filled; a catalog tube is hollow.
        ...(p.type === 'bodytube' ? { filled: false } : {}),
        ...mat,
      };
    // Clamped: a few catalog rows state an inner diameter above the outer.
    case 'centeringring':
      return ringPatch(p, node);
    case 'bulkhead':
      return { outerRadius: p.outerDiameter / 2, length: p.length, ...mat };
    case 'parachute':
      return parachutePatch(p);
    case 'transition':
      return transitionPatch(p, node);
    case 'railbutton':
      return railButtonPatch(p);
    // Streamer.loadFromPreset sets packed length to the strip width.
    case 'streamer':
      return {
        stripLength: p.stripLength,
        stripWidth: p.stripWidth,
        length: p.stripWidth,
        ...(p.materialDensity
          ? { surfaceMaterialName: p.material, surfaceDensity: p.materialDensity }
          : { surfaceMaterialName: KERNEL_MATERIALS.surface.name, surfaceDensity: KERNEL_MATERIALS.surface.density }),
        cdAuto: true,
      };
  }
}

export function siblingIndex(tree: RocketTree, id: string): { index: number; count: number } | null {
  const hit = findSiblings(tree.components, id);
  return hit ? { index: hit.index, count: hit.siblings.length } : null;
}

export function findParent(tree: RocketTree, id: string): ComponentNode | null {
  return findWithParent(tree.components, id)?.parent ?? null;
}

/** Returns the same tree when the move is impossible, so the caller can tell. */
export function moveNode(tree: RocketTree, id: string, dir: -1 | 1): RocketTree {
  const at = findSiblings(tree.components, id);
  if (!at || at.index + dir < 0 || at.index + dir >= at.siblings.length) return tree;
  return editCopy(tree, (next) => {
    const { siblings, index } = must(findSiblings(next.components, id), 'moved part');
    siblings.splice(index + dir, 0, ...siblings.splice(index, 1));
  });
}

/**
 * Desktop Java constructor values (SI), held to the kernel by `newParts.kernel.test.ts`.
 * App-only seeds: `shoulderAuto` flags, the inner tube mount and overhang, recovery `deployEvent: 'apogee'`.
 *
 * One `switch` on purpose: it is a table of default values, one case per part, and splitting it would only scatter them.
 */
// eslint-disable-next-line max-lines-per-function -- a table of defaults; see the comment above
export function defaultNode(type: ComponentType): ComponentNode & { id: string } {
  const id = newId();
  switch (type) {
    case 'stage':
      return { type, id, separationEvent: 'ejection', separationDelay: 0 };
    // `shoulderAuto` only on new parts, so a loaded design never grows a shoulder.
    case 'nosecone':
      return { type, id, shape: 'ogive', length: 0.15, aftRadius: 0.025, thickness: 0.002, shoulderAuto: true };
    case 'bodytube':
      return { type, id, length: 0.2, outerRadius: 0.025, outerRadiusAuto: true, thickness: 0.002 };
    case 'transition':
      return {
        type,
        id,
        shape: 'conical',
        length: 0.075,
        foreRadius: 0.025,
        foreRadiusAuto: true,
        aftRadius: 0.025,
        aftRadiusAuto: true,
        thickness: 0.002,
        foreShoulderAuto: true,
        aftShoulderAuto: true,
      };
    case 'trapezoidfinset':
      return {
        type,
        id,
        finCount: 3,
        rootChord: 0.05,
        tipChord: 0.05,
        sweep: 0.025,
        height: 0.03,
        thickness: 0.003,
        position: { method: 'bottom', offset: 0 },
      };
    case 'ellipticalfinset':
      return {
        type,
        id,
        finCount: 3,
        rootChord: 0.05,
        height: 0.05,
        thickness: 0.003,
        position: { method: 'bottom', offset: 0 },
      };
    case 'freeformfinset':
      return {
        type,
        id,
        finCount: 3,
        thickness: 0.003,
        points: [
          [0, 0],
          [0.025, 0.05],
          [0.075, 0.05],
          [0.05, 0],
        ],
        position: { method: 'bottom', offset: 0 },
      };
    // No wall stored: the kernel's is NaN, which takes the body's (TubeFinSet.java:56-58).
    case 'tubefinset':
      return {
        type,
        id,
        finCount: 6,
        length: 0.1,
        outerRadiusAuto: true,
        position: { method: 'bottom', offset: 0 },
      };
    // The motor picker's fit filter assumes this overhang.
    case 'innertube':
      return {
        type,
        id,
        motorMount: true,
        ...KERNEL_DEFAULTS.innertube,
        motorOverhang: 0.00635,
        position: { method: 'bottom', offset: 0 },
      };
    case 'tubecoupler':
      return {
        type,
        id,
        length: 0.06,
        outerRadius: 0.0125,
        outerRadiusAuto: true,
        thickness: 0.002,
        position: { method: 'bottom', offset: 0 },
      };
    case 'centeringring':
      return {
        type,
        id,
        length: 0.002,
        outerRadius: 0.0125,
        outerRadiusAuto: true,
        innerRadius: 0.0092,
        innerRadiusAuto: true,
        position: { method: 'bottom', offset: 0 },
      };
    case 'bulkhead':
      return {
        type,
        id,
        length: 0.002,
        outerRadius: 0.0125,
        outerRadiusAuto: true,
        position: { method: 'bottom', offset: 0 },
      };
    case 'engineblock':
      return {
        type,
        id,
        length: 0.005,
        outerRadius: 0.0092,
        outerRadiusAuto: true,
        thickness: 0.005,
        position: { method: 'bottom', offset: 0 },
      };
    case 'launchlug':
      return {
        type,
        id,
        length: 0.03,
        outerRadius: 0.005,
        thickness: 0.001,
        angleOffset: Math.PI,
        position: { method: 'middle', offset: 0 },
      };
    // The bridge treats a stated `cd` or `lineLength` as the user's unless flagged auto.
    case 'parachute':
      return {
        type,
        id,
        diameter: KERNEL_DEFAULTS.parachute.diameter,
        cd: KERNEL_DEFAULTS.parachute.cd,
        cdAuto: true,
        lineCount: KERNEL_DEFAULTS.parachute.lineCount,
        lineLength: 0.45,
        lineLengthAuto: true,
        drogue: false,
        deployEvent: 'apogee',
        deployAltitude: 200,
        deployDelay: 0,
        position: { method: 'top', offset: 0 },
      };
    case 'streamer':
      return {
        type,
        id,
        stripLength: 0.5,
        stripWidth: 0.05,
        cdAuto: true,
        drogue: false,
        deployEvent: 'apogee',
        deployAltitude: 200,
        deployDelay: 0,
        position: { method: 'top', offset: 0 },
      };
    case 'masscomponent':
      return {
        type,
        id,
        mass: KERNEL_DEFAULTS.masscomponent.mass,
        length: KERNEL_DEFAULTS.masscomponent.length,
        radius: KERNEL_DEFAULTS.masscomponent.radius,
        position: { method: 'top', offset: 0 },
      };
    case 'railbutton':
      return {
        type,
        id,
        outerDiameter: COMPONENT_DEFAULTS.railbutton.outerDiameter,
        innerDiameter: COMPONENT_DEFAULTS.railbutton.innerDiameter,
        height: COMPONENT_DEFAULTS.railbutton.height,
        baseHeight: COMPONENT_DEFAULTS.railbutton.baseHeight,
        flangeHeight: COMPONENT_DEFAULTS.railbutton.flangeHeight,
        screwHeight: COMPONENT_DEFAULTS.railbutton.screwHeight,
        angleOffset: Math.PI,
        position: { method: 'middle', offset: 0 },
      };
    case 'shockcord':
      return {
        type,
        id,
        cordLength: KERNEL_DEFAULTS.shockcord.cordLength,
        cordLengthAuto: true,
        length: KERNEL_DEFAULTS.shockcord.length,
        position: { method: 'top', offset: 0 },
      };
    case 'podset':
      return {
        type,
        id,
        instanceCount: KERNEL_DEFAULTS.podset.instanceCount,
        radiusOffset: 0,
        radiusMethod: 'relative',
        angleOffset: 0,
        position: { method: 'bottom', offset: 0 },
      };
    case 'parallelstage': {
      const body = defaultNode('bodytube');
      body.length = 0.2;
      body.outerRadius = 0.009;
      // Fixed: a lone automatic tube resolves to the kernel's 25 mm.
      body.outerRadiusAuto = false;
      return {
        type,
        id,
        instanceCount: KERNEL_DEFAULTS.parallelstage.instanceCount,
        radiusOffset: 0,
        radiusMethod: 'relative',
        angleOffset: 0,
        position: { method: 'bottom', offset: 0 },
        children: [body],
      };
    }
    default:
      return { type, id };
  }
}

export function recoveryDevices(tree: RocketTree, stageId: string): ComponentNode[] {
  const stage = findNode(tree, stageId);
  if (!stage?.children) return [];
  return collectNodes(stage.children, (n) => isRecoveryDevice(n.type));
}

/** Returns the same tree when nothing changes, so no empty undo step is recorded. */
export function setStageDrogue(tree: RocketTree, stageId: string, deviceId: string | null): RocketTree {
  const wanted = new Map<string, boolean>();
  for (const d of recoveryDevices(tree, stageId)) {
    wanted.set(d.id as string, d.id === deviceId);
  }
  let next = tree;
  for (const [id, on] of wanted) {
    const node = findNode(next, id);
    if (!node) continue;
    const dropMain = node[MAIN_DEVICE_KEY] === true && (deviceId === null || on);
    if ((node['drogue'] === true) === on && !dropMain) continue;
    // `undefined`, not `false`, so no `<isdrogue>` is written, as the desktop omits it.
    next = updateNode(next, id, {
      drogue: on ? true : undefined,
      ...(dropMain ? { [MAIN_DEVICE_KEY]: undefined } : {}),
    });
  }
  return next;
}

/** App-only (OpenRocket has only the drogue flag); it flies nothing. */
export const MAIN_DEVICE_KEY = 'mainDevice';

export function stageMain(devices: readonly ComponentNode[]): ComponentNode | undefined {
  if (!devices.some((d) => d['drogue'] === true)) return undefined;
  const others = devices.filter((d) => d['drogue'] !== true);
  return others.find((d) => d[MAIN_DEVICE_KEY] === true) ?? others[0];
}

export function setStageMain(tree: RocketTree, stageId: string, deviceId: string): RocketTree {
  let next = tree;
  for (const d of recoveryDevices(tree, stageId)) {
    const on = d.id === deviceId && d['drogue'] !== true;
    if ((d[MAIN_DEVICE_KEY] === true) === on) continue;
    next = updateNode(next, d.id as string, { [MAIN_DEVICE_KEY]: on ? true : undefined });
  }
  return next;
}

export function isFirstStage(tree: RocketTree, id: string): boolean {
  const stages = stageNodes(tree);
  return stages.length > 0 && stages[0]!.id === id;
}

export function addStage(tree: RocketTree): { tree: RocketTree; id: string } {
  const node = defaultNode('stage');
  const id = node.id;
  const count = stageNodes(tree).length;
  node.name = defaultStageName(count);
  return { tree: editCopy(tree, (next) => next.components.push(node)), id };
}

export function addPart(
  tree: RocketTree,
  type: ComponentType,
  selectedId: string | null,
  seed: Partial<ComponentNode> = {},
): { tree: RocketTree; id: string } {
  const base = defaultNode(type);
  const node = { ...base, ...seed };
  const id = node.id ?? base.id;
  const stageId = stageNodes(tree)[0]?.id;
  const host = selectedId
    ? (lineageOf(tree.components, selectedId).find((n) => allowedChildren(n.type).includes(type)) ?? null)
    : null;
  if (host?.id) return { tree: addChild(tree, host.id, node), id };
  if (!stageId) {
    return { tree: editCopy(tree, (next) => next.components.push(node)), id };
  }
  if (!allowedChildren('stage').includes(type)) {
    throw new KeyedError('errors.design.cannotAdd', { part: { key: `part.${type}` } });
  }
  return { tree: addChild(tree, stageId, node), id };
}
