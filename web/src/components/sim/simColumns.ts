import type { FlightResult, FlightSummary } from '../../engine/openRocketEngine';
import { fmtNum } from '../../i18n/format';
import { fmtDegrees, type FieldUnit, type Units } from '../../prefs/useUnits';
import { unitScope, type Quantity } from '../../prefs/units';
import { nsKey } from '../../services/storage/storageKeys';
import { readLocalJson, writeLocalJson } from '../../services/storage/localPref';
import {
  eventTime,
  forwardFlightEnd,
  maxQ,
  maxQAlpha,
  maxRollRate,
  seriesAtEvent,
} from '../../services/flight/flightEvents';
import { distanceFromPad, landingPoint } from '../../services/flight/groundTrack';
import { WEATHERCOCK_LIMIT_DEG, maxWindMs } from '../../services/flight/weathercock';
import { usePersistedState } from '../common/usePersistedState';

/** Loose enough for the launcher-worded `t` the table holds. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** How a column's numbers read: unit symbol and formatter. */
interface Reading {
  sym: string;
  fmt: (v: number) => string;
}

/**
 * A result column of the simulations table; `null` from `value` shows as no value. `flight` is null for a simulation
 * with only a stored summary (from a file, or not run here), so columns worked out from the flight data stay empty.
 */
export interface SimResultCol {
  id: string;
  label: string;
  labelValues?: (u: Units) => Record<string, unknown>;
  /** Unit-converted through this scope, or a plain number with `unit` beside it, or read by `reading`. */
  scope?: { key: string; quantity: Quantity };
  unit?: (t: Translate) => string;
  digits?: number;
  reading?: (u: Units) => Reading;
  value: (r: FlightSummary, flight: FlightResult | null) => number | null | undefined;
}

/** The results panel's figures from the flight data, worked out once per flight. */
interface Derived {
  exitTime: number | null;
  exitMargin: number | null;
  exitTwr: number | null;
  exitAoa: number | null;
  maxQ: number | null;
  maxQAlpha: number | null;
  maxRoll: number | null;
  downrange: number | null;
}

const derivedCache = new WeakMap<FlightResult, Derived>();

function derived(flight: FlightResult): Derived {
  const hit = derivedCache.get(flight);
  if (hit) return hit;
  const aoa = seriesAtEvent(flight, 'LAUNCHROD', 'aoa');
  const landing = landingPoint(flight.series);
  const out: Derived = {
    exitTime: eventTime(flight.events, 'LAUNCHROD') ?? null,
    exitMargin: seriesAtEvent(flight, 'LAUNCHROD', 'stability'),
    exitTwr: seriesAtEvent(flight, 'LAUNCHROD', 'Twr'),
    exitAoa: aoa == null ? null : Math.abs(aoa),
    maxQ: maxQ(flight.series)?.q ?? null,
    maxQAlpha: maxQAlpha(flight.series, forwardFlightEnd(flight))?.value ?? null,
    maxRoll: maxRollRate(flight.series),
    downrange: landing ? distanceFromPad(landing) : null,
  };
  derivedCache.set(flight, out);
  return out;
}

const fromFlight =
  (key: keyof Derived) =>
  (_r: FlightSummary, flight: FlightResult | null): number | null =>
    flight ? derived(flight)[key] : null;

const seconds = (t: Translate) => t('units.second');

const scoped = (key: string, quantity: Quantity) => ({ scope: { key, quantity } });

const maxQUnit = (u: Units): FieldUnit => u.at(unitScope('sim', 'maxQ'), 'pressure');

export const RESULT_COLUMNS: readonly SimResultCol[] = [
  { id: 'apogee', label: 'sim.apogee', ...scoped('apogee', 'distance'), value: (r) => r.maxAltitude },
  { id: 'maxSpeed', label: 'sim.maxSpeed', ...scoped('maxSpeed', 'velocity'), value: (r) => r.maxVelocity },
  { id: 'maxAccel', label: 'sim.maxAccel', ...scoped('maxAccel', 'acceleration'), value: (r) => r.maxAcceleration },
  { id: 'maxMach', label: 'sim.maxMach', digits: 2, value: (r) => r.maxMachNumber },
  { id: 'maxQ', label: 'sim.maxQ', ...scoped('maxQ', 'pressure'), value: fromFlight('maxQ') },
  {
    id: 'maxQAlpha',
    label: 'sim.maxQAlpha',
    // As the results panel: Max q's pressure unit times the angle unit.
    reading: (u) => {
      const q = maxQUnit(u);
      return { sym: `${q.sym}·${u.sym('angle')}`, fmt: (v) => fmtNum(q.toUi(v) * u.factor('angle'), 1) };
    },
    value: fromFlight('maxQAlpha'),
  },
  { id: 'maxRoll', label: 'sim.maxRollRate', ...scoped('maxRoll', 'rollRate'), value: fromFlight('maxRoll') },
  { id: 'rodExit', label: 'sim.rodExit', ...scoped('rodExit', 'velocity'), value: (r) => r.launchRodVelocity },
  { id: 'exitTime', label: 'sim.exitTime', unit: seconds, digits: 2, value: fromFlight('exitTime') },
  { id: 'exitTwr', label: 'sim.exitTwr', digits: 1, value: fromFlight('exitTwr') },
  {
    id: 'exitMargin',
    label: 'sim.railMargin',
    unit: (t) => t('stability.caliber'),
    digits: 2,
    value: fromFlight('exitMargin'),
  },
  {
    id: 'exitAoa',
    label: 'sim.exitAoa',
    reading: (u) => ({ sym: u.sym('angle'), fmt: (v) => u.fmt('angle', v) }),
    value: fromFlight('exitAoa'),
  },
  {
    id: 'maxWind',
    label: 'sim.maxWind',
    labelValues: (u) => ({ angle: fmtDegrees(u, WEATHERCOCK_LIMIT_DEG) }),
    ...scoped('maxWind', 'windspeed'),
    value: (r) => maxWindMs(r.launchRodVelocity),
  },
  { id: 'railNeeded', label: 'sim.railNeeded', ...scoped('railNeeded', 'length'), value: (r) => r.railLengthNeeded },
  { id: 'toApogee', label: 'sim.toApogee', unit: seconds, digits: 1, value: (r) => r.timeToApogee },
  { id: 'optDelay', label: 'sim.optDelay', unit: seconds, digits: 1, value: (r) => r.optimumDelay },
  {
    id: 'deployVelocity',
    label: 'sim.deployVelocity',
    ...scoped('deployVelocity', 'velocity'),
    value: (r) => r.deploymentVelocity,
  },
  { id: 'flightTime', label: 'sim.flightTime', unit: seconds, digits: 1, value: (r) => r.flightTime },
  { id: 'landing', label: 'sim.landing', ...scoped('landing', 'velocity'), value: (r) => r.groundHitVelocity },
  { id: 'downrange', label: 'sim.downrange', ...scoped('downrange', 'distance'), value: fromFlight('downrange') },
];

/** Always shown; it carries the row's select button, so it can move but not hide. */
export const NAME_COL = 'name';

/** Every column the table can show, in the menu's order for the hidden ones. */
export const SIM_COLUMN_IDS: readonly string[] = ['status', NAME_COL, 'config', ...RESULT_COLUMNS.map((c) => c.id)];

export function simColumnLabel(id: string, t: Translate, u: Units): string {
  if (id === NAME_COL) return t('sims.name');
  if (id === 'status') return t('sims.status');
  if (id === 'config') return t('configs.name');
  const col = RESULT_COLUMNS.find((c) => c.id === id);
  return col ? t(col.label, col.labelValues?.(u)) : id;
}

/** The table's columns, in order, before the chooser existed. */
export const DEFAULT_SIM_COLS: readonly string[] = [
  'status',
  NAME_COL,
  'config',
  'apogee',
  'maxSpeed',
  'maxAccel',
  'rodExit',
  'toApogee',
  'flightTime',
  'landing',
];

const COLS_KEY = nsKey('sims:cols');
const isColumnList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
/**
 * Known ids once each, with the name always in: a list saved before the name could move has none, and gets it where
 * it sat then, after the status.
 */
export function normalizeCols(saved: readonly string[]): string[] {
  const known = new Set(SIM_COLUMN_IDS);
  const out = [...new Set(saved.filter((id) => known.has(id)))];
  if (!out.includes(NAME_COL)) out.splice(out[0] === 'status' ? 1 : 0, 0, NAME_COL);
  return out;
}

const loadCols = (): string[] => normalizeCols(readLocalJson(COLS_KEY, isColumnList, [...DEFAULT_SIM_COLS]));
const saveCols = (ids: string[]): void => void writeLocalJson(COLS_KEY, ids);

export interface ResultCell extends Reading {
  col: SimResultCol;
}

const RESULT_BY_ID: ReadonlyMap<string, SimResultCol> = new Map(RESULT_COLUMNS.map((c) => [c.id, c]));

function readingOf(col: SimResultCol, u: Units, t: Translate): Reading {
  if (col.reading) return col.reading(u);
  if (col.scope) {
    const unit = u.at(unitScope('sim', col.scope.key), col.scope.quantity);
    return { sym: unit.sym, fmt: (v) => unit.fmt(v) };
  }
  return { sym: col.unit?.(t) ?? '', fmt: (v) => fmtNum(v, col.digits ?? 1) };
}

/** A result column with its unit resolved, or null for status, name and configuration. */
export function resultCell(id: string, u: Units, t: Translate): ResultCell | null {
  const col = RESULT_BY_ID.get(id);
  return col ? { col, ...readingOf(col, u, t) } : null;
}

/** `id` moved to where `target` is: before it moving left, after it moving right. */
export function movedTo(order: readonly string[], id: string, target: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...order];
  const out = order.filter((x) => x !== id);
  out.splice(to, 0, id);
  return out;
}

/** `id` swapped with its neighbor; at either end it stays. */
export function movedBy(order: readonly string[], id: string, dir: -1 | 1): string[] {
  const target = order[order.indexOf(id) + dir];
  return target === undefined ? [...order] : movedTo(order, id, target);
}

/** The shown columns in their saved order; a column turned on goes last. */
export function useSimColumns() {
  const [order, setOrder] = usePersistedState<string[]>(loadCols, saveCols);
  const toggleCol = (id: string) => {
    if (id === NAME_COL) return;
    setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const moveCol = (id: string, dir: -1 | 1) => setOrder((prev) => movedBy(prev, id, dir));
  const moveColTo = (id: string, target: string) => setOrder((prev) => movedTo(prev, id, target));
  return { order, toggleCol, moveCol, moveColTo };
}
