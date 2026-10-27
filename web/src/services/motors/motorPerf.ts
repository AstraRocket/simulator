import type { Quantity } from '../../prefs/units';
import type { CatalogMotor } from './motorDb';
import { G0, avgThrustOf, ispOf } from './motorMath';
import { CATALOG_TO_SI } from './catalogUnits';

/**
 * The performance figures a motor list can be narrowed by, beyond its class,
 * maker, bore and total impulse: how hard it pushes, for how long, and what it
 * weighs. thrustcurve.org's advanced search asks the same questions.
 *
 * Every value is in SI, the catalog's mm and g lifted on the way out, so a
 * bound typed in the user's unit compares without a second conversion. Each
 * figure is read the way the dashboard column of the same name reads it
 * (`motorColumns.ts`), so a filter and a sort can never disagree about a motor.
 */
export type PerfField = 'avgThrust' | 'maxThrust' | 'burn' | 'mass' | 'propWeight' | 'length' | 'isp' | 'twr';

export interface PerfDef {
  id: PerfField;
  /** i18n key of the label. */
  label: string;
  /** The unit group the bounds are typed in; absent for seconds, which have one unit. */
  quantity?: Quantity;
  /** A plain ratio with no unit at all (thrust-to-weight), rather than seconds. */
  ratio?: boolean;
  /** The motor's figure in SI, or undefined when the catalog does not state it. */
  value: (m: CatalogMotor) => number | undefined;
}

const scaled = (v: number | undefined): number | undefined => (v == null ? undefined : v * CATALOG_TO_SI);

/** In the order the filter panel lists them: thrust, then time, then the motor itself, then efficiency. */
export const PERF_FIELDS: readonly PerfDef[] = [
  { id: 'avgThrust', label: 'motorDlg.avgThrust', quantity: 'force', value: (m) => avgThrustOf(m) },
  { id: 'maxThrust', label: 'motorDlg.maxThrust', quantity: 'force', value: (m) => m.maxThrust },
  { id: 'burn', label: 'motorDlg.burnTime', value: (m) => m.burn },
  { id: 'mass', label: 'motorDlg.totalWeight', quantity: 'mass', value: (m) => scaled(m.mass) },
  { id: 'propWeight', label: 'motorDlg.propWeight', quantity: 'mass', value: (m) => scaled(m.propWeightG) },
  { id: 'length', label: 'dash.colLength', quantity: 'motorDimensions', value: (m) => scaled(m.length) },
  // Specific impulse, estimated from total impulse over propellant weight as the
  // dashboard column is; in seconds, which have one unit.
  { id: 'isp', label: 'motorDlg.isp', value: (m) => ispOf(m) },
];

/**
 * What a candidate motor lifts besides itself, for its thrust-to-weight: the
 * airframe with no motors (the kernel's `massEmpty`), the motors already in the
 * other mounts, and how many of the candidate the mount takes (a cluster, or a
 * mount inside pods).
 */
export interface Liftoff {
  /** kg */
  dryKg: number;
  /** The other mounts' motors at ignition, kg. */
  otherMotorsKg: number;
  /** Candidate motors flown at once in this mount. */
  count: number;
}

/**
 * Average thrust over liftoff weight with this motor in the mount, the figure
 * the usual 5 : 1 rule is stated in, on the catalog's average thrust: the figure
 * the Avg. thrust filter and column read. Ratio arithmetic on the engine's dry
 * mass and catalog figures, not a flight. Only this
 * mount's thrust counts, so a strap-on lit at liftoff makes it read low, which
 * is the safe direction for a minimum. After a flight the guide shows the
 * kernel's own figure at rail exit instead.
 */
export function liftoffTwr(m: CatalogMotor, l: Liftoff): number | undefined {
  const weight = (l.dryKg + l.otherMotorsKg + l.count * m.mass * CATALOG_TO_SI) * G0;
  return weight > 0 ? (l.count * avgThrustOf(m)) / weight : undefined;
}

/** The thrust-to-weight filter field, for a list that has a rocket to lift. */
export function twrField(l: Liftoff): PerfDef {
  return { id: 'twr', label: 'motorDlg.twr', ratio: true, value: (m) => liftoffTwr(m, l) };
}

/** One field's bounds, SI, either end open (null). */
export type PerfRange = [min: number | null, max: number | null];

export type PerfRanges = Partial<Record<PerfField, PerfRange>>;

const isSet = (r: PerfRange | undefined): r is PerfRange => !!r && (r[0] != null || r[1] != null);

/** How many fields carry a bound, for the count on the panel's toggle. */
export function activePerfCount(ranges: PerfRanges, fields: readonly PerfDef[] = PERF_FIELDS): number {
  return fields.filter((f) => isSet(ranges[f.id])).length;
}

/**
 * Whether a motor clears every bound that is set.
 *
 * A motor the catalog gives no figure for is left out once that figure is
 * bounded. Letting it through would put a motor on screen that the filter
 * could not check, under a filter that says it was checked; a value that is
 * not finite is treated the same way.
 */
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
