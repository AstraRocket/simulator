// The design's own materials: desktop's document material database
// (`DocumentPreferences.getDatabase(type)`), which a `.ork` carries in
// `<docprefs><docmaterials>`. Desktop's material box lists them beside the
// application database on every part of the design (`MaterialModel`), and a
// custom material defined without "Add material to application database" lands
// here rather than in the user's library.
import type { RocketTree } from '../../engine/openRocketEngine';
import { isMaterialType, type MaterialType } from './materialTypes';
import { mathEquals } from '../motors/mathEquals';

export interface DocumentMaterial {
  name: string;
  type: MaterialType;
  /** SI: bulk kg/m^3, surface kg/m^2, line kg/m. */
  density: number;
  /** Desktop's `MaterialGroup` database string, when known. */
  group?: string;
}

/**
 * A stored entry that is a usable material: a name, a known type and a density
 * greater than zero, the same rule the custom-material store applies. The tree
 * comes back out of browser storage and shared files, so every reader goes
 * through this rather than trusting the array.
 */
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

/** The design's usable document materials, optionally of one type. */
export function documentMaterialsOf(
  tree: Pick<RocketTree, 'documentMaterials'>,
  type?: MaterialType,
): DocumentMaterial[] {
  const list = Array.isArray(tree.documentMaterials) ? tree.documentMaterials : [];
  return list.filter((m): m is DocumentMaterial => isDocumentMaterial(m) && (!type || m.type === type));
}

/**
 * Desktop's identity for a material in a database: its type, name and density,
 * as `Material.equals` compares them (it also compares the group and shear
 * modulus, which nothing here edits). Two entries of one name at two densities
 * are two materials, as desktop's `Database.add` keeps both.
 */
const sameDocumentMaterial = (a: DocumentMaterial, b: DocumentMaterial): boolean =>
  a.type === b.type && a.name === b.name && mathEquals(a.density, b.density);

/** The list with `m` in it, or the same list when it already holds `m`. */
export function withDocumentMaterial(list: DocumentMaterial[], m: DocumentMaterial): DocumentMaterial[] {
  return list.some((x) => sameDocumentMaterial(x, m)) ? list : [...list, m];
}

/** The list without `m`. */
export function withoutDocumentMaterial(list: DocumentMaterial[], m: DocumentMaterial): DocumentMaterial[] {
  return list.filter((x) => !sameDocumentMaterial(x, m));
}

/** The tree with `list` as its own materials, and no key at all for an empty list. */
export function withDocumentMaterials<T extends RocketTree>(tree: T, list: DocumentMaterial[]): T {
  const { documentMaterials: _old, ...rest } = tree;
  return (list.length ? { ...rest, documentMaterials: list } : rest) as T;
}

/** In desktop's database order: by name, then by density (`Material.compareTo`). */
export const byNameThenDensity = (a: DocumentMaterial, b: DocumentMaterial): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.density - b.density;
