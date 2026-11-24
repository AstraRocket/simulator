import { KERNEL_COLUMNS, KNOWN_COLUMNS, type FlightColumn } from './flightColumns';
import { must } from '../app/must';
import type { Quantity } from '../../prefs/units';

/** The kernel symbols of the series the bridge renames. */
const KNOWN_SYMBOL: Readonly<Record<string, string>> = {
  time: 't',
  altitude: 'h',
  velocity: 'Vt',
  acceleration: 'At',
  mass: 'm',
  thrust: 'Ft',
  drag: 'Fd',
  mach: 'M',
  stability: 'S',
  cpLocation: 'Cp',
  cgLocation: 'Cg',
  aoa: 'α',
};

const SI_SYMBOL: Readonly<Partial<Record<Quantity, string>>> = {
  length: 'm',
  distance: 'm',
  velocity: 'm/s',
  acceleration: 'm/s²',
  mass: 'kg',
  force: 'N',
  angle: 'rad',
  rollRate: 'rad/s',
  temperature: 'K',
  pressure: 'Pa',
  density: 'kg/m³',
};

export interface ExpressionVariable {
  symbol: string;
  labelKey: string;
  /** What a formula reads, always SI. */
  unit: string;
  unitKey?: string;
}

const variable = (c: FlightColumn): ExpressionVariable => ({
  symbol: KNOWN_SYMBOL[c.key] ?? c.key,
  labelKey: must(c.labelKey, `label for ${c.key}`),
  unit: c.quantity ? (SI_SYMBOL[c.quantity] ?? '') : (c.unit ?? ''),
  ...(c.unitKey ? { unitKey: c.unitKey } : {}),
});

// `Fta` is missing from `FlightDataType.ALL_TYPES`, so a formula cannot read it; `CζΨ` never has a value.
const UNREADABLE: ReadonlySet<string> = new Set(['Fta', 'CζΨ']);

/** Every flight variable a formula can use, in the order the flight chart lists them. */
export const EXPRESSION_VARIABLES: readonly ExpressionVariable[] = [...KNOWN_COLUMNS, ...KERNEL_COLUMNS]
  .filter((c) => !UNREADABLE.has(c.key))
  .map(variable);

export interface ExpressionFunction {
  name: string;
  /** Inserted with the cursor at `|`. */
  insert: string;
  /** Described only where the name does not say it. */
  labelKey?: string;
  /** OpenRocket's own functions: exp4j applies one after the operator that follows it. */
  late?: true;
}

const plain = (name: string): ExpressionFunction => ({ name, insert: `${name}(|)` });

/** `Functions.AVAILABLE_OPERATORS`, less the operators. */
export const EXPRESSION_FUNCTIONS: readonly ExpressionFunction[] = [
  ...['abs', 'ceil', 'floor'].map(plain),
  { ...plain('round'), labelKey: 'expressions.fn.round' },
  ...['sqrt', 'cbrt', 'exp'].map(plain),
  { ...plain('expm1'), labelKey: 'expressions.fn.expm1' },
  { ...plain('log'), labelKey: 'expressions.fn.log' },
  { ...plain('log10'), labelKey: 'expressions.fn.log10' },
  ...['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh'].map(plain),
  { ...plain('random'), labelKey: 'expressions.fn.random' },
  { name: 'mean', insert: 'mean(|[:])', labelKey: 'expressions.fn.mean', late: true },
  { name: 'min', insert: 'min(|[:])', labelKey: 'expressions.fn.min', late: true },
  { name: 'max', insert: 'max(|[:])', labelKey: 'expressions.fn.max', late: true },
  { name: 'var', insert: 'var(|[:])', labelKey: 'expressions.fn.var', late: true },
  { name: 'stdev', insert: 'stdev(|[:])', labelKey: 'expressions.fn.stdev', late: true },
  { name: 'rms', insert: 'rms(|[:])', labelKey: 'expressions.fn.rms', late: true },
  { name: 'trapz', insert: 'trapz(|[:])', labelKey: 'expressions.fn.trapz', late: true },
  { name: 'tnear', insert: 'tnear(|[:],)', labelKey: 'expressions.fn.tnear', late: true },
  { name: 'binf', insert: 'binf(|[:],,)', labelKey: 'expressions.fn.binf', late: true },
  { name: 'lclip', insert: 'lclip(|,)', labelKey: 'expressions.fn.lclip', late: true },
  { name: 'uclip', insert: 'uclip(|,)', labelKey: 'expressions.fn.uclip', late: true },
];

const LATE_FUNCTIONS = EXPRESSION_FUNCTIONS.filter((f) => f.late).map((f) => f.name);
const LATE_CALL = new RegExp(`(^|[^\\p{L}\\d_$])(?:${LATE_FUNCTIONS.join('|')})\\(`, 'gu');

/**
 * Whether a formula has a function exp4j applies after the operator that follows it: `lclip(h,5)+1` is
 * `lclip(h,5+1)`, on desktop too. In brackets of its own, `(lclip(h,5))+1`, it is not.
 */
export function appliesLate(formula: string): boolean {
  const s = formula.replace(/\s+/g, '');
  for (const m of s.matchAll(LATE_CALL)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')' && --depth === 0) break;
    }
    if (/[-+*/%^]/.test(s[i + 1] ?? '')) return true;
  }
  return false;
}
