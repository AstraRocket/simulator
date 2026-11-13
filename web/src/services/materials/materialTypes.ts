// Types only, no data or I/O, so importing the shape does not pull in the catalog.

export const MATERIAL_TYPES = ['bulk', 'surface', 'line'] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const isMaterialType = (v: unknown): v is MaterialType => (MATERIAL_TYPES as readonly unknown[]).includes(v);

// Fillets only; no other group is filtered from the picker, matching OpenRocket.
export const ADHESIVE_GROUP = 'Adhesives';

export interface Material {
  name: string;
  type: MaterialType;
  // bulk: kg/m^3 · surface: kg/m^2 · line: kg/m
  density: number;
  // Pa: desktop's `inPlaneShearModulus`, 0 when unset. Bulk only.
  shearModulus?: number;
  group: string;
  custom?: boolean;
}

const isShearModulus = (v: unknown): boolean =>
  v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

// Read only by the drift gate (`engine-java/extract/extract.mjs --check`).
type MaterialKind = 'upstream' | 'adhesive' | 'corrected';

export interface MaterialRow {
  name: string;
  type: MaterialType;
  density: number;
  shearModulus?: number;
  group: string;
  kind: MaterialKind;
}

/**
 * A stored material record: a name that is not blank, a type, a density above 0 (zero gives a massless part,
 * negative drags the CG off the airframe) and a valid shear modulus; `group` is required where the source always has one.
 */
export function isMaterialFields(v: unknown, { groupRequired = false } = {}): boolean {
  const m = v as Partial<MaterialRow> | null;
  return (
    !!m &&
    typeof m.name === 'string' &&
    m.name.trim().length > 0 &&
    isMaterialType(m.type) &&
    typeof m.density === 'number' &&
    Number.isFinite(m.density) &&
    m.density > 0 &&
    isShearModulus(m.shearModulus) &&
    (typeof m.group === 'string' || (!groupRequired && m.group === undefined))
  );
}

const isRow = (v: unknown): v is MaterialRow => isMaterialFields(v, { groupRequired: true });

export function isMaterialCatalog(v: unknown): v is MaterialRow[] {
  return Array.isArray(v) && v.length > 0 && v.every(isRow);
}
