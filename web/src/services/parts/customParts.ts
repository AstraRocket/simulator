import type { ComponentNode } from '../../engine/openRocketEngine';
import { catalogTypeFor, isComponentRow, type Component, type ComponentType, type PickerType } from './componentDb';
import { getPresetStore, type CustomPart } from './presetStore';
import { KeyedError } from '../../i18n/keyedError';
import { changeSignal } from '../app/changeSignal';
import { shortId } from '../app/uuid';

export const DEFAULT_CUSTOM_MFR = 'Custom';

/** `children`: the apply is a shallow merge, so they would replace the target's and keep their old ids. */
const NOT_SAVED: ReadonlySet<string> = new Set(['id', 'type', 'name', 'position', 'children']);

export function presetNode(node: Partial<ComponentNode>): Partial<ComponentNode> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (!NOT_SAVED.has(k) && v !== undefined) out[k] = v;
  return out;
}

function n(node: Partial<ComponentNode>, key: string): number | null {
  const v = node[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function dia(node: Partial<ComponentNode>, key: string): number | null {
  const r = n(node, key);
  return r === null ? null : r * 2;
}

/** The inverse of `treeEdit.catalogPatch`. */
// eslint-disable-next-line complexity -- a flat per-type list of fields
function rowGeometry(node: Partial<ComponentNode>, type: string): Record<string, unknown> | null {
  const material = typeof node.materialName === 'string' ? node.materialName : undefined;
  // 0, not null: the row schema requires a finite density; the node carries the real one.
  const materialDensity = n(node, 'density') ?? 0;
  const length = n(node, 'length');
  const outerDiameter = dia(node, 'outerRadius');
  const wall = n(node, 'thickness');

  switch (type) {
    case 'bodytube':
    case 'tubecoupler':
    case 'engineblock':
    case 'launchlug':
      if (outerDiameter === null || length === null) return null;
      return {
        type,
        material,
        materialDensity,
        outerDiameter,
        innerDiameter: wall === null ? null : Math.max(0, outerDiameter - 2 * wall),
        length,
      };
    case 'centeringring':
      if (outerDiameter === null || length === null) return null;
      return { type, material, materialDensity, outerDiameter, innerDiameter: dia(node, 'innerRadius'), length };
    case 'bulkhead':
      if (outerDiameter === null || length === null) return null;
      // The kernel's bulkhead is always a solid disc.
      return { type, material, materialDensity, outerDiameter, length, filled: true };
    case 'nosecone': {
      const od = dia(node, 'aftRadius');
      if (od === null || length === null || typeof node.shape !== 'string') return null;
      return {
        type,
        material,
        materialDensity,
        shape: node.shape,
        filled: node.filled === true,
        outerDiameter: od,
        length,
      };
    }
    case 'parachute': {
      const diameter = n(node, 'diameter');
      if (diameter === null) return null;
      return { type, diameter, cd: n(node, 'cd') };
    }
    case 'transition': {
      const fore = dia(node, 'foreRadius');
      const aft = dia(node, 'aftRadius');
      if (fore === null || aft === null || length === null || typeof node.shape !== 'string') return null;
      return {
        type,
        material,
        materialDensity,
        shape: node.shape,
        filled: node.filled === true,
        thickness: node.filled === true ? null : wall,
        length,
        foreOuterDiameter: fore,
        foreShoulderDiameter: dia(node, 'foreShoulderRadius'),
        foreShoulderLength: n(node, 'foreShoulderLength'),
        aftOuterDiameter: aft,
        aftShoulderDiameter: dia(node, 'aftShoulderRadius'),
        aftShoulderLength: n(node, 'aftShoulderLength'),
      };
    }
    case 'streamer': {
      const stripLength = n(node, 'stripLength');
      const stripWidth = n(node, 'stripWidth');
      if (stripLength === null || stripWidth === null) return null;
      return {
        type,
        material: typeof node.surfaceMaterialName === 'string' ? node.surfaceMaterialName : undefined,
        materialDensity: n(node, 'surfaceDensity') ?? 0,
        stripLength,
        stripWidth,
      };
    }
    case 'railbutton': {
      const od = n(node, 'outerDiameter');
      const height = n(node, 'height');
      if (od === null || height === null) return null;
      return {
        type,
        material,
        materialDensity,
        outerDiameter: od,
        innerDiameter: n(node, 'innerDiameter'),
        height,
        baseHeight: n(node, 'baseHeight'),
        flangeHeight: n(node, 'flangeHeight'),
        screwHeight: n(node, 'screwHeight'),
        cd: null,
      };
    }
    default:
      return null;
  }
}

/** Held to `isComponentRow`, so nothing reaches `catalogPatch` by a side door. */
export function customPartToRow(part: CustomPart): Component | null {
  const geometry = rowGeometry(part.node, part.type);
  if (!geometry) return null;
  const row = {
    ...geometry,
    mfr: part.mfr,
    partNo: part.partNo,
    desc: part.desc,
    id: part.id,
    custom: true,
    patch: part.node,
  };
  return isComponentRow(row) ? row : null;
}

const signal = changeSignal();
const bump = signal.bump;

export const savedPartsVersion = signal.version;

export const onSavedPartsChanged = signal.subscribe;

export async function saveCustomPart(node: ComponentNode, type: PickerType, meta: PartMeta): Promise<CustomPart> {
  const { mfr, partNo, desc } = cleanMeta(meta);
  const catalogType = catalogTypeFor(type);
  const existing = (await getPresetStore().list()).find(
    (p) => p.type === catalogType && p.mfr === mfr && p.partNo === partNo,
  );
  return write({
    id: existing?.id ?? newPartId(),
    type: catalogType,
    mfr,
    partNo,
    desc,
    node: presetNode(node),
  });
}

export interface PartMeta {
  mfr: string;
  partNo: string;
  desc: string;
}

function cleanMeta(meta: PartMeta): PartMeta {
  const partNo = meta.partNo.trim();
  if (!partNo) throw new KeyedError('errors.savedPart.partNoRequired');
  return { mfr: meta.mfr.trim() || DEFAULT_CUSTOM_MFR, partNo, desc: meta.desc.trim() };
}

function newPartId(): string {
  return shortId('custom:', 8, ':');
}

async function write(part: CustomPart): Promise<CustomPart> {
  if (!customPartToRow(part)) throw new KeyedError('errors.savedPart.missingDimensions');
  await getPresetStore().add(part);
  bump();
  return part;
}

/** Refuses a label another part of the same type uses, or the next save would merge them. */
export async function updateCustomPart(id: string, meta: PartMeta, node: Partial<ComponentNode>): Promise<CustomPart> {
  const clean = cleanMeta(meta);
  const saved = await getPresetStore().list();
  const current = saved.find((p) => p.id === id);
  if (!current) throw new KeyedError('errors.savedPart.gone');
  const clash = saved.some(
    (p) => p.id !== id && p.type === current.type && p.mfr === clean.mfr && p.partNo === clean.partNo,
  );
  if (clash) throw new KeyedError('errors.savedPart.nameTaken');
  return write({ ...current, ...clean, node });
}

export const savedPartKey = (p: Pick<CustomPart, 'type' | 'mfr' | 'partNo'>): string =>
  JSON.stringify([p.type, p.mfr, p.partNo]);

/** The caller must refuse unlistable parts first. */
export async function addSavedParts(parts: readonly CustomPart[]): Promise<number> {
  const stored = await getPresetStore().list();
  let replaced = 0;
  try {
    for (const part of parts) {
      const key = savedPartKey(part);
      const existing = stored.find((p) => savedPartKey(p) === key);
      if (existing) replaced++;
      await getPresetStore().add({ ...part, id: existing?.id ?? part.id });
    }
  } finally {
    bump();
  }
  return replaced;
}

export async function deleteCustomPart(id: string): Promise<void> {
  await getPresetStore().remove(id);
  bump();
}

export async function customRowsForType(type: ComponentType): Promise<Component[]> {
  const saved = await getPresetStore().list();
  return saved
    .filter((p) => p.type === type)
    .map(customPartToRow)
    .filter((r): r is Component => r !== null);
}

export interface SavedPartEntry {
  part: CustomPart;
  row: Component | null;
}

/** Keeps parts that no longer project, or they could never be deleted. */
export async function listSavedParts(): Promise<SavedPartEntry[]> {
  const saved = await getPresetStore().list();
  return saved.map((part) => ({ part, row: customPartToRow(part) }));
}
