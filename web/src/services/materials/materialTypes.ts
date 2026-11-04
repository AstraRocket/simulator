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
  group: string;
  custom?: boolean;
}

// Read only by the drift gate (`engine-java/extract/extract.mjs --check`).
type MaterialKind = 'upstream' | 'adhesive' | 'corrected';

export interface MaterialRow {
  name: string;
  type: MaterialType;
  density: number;
  group: string;
  kind: MaterialKind;
}

const isRow = (v: unknown): v is MaterialRow => {
  const r = v as Partial<MaterialRow> | null;
  return (
    !!r &&
    typeof r.name === 'string' &&
    r.name.length > 0 &&
    isMaterialType(r.type) &&
    typeof r.density === 'number' &&
    Number.isFinite(r.density) &&
    r.density > 0 &&
    typeof r.group === 'string'
  );
};

export function isMaterialCatalog(v: unknown): v is MaterialRow[] {
  return Array.isArray(v) && v.length > 0 && v.every(isRow);
}
