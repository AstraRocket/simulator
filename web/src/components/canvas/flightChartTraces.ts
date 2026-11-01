import type { FlightResult, FlightSeries } from '../../engine/openRocketEngine';
import { type Quantity, radToDeg } from '../../prefs/units';
import type { Units } from '../../prefs/useUnits';
import { flightBranches, seriesColumn } from '../../services/flight/flightColumns';
import { dynamicPressure, qAlpha, rollRate } from '../../services/flight/flightEvents';
import { token } from '../common/colorTokens';
import { ladderDigits } from '../../i18n/format';

/**
 * Owns what the flight chart draws: the series catalog (one panel per
 * measure, with its unit group and y-domain rules), the panels a flight can
 * add beyond it (`extraSeries`), the saved-panel filter, and the
 * flight-to-branch build that turns one simulation into one colored line per
 * stage. Pure data and functions; FlightChart re-exports `buildTraces` and
 * `ChartFlight` for GroundTrack.
 */

export type Key =
  | 'altitude'
  | 'velocity'
  | 'acceleration'
  | 'mach'
  | 'thrust'
  | 'drag'
  | 'mass'
  | 'stability'
  | 'cpLocation'
  | 'cgLocation'
  | 'aoa'
  | 'dynamicPressure'
  | 'qAlpha'
  | 'rollRate'
  | 'velocityAltitude';

export interface Meta {
  /** A {@link Key} for the built-in panels; a kernel symbol (`Cd`, `Vz`) for an added one. */
  key: string;
  /** i18n key for the panel's name, or the name itself when `literal`. */
  label: string;
  /**
   * The label is the kernel symbol itself, not an i18n key: a series the run
   * recorded that the app has no name for.
   */
  literal?: boolean;
  /** Fixed unit label, for series that have no user-selectable unit (Mach). */
  unit: string;
  /** A fixed unit label that is a word, so it is translated (calibers). */
  unitKey?: string;
  digits: number;
  /**
   * The preference group this series belongs to. When set it supplies both the
   * scale and the label, and `unit`, `scale` and `digits` are unused; they
   * serve the handful of series (Mach, calibers) that are unitless.
   */
  quantity?: Quantity;
  /**
   * A second preference group the series is multiplied by, for a product of
   * two quantities: q·α is a pressure times an angle, shown in the reader's
   * pressure unit times their angle unit.
   */
  times?: Quantity;
  /**
   * The readout decimals follow the span on screen, as a quantity's do, for a
   * unitless series whose magnitude is not known ahead (a coefficient, a
   * Reynolds number).
   */
  ladder?: boolean;
  /** Multiply the raw SI series into display units (kg→g, m→cm, rad→deg). */
  scale?: number;
  /** Level bands (CG/CP/mass/stability) get a tight y-domain + no area fill;
   *  flow series (altitude/velocity/…) get a zero baseline + filled area. */
  level?: boolean;
  /** Aero-derived (CP / stability / q·α): only meaningful while flying forward; after
   *  recovery deploys the rocket tumbles (AoA≈90°) and these collapse to junk, so
   *  the series is clipped to the boost→apogee window. */
  aero?: boolean;
  /**
   * Plotted as one series against another rather than against time (velocity
   * over altitude, or any pair the reader adds). It sits outside the shared
   * time axis, so it neither zooms with it nor shows event lines; the
   * crosshair's moment is marked on the curve instead.
   */
  xy?: { x: Meta; y: Meta };
}

const ALTITUDE: Meta = { key: 'altitude', label: 'flight.altitude', unit: 'm', digits: 0, quantity: 'distance' };
const VELOCITY: Meta = { key: 'velocity', label: 'flight.velocity', unit: 'm/s', digits: 0, quantity: 'velocity' };

export const SERIES: Meta[] = [
  ALTITUDE,
  VELOCITY,
  { key: 'acceleration', label: 'flight.acceleration', unit: 'm/s²', digits: 0, quantity: 'acceleration' },
  { key: 'mach', label: 'flight.mach', unit: '', digits: 2 },
  { key: 'thrust', label: 'flight.thrust', unit: 'N', digits: 1, quantity: 'force' },
  { key: 'drag', label: 'flight.drag', unit: 'N', digits: 2, quantity: 'force' },
  { key: 'mass', label: 'flight.mass', unit: 'g', digits: 0, scale: 1000, level: true, quantity: 'mass' },
  {
    key: 'stability',
    label: 'flight.stability',
    unit: '',
    unitKey: 'stability.caliber',
    digits: 2,
    level: true,
    aero: true,
  },
  {
    key: 'cpLocation',
    label: 'flight.cp',
    unit: 'cm',
    digits: 1,
    scale: 100,
    level: true,
    aero: true,
    quantity: 'length',
  },
  { key: 'cgLocation', label: 'flight.cg', unit: 'cm', digits: 1, scale: 100, level: true, quantity: 'length' },
  { key: 'aoa', label: 'flight.aoa', unit: '°', digits: 1, scale: radToDeg(1), quantity: 'angle' },
  // Derived in buildTraces from what the kernel records; see flightEvents.ts.
  { key: 'dynamicPressure', label: 'flight.dynamicPressure', unit: 'Pa', digits: 0, quantity: 'pressure' },
  {
    key: 'qAlpha',
    label: 'flight.qAlpha',
    unit: 'Pa·rad',
    digits: 1,
    aero: true,
    quantity: 'pressure',
    times: 'angle',
  },
  { key: 'rollRate', label: 'flight.rollRate', unit: 'r/s', digits: 2, quantity: 'rollRate' },
  { key: 'velocityAltitude', label: 'flight.velocityAltitude', unit: '', digits: 0, xy: { x: ALTITUDE, y: VELOCITY } },
];
/** What a series is multiplied by to show it in the reader's units. */
export const traceScale = (m: Meta, u: Pick<Units, 'factor'>): number =>
  m.quantity ? u.factor(m.quantity) * (m.times ? u.factor(m.times) : 1) : (m.scale ?? 1);

/**
 * What is added after the scale: the display value of SI zero. Zero for every
 * unit but a temperature's, where 0 K is -273.15 °C and a scale alone would
 * plot kelvins labeled as degrees.
 */
export const traceOffset = (m: Meta, u: Pick<Units, 'toUi'>): number =>
  m.quantity && !m.times ? u.toUi(m.quantity, 0) : 0;

/** The name a panel shows: translated, or the symbol a literal label carries. */
export const traceLabel = (m: Meta, t: (key: string, values?: Record<string, string>) => string): string =>
  m.literal
    ? m.label
    : m.xy && !m.label
      ? t('flight.yAgainstX', { y: traceLabel(m.xy.y, t), x: traceLabel(m.xy.x, t) })
      : t(m.label);

/** The unit a series is labeled in: the reader's, or its fixed label. */
export const traceUnit = (m: Meta, u: Pick<Units, 'sym'>, t: (key: string) => string): string =>
  m.quantity
    ? m.times
      ? `${u.sym(m.quantity)}·${u.sym(m.times)}`
      : u.sym(m.quantity)
    : m.unitKey
      ? t(m.unitKey)
      : m.unit;

/** One stage's samples on a panel: the points drawn and the span it flew. */
export interface PanelLine {
  color: string;
  name: string;
  pts: (readonly [number, number])[];
  xs: number[];
  ys: number[];
  t0?: number;
  t1?: number;
}

/**
 * A time panel's lines, one per shown stage, and the y-domain they share so
 * they read against each other. Aero series stop at `clipT`, where the rocket
 * stops flying forward.
 */
export function panelSeries(
  branches: readonly Branch[],
  meta: Meta,
  scale: number,
  clipT: number,
  offset = 0,
): { list: PanelLine[]; lo: number; hi: number } {
  let dMin = Infinity;
  let dMax = -Infinity;
  // A plain loop: the domain scan writes dMin/dMax, a side effect that does
  // not belong in a `.map` callback.
  const out: PanelLine[] = [];
  for (const b of branches) {
    const time = b.series.time ?? [];
    const raw = b.series[meta.key] ?? [];
    const p: (readonly [number, number])[] = [];
    const xa: number[] = [];
    const ya: number[] = [];
    for (let i = 0; i < time.length; i++) {
      const ti = time[i];
      const v = raw[i];
      if (ti == null || v == null || !Number.isFinite(ti) || !Number.isFinite(v)) continue;
      if (meta.aero && ti > clipT) continue;
      const y = v * scale + offset;
      p.push([ti, y] as const);
      xa.push(ti);
      ya.push(y);
      if (y < dMin) dMin = y;
      if (y > dMax) dMax = y;
    }
    out.push({ color: b.color, name: b.name, pts: p, xs: xa, ys: ya, t0: xa[0], t1: xa[xa.length - 1] });
  }
  if (!(dMin < Infinity)) {
    dMin = 0;
    dMax = 1;
  }
  let l: number;
  let h: number;
  if (meta.level) {
    const r = dMax - dMin || Math.abs(dMax) || 1;
    l = dMin - r * 0.1;
    h = dMax + r * 0.1;
  } else {
    l = Math.min(0, dMin);
    h = dMax + (dMax - l || 1) * 0.08;
  }
  return { list: out, lo: l, hi: h === l ? l + 1 : h };
}

/**
 * The decimals a panel's readouts carry. A fixed count belongs to a fixed
 * unit: "0 dp" is right for meters of altitude and wrong for kilometers, so a
 * quantity-backed series takes its count from the span on screen. The header
 * and the live region both read it, so what is heard is what is shown.
 */
export const panelDigits = (meta: Meta, lo: number, hi: number): number =>
  meta.quantity || meta.ladder ? ladderDigits(Math.abs(hi - lo)) : meta.digits;

/** The keys the built-in panels and the time axis take, never offered again as added ones. */
const BUILT_IN = new Set<string>(['time', ...SERIES.map((m) => m.key)]);

/**
 * Every other series the flight recorded, as a panel it can add: the kernel's
 * own variables (position, rates, coefficients, the atmosphere, the time step),
 * named and unit-grouped as the flight CSV names them (`seriesColumn`), in the
 * kernel table's order, then any symbol the app has no name for.
 *
 * Drawn with a tight y-domain and no fill (`level`), because most of them sit
 * far from zero (a latitude, a pressure, a temperature) or cross it (a moment
 * coefficient), and a zero baseline would flatten them to a line. Not clipped
 * at the end of forward flight the way the built-in aero panels are: a
 * coefficient after deployment is what the kernel recorded, and desktop plots
 * it too. A series with no finite sample in any branch is not offered.
 */
export function extraSeries(branches: readonly Branch[]): Meta[] {
  const found = new Set<string>();
  for (const b of branches) {
    for (const [k, v] of Object.entries(b.series)) {
      if (BUILT_IN.has(k) || found.has(k) || !Array.isArray(v)) continue;
      if (v.some((x) => x != null && Number.isFinite(x))) found.add(k);
    }
  }
  const order = (k: string) => seriesColumn(k)?.order ?? Infinity;
  return [...found]
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((key): Meta => {
      const c = seriesColumn(key);
      return {
        key,
        label: c?.labelKey ?? key,
        literal: !c?.labelKey,
        unit: c?.unit ?? '',
        digits: 2,
        ladder: true,
        level: true,
        quantity: c?.quantity,
        scale: c?.scale,
      };
    });
}

/** The preference key a pair is saved under; velocity over altitude keeps its built-in one. */
export const pairKey = (y: string, x: string): string =>
  y === 'velocity' && x === 'altitude' ? 'velocityAltitude' : `xy:${y}:${x}`;

/**
 * The pairs the saved list names (`xy:<y>:<x>`) whose two series this flight
 * can draw (`plain`: the time panels' metas, built-in and added), each as a
 * panel of its own, in the order they were added. A pair whose series this
 * flight did not record is left in the preference and drawn here as nothing,
 * the same rule as an added panel. Its label is built from the two series'
 * names (`traceLabel`), so it reads in the reader's language.
 */
export function pairSeries(saved: readonly string[], plain: readonly Meta[]): Meta[] {
  const byKey = new Map(plain.filter((m) => !m.xy).map((m) => [m.key, m]));
  const out: Meta[] = [];
  for (const key of new Set(saved)) {
    const parts = key.split(':');
    if (parts.length !== 3 || parts[0] !== 'xy') continue;
    const y = byKey.get(parts[1]!);
    const x = byKey.get(parts[2]!);
    if (y && x && y !== x) out.push({ key, label: '', unit: '', digits: 0, xy: { x, y } });
  }
  return out;
}

/**
 * The saved panel choice, narrowed to the panels this flight can draw
 * (`available`: the built-in ones, then the flight's `extraSeries`).
 *
 * A key saved by another version, or one naming a series this flight did not
 * record, stays in the preference and simply draws nothing here, so a flight
 * that lacks a series does not cost the next one its panel. The order is the
 * catalog order, so the panels stack the same way however the preference was
 * written.
 */
export function visibleSeries(saved: readonly string[], available: readonly Meta[] = SERIES): string[] {
  const want = new Set(saved);
  return available.filter((m) => want.has(m.key)).map((m) => m.key);
}

// One color per trace, in series-token order.
// Cycles if a design or a comparison somehow runs past six.
const STAGE_COLORS = [
  token('series-1'),
  token('series-2'),
  token('series-3'),
  token('series-4'),
  token('series-5'),
  token('series-6'),
];

/** The flight to draw, named so the pane can say which simulation it is. */
export interface ChartFlight {
  id: string;
  name: string;
  result: FlightResult;
}

/**
 * One drawn line: a single flight branch, with a stable key, a name and a color.
 *
 * A staged rocket separates into several, and each flies its own trajectory on
 * the same launch clock - a spent booster's climb, descent and landing beside
 * the sustainer's. A single-stage flight collapses to one synthetic branch, so
 * the common case is still one trace.
 */
export type Branch = {
  key: string;
  name: string;
  color: string;
  events: { type: string; time: number }[];
  series: FlightSeries;
};

/**
 * The lines to draw for one flight: one per branch.
 *
 * `stageLabel` renders "Stage 2" for a branch the engine did not name; it is
 * passed in rather than translated here so this stays a pure function.
 *
 * The key carries the simulation id as well as the branch index, so a hidden
 * stage of one flight never hides the same-numbered stage of another; the
 * chart itself is keyed on the simulation id by its host (CenterCanvas), which
 * is what gives a different flight a fresh selection and zoom.
 */
export function buildTraces(
  flight: ChartFlight | null,
  stageLabel: (i: number, name: string | undefined) => string,
): Branch[] {
  if (!flight) return [];
  return flightBranches(flight.result).map((b, i) => ({
    key: `${flight.id}:${i}`,
    name: stageLabel(i, b.name),
    color: STAGE_COLORS[i % STAGE_COLORS.length]!,
    events: b.events ?? [],
    // The derived panels ride as series of their own, so a panel reads them the
    // way it reads any other. A run that lacks their inputs leaves them absent.
    series: {
      ...b.series,
      dynamicPressure: dynamicPressure(b.series) ?? undefined,
      qAlpha: qAlpha(b.series) ?? undefined,
      rollRate: rollRate(b.series) ?? undefined,
    },
  }));
}
