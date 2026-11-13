import { isMaterialCatalog, type Material, type MaterialType } from './materialTypes';
import { getMaterialStore } from './materialStore';
import { fetchCatalog } from '../app/remoteData';
import { KeyedError } from '../../i18n/keyedError';
import { changeSignal } from '../app/changeSignal';

function loadBuiltins(): Promise<Material[]> {
  return fetchCatalog<Material[]>('materials', isMaterialCatalog);
}

export async function builtinsForType(type: MaterialType): Promise<Material[]> {
  return (await loadBuiltins()).filter((m) => m.type === type);
}

function loadCustom(): Promise<Material[]> {
  return getMaterialStore().list();
}

// Upstream's own group name.
export const DEFAULT_CUSTOM_GROUP = 'Other';

// Read but never written: such entries are re-homed to the default group.
const LEGACY_CUSTOM_GROUP = 'Custom';

export function groupsOf(materials: Material[]): string[] {
  return [...new Set([...materials.map((m) => m.group), DEFAULT_CUSTOM_GROUP])];
}

export function checkedMaterialName(name: string, density: number): string {
  const trimmed = name.trim();
  if (!trimmed) throw new KeyedError('errors.material.nameRequired');
  if (!Number.isFinite(density) || density <= 0) throw new KeyedError('errors.material.densityPositive');
  return trimmed;
}

// `group` is only a hint: a name shared with a built-in takes that built-in's group (mergeCustom).
export async function addCustom(
  name: string,
  type: MaterialType,
  density: number,
  group: string = DEFAULT_CUSTOM_GROUP,
  shearModulus?: number,
): Promise<Material[]> {
  const trimmed = checkedMaterialName(name, density);
  await getMaterialStore().add({
    name: trimmed,
    type,
    density,
    ...(shearModulus ? { shearModulus } : {}),
    group: group || DEFAULT_CUSTOM_GROUP,
    custom: true,
  });
  bump();
  return getMaterialStore().list();
}

export async function removeCustom(name: string, type: MaterialType): Promise<Material[]> {
  await getMaterialStore().remove(name, type);
  bump();
  return getMaterialStore().list();
}

// Entries are already checked by the caller.
export async function addCustomMaterials(materials: readonly Material[]): Promise<void> {
  try {
    for (const m of materials) await getMaterialStore().add({ ...m, custom: true });
  } finally {
    bump();
  }
}

export function listCustom(): Promise<Material[]> {
  return loadCustom();
}

const signal = changeSignal();
const bump = signal.bump;

export const customMaterialsVersion = signal.version;

export const onCustomMaterialsChanged = signal.subscribe;

// A custom material with a built-in's name replaces it in place, keeping the built-in's group.
export function mergeCustom(builtins: Material[], custom: Material[]): Material[] {
  const byName = new Map(custom.map((m) => [m.name, m]));
  const shadowed = new Set<string>();
  const out = builtins.map((b) => {
    const c = byName.get(b.name);
    if (!c) return b;
    shadowed.add(b.name);
    return { ...c, group: b.group };
  });

  for (const c of custom) {
    if (shadowed.has(c.name)) continue;
    const group = !c.group || c.group === LEGACY_CUSTOM_GROUP ? DEFAULT_CUSTOM_GROUP : c.group;
    const entry = { ...c, group };
    let at = -1;
    for (let i = 0; i < out.length; i++) if (out[i]!.group === group) at = i;
    if (at < 0) out.push(entry);
    else out.splice(at + 1, 0, entry);
  }
  return out;
}

export async function materialsForType(type: MaterialType): Promise<Material[]> {
  const [builtins, custom] = await Promise.all([builtinsForType(type), loadCustom()]);
  return mergeCustom(
    builtins,
    custom.filter((m) => m.type === type),
  );
}
