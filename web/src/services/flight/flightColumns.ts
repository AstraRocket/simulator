import type { FlightBranch, FlightResult, FlightSeries } from '../../engine/openRocketEngine';
import type { Quantity } from '../../prefs/units';
import i18n from '../../i18n';

export interface FlightColumn {
  key: string;
  labelKey: string | null;
  quantity?: Quantity;
  unit?: string;
  unitKey?: string;
  /** SI to display multiplier for a fixed-unit series (kg to g, m to cm, rad to deg). */
  scale?: number;
}

const KNOWN: FlightColumn[] = [
  { key: 'time', labelKey: 'flight.time', unit: 's' },
  { key: 'altitude', labelKey: 'flight.altitude', quantity: 'distance' },
  { key: 'velocity', labelKey: 'flight.velocity', quantity: 'velocity' },
  { key: 'acceleration', labelKey: 'flight.acceleration', quantity: 'acceleration' },
  { key: 'mass', labelKey: 'flight.mass', quantity: 'mass' },
  { key: 'thrust', labelKey: 'flight.thrust', quantity: 'force' },
  { key: 'drag', labelKey: 'flight.drag', quantity: 'force' },
  { key: 'mach', labelKey: 'flight.mach', unit: '' },
  { key: 'stability', labelKey: 'flight.stability', unitKey: 'stability.caliber' },
  { key: 'cpLocation', labelKey: 'flight.cp', quantity: 'length' },
  { key: 'cgLocation', labelKey: 'flight.cg', quantity: 'length' },
  { key: 'aoa', labelKey: 'flight.aoa', quantity: 'angle' },
];

const TRACK_KEYS = ['Px', 'Py', 'Pl', 'θl'];

// From `FlightDataType.java`. Excludes the app's dozen (the bridge renames them: thrust, not Ft) and tc, never sent.
const KERNEL: FlightColumn[] = [
  { key: 'ha', labelKey: 'flightVar.ha', quantity: 'distance' },
  { key: 'Vz', labelKey: 'flightVar.Vz', quantity: 'velocity' },
  { key: 'Az', labelKey: 'flightVar.Az', quantity: 'acceleration' },
  { key: 'Ax', labelKey: 'flightVar.Ax', quantity: 'acceleration' },
  { key: 'Ay', labelKey: 'flightVar.Ay', quantity: 'acceleration' },
  { key: 'Abx', labelKey: 'flightVar.Abx', quantity: 'acceleration' },
  { key: 'Aby', labelKey: 'flightVar.Aby', quantity: 'acceleration' },
  { key: 'Abz', labelKey: 'flightVar.Abz', quantity: 'acceleration' },
  { key: 'Px', labelKey: 'flightVar.Px', quantity: 'distance' },
  { key: 'Py', labelKey: 'flightVar.Py', quantity: 'distance' },
  { key: 'Pl', labelKey: 'flightVar.Pl', quantity: 'distance' },
  { key: 'θl', labelKey: 'flightVar.θl', quantity: 'angle' },
  { key: 'Vl', labelKey: 'flightVar.Vl', quantity: 'velocity' },
  { key: 'Al', labelKey: 'flightVar.Al', quantity: 'acceleration' },
  { key: 'φ', labelKey: 'flightVar.φ', unit: '° N' },
  { key: 'λ', labelKey: 'flightVar.λ', unit: '° E' },
  { key: 'dΦ', labelKey: 'flightVar.dΦ', quantity: 'rollRate' },
  { key: 'dθ', labelKey: 'flightVar.dθ', quantity: 'rollRate' },
  { key: 'dΨ', labelKey: 'flightVar.dΨ', quantity: 'rollRate' },
  { key: 'Θ', labelKey: 'flightVar.Θ', quantity: 'angle' },
  { key: 'Φ', labelKey: 'flightVar.Φ', quantity: 'angle' },
  { key: 'mp', labelKey: 'flightVar.mp', quantity: 'mass' },
  { key: 'Il', labelKey: 'flightVar.Il', unit: 'kg·m²' },
  { key: 'Ir', labelKey: 'flightVar.Ir', unit: 'kg·m²' },
  { key: 'g', labelKey: 'flightVar.g', quantity: 'acceleration' },
  { key: 'ζ', labelKey: 'flightVar.ζ', unit: '' },
  { key: 'ωn', labelKey: 'flightVar.ωn', quantity: 'rollRate' },
  { key: 'R', labelKey: 'flightVar.R', unit: '' },
  { key: 'Fta', labelKey: 'flightVar.Fta', quantity: 'force' },
  { key: 'Twr', labelKey: 'flightVar.Twr', unit: '' },
  { key: 'Cd', labelKey: 'flightVar.Cd', unit: '' },
  { key: 'Cdf', labelKey: 'flightVar.Cdf', unit: '' },
  { key: 'Cdp', labelKey: 'flightVar.Cdp', unit: '' },
  { key: 'Cdb', labelKey: 'flightVar.Cdb', unit: '' },
  { key: 'Cda', labelKey: 'flightVar.Cda', unit: '' },
  { key: 'Cn', labelKey: 'flightVar.Cn', unit: '' },
  { key: 'CNα', labelKey: 'flightVar.CNα', unit: '' },
  { key: 'Cθ', labelKey: 'flightVar.Cθ', unit: '' },
  { key: 'CτΨ', labelKey: 'flightVar.CτΨ', unit: '' },
  { key: 'Cτs', labelKey: 'flightVar.Cτs', unit: '' },
  { key: 'CτΦ', labelKey: 'flightVar.CτΦ', unit: '' },
  { key: 'CfΦ', labelKey: 'flightVar.CfΦ', unit: '' },
  { key: 'CζΦ', labelKey: 'flightVar.CζΦ', unit: '' },
  { key: 'Cζθ', labelKey: 'flightVar.Cζθ', unit: '' },
  { key: 'CζΨ', labelKey: 'flightVar.CζΨ', unit: '' },
  { key: 'Cdm', labelKey: 'flightVar.Cdm', unit: 'kg·m²/s' },
  { key: 'Cdm_aero', labelKey: 'flightVar.Cdm_aero', unit: 'kg·m²/s' },
  { key: 'Cdm_prop', labelKey: 'flightVar.Cdm_prop', unit: 'kg·m²/s' },
  { key: 'Ccm', labelKey: 'flightVar.Ccm', unit: 'N·m' },
  { key: 'Ac', labelKey: 'flightVar.Ac', quantity: 'acceleration' },
  { key: 'Lr', labelKey: 'flightVar.Lr', quantity: 'length' },
  { key: 'Ar', labelKey: 'flightVar.Ar', unit: 'm²' },
  { key: 'Vw', labelKey: 'flightVar.Vw', quantity: 'velocity' },
  { key: 'θw', labelKey: 'flightVar.θw', quantity: 'angle' },
  { key: 'T', labelKey: 'flightVar.T', quantity: 'temperature' },
  { key: 'P', labelKey: 'flightVar.P', quantity: 'pressure' },
  { key: 'ρ', labelKey: 'flightVar.ρ', quantity: 'density' },
  { key: 'Vs', labelKey: 'flightVar.Vs', quantity: 'velocity' },
  { key: 'dt', labelKey: 'flightVar.dt', unit: 's' },
];

const ALL: FlightColumn[] = [...KNOWN, ...KERNEL];

const KNOWN_KEYS = new Set(ALL.map((c) => c.key));

const BY_KEY = new Map(ALL.map((c, order) => [c.key, { ...c, order }]));

export function seriesColumn(key: string): (FlightColumn & { order: number }) | undefined {
  return BY_KEY.get(key);
}

// `branches[0]` duplicates the top-level data, so use one or the other, never both.
export function flightBranches(result: FlightResult, fallbackName = ''): FlightBranch[] {
  if (result.branches?.length) return result.branches;
  return [{ name: fallbackName, events: result.events ?? [], series: result.series }];
}

export function branchSeries(result: FlightResult, branchIndex: number): FlightSeries | undefined {
  return result.branches?.length ? result.branches[branchIndex]?.series : result.series;
}

// An empty array still counts as present, so the offer depends on the run settings rather than the flight.
export function flightColumns(result: FlightResult, branchIndex = 0): FlightColumn[] {
  const series = branchSeries(result, branchIndex);
  if (!series) return [];
  const has = (k: string) => Array.isArray((series as Record<string, unknown>)[k]);
  const out = ALL.filter((c) => has(c.key)).map((c) => (c.unitKey ? { ...c, unit: i18n.t(c.unitKey) } : c));
  for (const k of Object.keys(series)) {
    if (KNOWN_KEYS.has(k) || !has(k)) continue;
    out.push({ key: k, labelKey: null, unit: '' });
  }
  return out;
}

export const DEFAULT_CSV_COLUMNS: readonly string[] = [...KNOWN.map((c) => c.key), ...TRACK_KEYS];

export interface CsvFormat {
  columns: string[];
  separator: string;
  decimals: number;
  exponential: boolean;
  simDescription: boolean;
  /** One commented line of names and units: the file's only header, as on desktop. */
  fieldDescriptions: boolean;
  flightEvents: boolean;
  commentChar: string;
}

export function defaultCsvFormat(): CsvFormat {
  return {
    columns: [...DEFAULT_CSV_COLUMNS],
    separator: ',',
    decimals: 3,
    exponential: false,
    simDescription: true,
    fieldDescriptions: true,
    flightEvents: true,
    commentChar: '#',
  };
}

export function usableColumns(all: readonly FlightColumn[], wanted: readonly string[]): FlightColumn[] {
  const want = new Set(wanted);
  return all.filter((c) => want.has(c.key));
}
