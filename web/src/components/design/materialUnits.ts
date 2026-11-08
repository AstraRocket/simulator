import type { Quantity } from '../../prefs/units';
import type { MaterialType } from '../../services/materials/materialTypes';

/** Stored in SI (kg/m³, kg/m², kg/m). */
export const QUANTITY: Record<MaterialType, Quantity> = {
  bulk: 'density',
  surface: 'surfaceDensity',
  line: 'lineDensity',
};

export const DENSITY_LABEL: Record<MaterialType, string> = {
  bulk: 'material.densityBulk',
  surface: 'material.densitySurface',
  line: 'material.densityLine',
};

// The stored group stays English; only the label is translated.
export function groupLabel(t: (key: string, opts?: Record<string, unknown>) => string, group: string): string {
  return t(`material.groups.${group}`, { defaultValue: group });
}
