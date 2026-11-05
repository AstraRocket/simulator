import { NO_VALUE } from '../i18n/noValue';
import { G0 } from '../services/motors/motorMath';

export const M_TO_MM = 1000;

/** This operation order keeps results bit-identical across call sites. */
export const degToRad = (d: number): number => (d * Math.PI) / 180;

export const radToDeg = (r: number): number => (r * 180) / Math.PI;

// Mirrors desktop UnitGroup.java: si = (ui + offset) * toSI.

export type Quantity =
  | 'length'
  | 'motorDimensions'
  | 'distance'
  | 'area'
  | 'mass'
  | 'velocity'
  | 'windspeed'
  | 'acceleration'
  | 'angle'
  | 'density'
  | 'surfaceDensity'
  | 'lineDensity'
  | 'temperature'
  | 'pressure'
  | 'force'
  | 'impulse'
  | 'rollRate';

export interface UnitDef {
  symbol: string;
  /** SI units per 1 of this unit. */
  toSI: number;
  /** Added to the UI value before scaling (temperature only). */
  offset?: number;
}

const VELOCITY_UNITS: UnitDef[] = [
  { symbol: 'm/s', toSI: 1 },
  { symbol: 'km/h', toSI: 1 / 3.6 },
  { symbol: 'ft/s', toSI: 0.3048 },
  { symbol: 'mph', toSI: 0.44704 },
  { symbol: 'kt', toSI: 0.51444445 },
];

export const UNITS: Record<Quantity, UnitDef[]> = {
  length: [
    { symbol: 'mm', toSI: 0.001 },
    { symbol: 'cm', toSI: 0.01 },
    { symbol: 'm', toSI: 1 },
    { symbol: 'in', toSI: 0.0254 },
    { symbol: 'ft', toSI: 0.3048 },
  ],
  motorDimensions: [
    { symbol: 'mm', toSI: 0.001 },
    { symbol: 'cm', toSI: 0.01 },
    { symbol: 'in', toSI: 0.0254 },
  ],
  distance: [
    { symbol: 'm', toSI: 1 },
    { symbol: 'km', toSI: 1000 },
    { symbol: 'ft', toSI: 0.3048 },
    { symbol: 'yd', toSI: 0.9144 },
    { symbol: 'mi', toSI: 1609.344 },
  ],
  area: [
    { symbol: 'mm²', toSI: 0.001 ** 2 },
    { symbol: 'cm²', toSI: 0.01 ** 2 },
    { symbol: 'm²', toSI: 1 },
    { symbol: 'in²', toSI: 0.0254 ** 2 },
    { symbol: 'ft²', toSI: 0.3048 ** 2 },
  ],
  mass: [
    { symbol: 'g', toSI: 0.001 },
    { symbol: 'kg', toSI: 1 },
    { symbol: 'oz', toSI: 0.0283495231 },
    { symbol: 'lb', toSI: 0.45359237 },
  ],
  velocity: VELOCITY_UNITS,
  windspeed: VELOCITY_UNITS,
  acceleration: [
    { symbol: 'm/s²', toSI: 1 },
    { symbol: 'ft/s²', toSI: 0.3048 },
    { symbol: 'G', toSI: G0 },
  ],
  angle: [
    { symbol: '°', toSI: Math.PI / 180 },
    { symbol: 'rad', toSI: 1 },
  ],
  density: [
    { symbol: 'kg/m³', toSI: 1 },
    { symbol: 'g/cm³', toSI: 1000 },
    { symbol: 'oz/in³', toSI: 1729.99404 },
    { symbol: 'lb/ft³', toSI: 16.0184634 },
  ],
  surfaceDensity: [
    { symbol: 'kg/m²', toSI: 1 },
    { symbol: 'g/m²', toSI: 0.001 },
    { symbol: 'g/cm²', toSI: 0.001 / 0.0001 },
    { symbol: 'oz/yd²', toSI: 0.0283495231 / 0.83612736 },
    { symbol: 'oz/ft²', toSI: 0.0283495231 / 0.09290304 },
    { symbol: 'lb/ft²', toSI: 0.45359237 / 0.09290304 },
  ],
  lineDensity: [
    { symbol: 'kg/m', toSI: 1 },
    { symbol: 'g/m', toSI: 0.001 },
    { symbol: 'g/cm', toSI: 0.001 / 0.01 },
    { symbol: 'oz/ft', toSI: 0.0283495231 / 0.3048 },
    { symbol: 'oz/in', toSI: 0.0283495231 / 0.0254 },
    { symbol: 'lb/ft', toSI: 0.45359237 / 0.3048 },
  ],
  temperature: [
    { symbol: '°C', toSI: 1, offset: 273.15 },
    { symbol: '°F', toSI: 5 / 9, offset: 459.67 },
    { symbol: 'K', toSI: 1 },
  ],
  pressure: [
    { symbol: 'mbar', toSI: 100 },
    { symbol: 'hPa', toSI: 100 },
    { symbol: 'bar', toSI: 1.0e5 },
    { symbol: 'atm', toSI: 1.01325e5 },
    { symbol: 'mmHg', toSI: 101325 / 760 },
    { symbol: 'inHg', toSI: 3386.389 },
    { symbol: 'psi', toSI: 6894.75729 },
    { symbol: 'Pa', toSI: 1 },
  ],
  force: [
    { symbol: 'N', toSI: 1 },
    { symbol: 'lbf', toSI: 4.44822162 },
  ],
  impulse: [
    { symbol: 'N·s', toSI: 1 },
    { symbol: 'lbf·s', toSI: 4.44822162 },
  ],
  // Desktop UnitGroup.UNITS_ROLL; SI is rad/s.
  rollRate: [
    { symbol: 'rad/s', toSI: 1 },
    { symbol: '°/s', toSI: Math.PI / 180 },
    { symbol: 'r/s', toSI: 2 * Math.PI },
    { symbol: 'Hz', toSI: 2 * Math.PI },
    { symbol: 'rpm', toSI: (2 * Math.PI) / 60 },
  ],
};

export const QUANTITIES = Object.keys(UNITS) as Quantity[];

export type UnitSelection = Record<Quantity, string>;

/** Keyed by field scope, not quantity; symbols are validated lazily by `unitFor`. */
export type UnitOverrides = Record<string, string>;

export function unitScope(...parts: (string | number)[]): string {
  return parts.join('.');
}

/** Desktop UnitGroup.setDefaultMetricUnits(). */
export const METRIC_UNITS: UnitSelection = {
  length: 'cm',
  motorDimensions: 'mm',
  distance: 'm',
  area: 'cm²',
  mass: 'g',
  velocity: 'm/s',
  windspeed: 'm/s',
  acceleration: 'm/s²',
  angle: '°',
  density: 'g/cm³',
  surfaceDensity: 'g/m²',
  lineDensity: 'g/m',
  temperature: '°C',
  // Desktop uses `mbar` and `Ns`; same numbers.
  pressure: 'hPa',
  force: 'N',
  impulse: 'N·s',
  rollRate: 'r/s',
};

/** Desktop UnitGroup.setDefaultImperialUnits(). */
export const IMPERIAL_UNITS: UnitSelection = {
  length: 'in',
  motorDimensions: 'in',
  distance: 'ft',
  area: 'in²',
  mass: 'oz',
  velocity: 'ft/s',
  windspeed: 'mph',
  acceleration: 'ft/s²',
  angle: '°',
  density: 'oz/in³',
  surfaceDensity: 'oz/ft²',
  lineDensity: 'oz/ft',
  temperature: '°F',
  // Deliberate deviation: the desktop leaves these three metric.
  pressure: 'psi',
  force: 'lbf',
  impulse: 'lbf·s',
  rollRate: 'r/s',
};

export type UnitChoice = 'current' | 'metric' | 'imperial';

export const UNIT_CHOICES: UnitChoice[] = ['current', 'metric', 'imperial'];

export function resolveUnitChoice(choice: UnitChoice, current: UnitSelection): UnitSelection {
  if (choice === 'metric') return METRIC_UNITS;
  if (choice === 'imperial') return IMPERIAL_UNITS;
  return current;
}

function unitDef(quantity: Quantity, symbol: string): UnitDef {
  const list = UNITS[quantity];
  return list.find((u) => u.symbol === symbol) ?? list[0]!;
}

export function siToUi(quantity: Quantity, symbol: string, si: number): number {
  const u = unitDef(quantity, symbol);
  return si / u.toSI - (u.offset ?? 0);
}

export function uiToSi(quantity: Quantity, symbol: string, ui: number): number {
  const u = unitDef(quantity, symbol);
  return (ui + (u.offset ?? 0)) * u.toSI;
}

/** For a difference: the temperature offset cancels, so a 1 K step is 1 °C. */
export function siToUiDelta(quantity: Quantity, symbol: string, si: number): number {
  return si / unitDef(quantity, symbol).toSI;
}

/** Not interchangeable with `schematicGeometry.niceRulerStep` (different rungs and scale). */
export function niceStep(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / mag;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * mag;
}

export function ladderDigits(v: number): number {
  const a = Math.abs(v);
  return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
}

export function fmtSi(quantity: Quantity, symbol: string, si: number, digits?: number): string {
  if (si === null || si === undefined || !Number.isFinite(si)) return NO_VALUE;
  const v = siToUi(quantity, symbol, si);
  if (digits !== undefined) return String(Number(v.toFixed(digits)));
  return v.toFixed(ladderDigits(v));
}

export function normalizeUnits(raw: unknown): UnitSelection {
  const out = { ...METRIC_UNITS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const q of QUANTITIES) {
    const sym = r[q];
    if (typeof sym === 'string' && UNITS[q].some((u) => u.symbol === sym)) out[q] = sym;
  }
  return out;
}

export function normalizeUnitOverrides(raw: unknown): UnitOverrides {
  const out: UnitOverrides = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [scope, sym] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof sym === 'string' && sym) out[scope] = sym;
  }
  return out;
}

export function unitFor(units: UnitSelection, overrides: UnitOverrides, quantity: Quantity, scope?: string): string {
  const sym = scope ? overrides[scope] : undefined;
  return sym && UNITS[quantity].some((u) => u.symbol === sym) ? sym : units[quantity];
}

/** Services must not call `loadSettings()`: they sit in an import cycle with `settings.ts`. */
export interface UnitSymbols {
  sym: (q: Quantity, scope?: string) => string;
}

export function unitSymbols(units: UnitSelection, overrides: UnitOverrides): UnitSymbols {
  return { sym: (q, scope) => unitFor(units, overrides, q, scope) };
}
