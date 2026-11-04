import type { ComponentNode } from '../../engine/openRocketEngine';
import { KERNEL_MATERIALS } from '../../tree/kernelDefaults';
import { COMPONENT_DEFAULTS } from './componentDefaults';
import { isMaterialType, type MaterialType } from '../materials/materialTypes';

/** Keep this a leaf module: `services/materials/materials` pulls in fetch and IndexedDB. */

/** Only bulk has `group`: the `.ork` writer emits it for bulk only. */
export const MATERIAL_KEYS: Readonly<Record<MaterialType, MaterialKeys>> = {
  bulk: { name: 'materialName', density: 'density', group: 'materialGroup' },
  surface: { name: 'surfaceMaterialName', density: 'surfaceDensity' },
  line: { name: 'lineMaterialName', density: 'lineDensity' },
};

export interface MaterialKeys {
  name: string;
  density: string;
  group?: string;
}

export const FILLET_MATERIAL_KEYS: MaterialKeys = {
  name: 'filletMaterialName',
  density: 'filletDensity',
  group: 'filletMaterialGroup',
};

export interface StatedMaterial {
  name: string;
  density: number;
  group?: string;
}

/** Matches `ComponentFactory`; blank name becomes `custom` since desktop refuses a nameless material. */
export function statedMaterial(node: ComponentNode, keys: MaterialKeys, positive: boolean): StatedMaterial | null {
  const density = node[keys.density];
  if (typeof density !== 'number' || !Number.isFinite(density) || (positive && !(density > 0))) return null;
  const raw = node[keys.name];
  const name = typeof raw === 'string' && raw.trim() ? raw : 'custom';
  const group = keys.group ? node[keys.group] : undefined;
  return { name, density, ...(typeof group === 'string' && group ? { group } : {}) };
}

export const MATERIAL_SLOTS: readonly { part: string; material: MaterialType }[] = [
  { part: 'nosecone', material: 'bulk' },
  { part: 'bodytube', material: 'bulk' },
  { part: 'transition', material: 'bulk' },
  { part: 'trapezoidfinset', material: 'bulk' },
  { part: 'ellipticalfinset', material: 'bulk' },
  { part: 'freeformfinset', material: 'bulk' },
  { part: 'tubefinset', material: 'bulk' },
  { part: 'innertube', material: 'bulk' },
  { part: 'tubecoupler', material: 'bulk' },
  { part: 'centeringring', material: 'bulk' },
  { part: 'bulkhead', material: 'bulk' },
  { part: 'engineblock', material: 'bulk' },
  { part: 'launchlug', material: 'bulk' },
  { part: 'railbutton', material: 'bulk' },
  { part: 'parachute', material: 'surface' },
  { part: 'parachute', material: 'line' },
  { part: 'streamer', material: 'surface' },
  { part: 'shockcord', material: 'line' },
];

export const defaultMaterialKey = (partType: string, materialType: MaterialType): string =>
  `${partType}:${materialType}`;

export function parseDefaultMaterialKey(key: string): { part: string; material: MaterialType } | null {
  const [part, material, ...rest] = key.split(':');
  if (rest.length || !part || !/^[a-z]+$/.test(part) || !isMaterialType(material)) return null;
  return { part, material };
}

/** `RailButton()` sets Delrin, not the preference default (rocketcomponent/RailButton.java). */
const KERNEL_PART_MATERIALS: Record<
  string,
  Partial<Record<MaterialType, { name: string; density: number; group: string }>>
> = {
  railbutton: {
    bulk: {
      name: COMPONENT_DEFAULTS.railbutton.materialName,
      density: COMPONENT_DEFAULTS.railbutton.materialDensity,
      group: COMPONENT_DEFAULTS.railbutton.materialGroup,
    },
  },
};

export function kernelPartMaterial(
  partType: string,
  kind: MaterialType,
): { name: string; density: number; group: string } | undefined {
  return KERNEL_PART_MATERIALS[partType]?.[kind];
}

export function defaultMaterialPatch(
  partType: string,
  defaults: Record<string, { name: string; density: number; group?: string }>,
): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  for (const { part, material } of MATERIAL_SLOTS) {
    if (part !== partType) continue;
    const keys = MATERIAL_KEYS[material];
    const chosen = defaults[defaultMaterialKey(partType, material)];
    const kernel = KERNEL_PART_MATERIALS[partType]?.[material] ?? KERNEL_MATERIALS[material];
    patch[keys.name] = chosen ? chosen.name : kernel.name;
    patch[keys.density] = chosen ? chosen.density : kernel.density;
    const group = chosen ? chosen.group : kernel.group;
    if (keys.group && group) patch[keys.group] = group;
  }
  return patch;
}
