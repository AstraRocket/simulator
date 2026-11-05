// Desktop's document material database (`DocumentPreferences.getDatabase(type)`), in `<docprefs><docmaterials>`.
import type { RocketTree } from '../../engine/openRocketEngine';
import { isMaterialType, type MaterialType } from './materialTypes';
import { mathEquals } from '../motors/mathEquals';

export interface DocumentMaterial {
  name: string;
  type: MaterialType;
  // SI: bulk kg/m^3, surface kg/m^2, line kg/m.
  density: number;
  group?: string;
}

export function isDocumentMaterial(v: unknown): v is DocumentMaterial {
  const m = v as DocumentMaterial | null;
  return (
    !!m &&
    typeof m.name === 'string' &&
    m.name.trim().length > 0 &&
    isMaterialType(m.type) &&
    typeof m.density === 'number' &&
    Number.isFinite(m.density) &&
    m.density > 0 &&
    (m.group === undefined || typeof m.group === 'string')
  );
}

export function documentMaterialsOf(
  tree: Pick<RocketTree, 'documentMaterials'>,
  type?: MaterialType,
): DocumentMaterial[] {
  const list = Array.isArray(tree.documentMaterials) ? tree.documentMaterials : [];
  return list.filter((m): m is DocumentMaterial => isDocumentMaterial(m) && (!type || m.type === type));
}

// As `Material.equals`: one name at two densities is two materials, as `Database.add` keeps both.
const sameDocumentMaterial = (a: DocumentMaterial, b: DocumentMaterial): boolean =>
  a.type === b.type && a.name === b.name && mathEquals(a.density, b.density);

export function withDocumentMaterial(list: DocumentMaterial[], m: DocumentMaterial): DocumentMaterial[] {
  return list.some((x) => sameDocumentMaterial(x, m)) ? list : [...list, m];
}

export function withoutDocumentMaterial(list: DocumentMaterial[], m: DocumentMaterial): DocumentMaterial[] {
  return list.filter((x) => !sameDocumentMaterial(x, m));
}

export function withDocumentMaterials<T extends RocketTree>(tree: T, list: DocumentMaterial[]): T {
  const { documentMaterials: _old, ...rest } = tree;
  return (list.length ? { ...rest, documentMaterials: list } : rest) as T;
}

// Desktop's database order (`Material.compareTo`).
export const byNameThenDensity = (a: DocumentMaterial, b: DocumentMaterial): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.density - b.density;
