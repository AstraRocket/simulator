import type { Quantity } from '../../prefs/units';
import type { MaterialType } from '../../services/materials/materialTypes';

/**
 * Each material kind measures a different density, so each has its own
 * preference group: bulk stock by volume, fabric by area, cord by length.
 * The catalog and the engine hold all three in SI (kg/m³, kg/m², kg/m).
 */
export const QUANTITY: Record<MaterialType, Quantity> = {
  bulk: 'density',
  surface: 'surfaceDensity',
  line: 'lineDensity',
};

/**
 * The add form's density box names the quantity its material type is measured
 * in, with no unit of its own: the unit symbol after it is the one the box reads.
 */
export const DENSITY_LABEL: Record<MaterialType, string> = {
  bulk: 'material.densityBulk',
  surface: 'material.densitySurface',
  line: 'material.densityLine',
};

/**
 * A material group as the reader's language names it, as desktop translates
 * `MaterialGroup`. The stored value stays the catalog's English name; a group
 * the locale has no name for, such as one a user typed, shows as it is.
 */
export function groupLabel(t: (key: string, opts?: Record<string, unknown>) => string, group: string): string {
  return t(`material.groups.${group}`, { defaultValue: group });
}
