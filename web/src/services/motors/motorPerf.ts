import type { Quantity } from '../../prefs/units';
import type { CatalogMotor } from './motorDb';
import { G0, avgThrustOf, ispOf } from './motorMath';
import { CATALOG_TO_SI } from './catalogUnits';

// SI values, each read as the same-named column in `motorColumns.ts` so a filter and a sort agree.
export type PerfField = 'avgThrust' | 'maxThrust' | 'burn' | 'mass' | 'propWeight' | 'length' | 'isp' | 'twr';

export interface PerfDef {
  id: PerfField;
  /** i18n key. */
  label: string;
  /** Absent for seconds. */
  quantity?: Quantity;
  ratio?: boolean;
  /** SI. */
  value: (m: CatalogMotor) => number | undefined;
}

const scaled = (v: number | undefined): number | undefined => (v == null ? undefined : v * CATALOG_TO_SI);

export const PERF_FIELDS: readonly PerfDef[] = [
  { id: 'avgThrust', label: 'motorDlg.avgThrust', quantity: 'force', value: (m) => avgThrustOf(m) },
  { id: 'maxThrust', label: 'motorDlg.maxThrust', quantity: 'force', value: (m) => m.maxThrust },
  { id: 'burn', label: 'motorDlg.burnTime', value: (m) => m.burn },
  { id: 'mass', label: 'motorDlg.totalWeight', quantity: 'mass', value: (m) => scaled(m.mass) },
  { id: 'propWeight', label: 'motorDlg.propWeight', quantity: 'mass', value: (m) => scaled(m.propWeightG) },
  { id: 'length', label: 'dash.colLength', quantity: 'motorDimensions', value: (m) => scaled(m.length) },
  { id: 'isp', label: 'motorDlg.isp', value: (m) => ispOf(m) },
];

export interface Liftoff {
  /** kg. */
  dryKg: number;
  /** kg. */
  otherMotorsKg: number;
  count: number;
}

/** Only this mount's thrust counts, so a strap-on lit at liftoff reads low, the safe direction. */
export function liftoffTwr(m: CatalogMotor, l: Liftoff): number | undefined {
  const weight = (l.dryKg + l.otherMotorsKg + l.count * m.mass * CATALOG_TO_SI) * G0;
  return weight > 0 ? (l.count * avgThrustOf(m)) / weight : undefined;
}

export function twrField(l: Liftoff): PerfDef {
  return { id: 'twr', label: 'motorDlg.twr', ratio: true, value: (m) => liftoffTwr(m, l) };
}

/** SI; null leaves that end open. */
export type PerfRange = [min: number | null, max: number | null];

export type PerfRanges = Partial<Record<PerfField, PerfRange>>;

const isSet = (r: PerfRange | undefined): r is PerfRange => !!r && (r[0] != null || r[1] != null);

export function activePerfCount(ranges: PerfRanges, fields: readonly PerfDef[] = PERF_FIELDS): number {
  return fields.filter((f) => isSet(ranges[f.id])).length;
}

export function passesPerf(m: CatalogMotor, ranges: PerfRanges, fields: readonly PerfDef[] = PERF_FIELDS): boolean {
  for (const f of fields) {
    const r = ranges[f.id];
    if (!isSet(r)) continue;
    const v = f.value(m);
    if (v == null || !Number.isFinite(v)) return false;
    if (r[0] != null && v < r[0]) return false;
    if (r[1] != null && v > r[1]) return false;
  }
  return true;
}
