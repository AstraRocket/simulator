import type { FlightResult, FlightSummary, AeroSweep } from '../../engine/openRocketEngine';
import {
  branchSeries,
  defaultCsvFormat,
  flightColumns,
  usableColumns,
  type FlightColumn,
  type CsvFormat,
} from '../flight/flightColumns';
import { forwardFlightEnd, maxQ, maxQAlpha, maxRollRate, type EventRow } from '../flight/flightEvents';
import type { GuideRow } from '../flight/motorGuide';
import type { SimpleGuideRow } from '../flight/simpleRocket';
import type { CatalogMotor } from '../motors/motorDb';
import { avgThrustOf } from '../motors/motorMath';
import { withLauncher, type LauncherKind } from '../design/launcher';
import { siToUi, siToUiDelta, type Quantity, type UnitSelection } from '../../prefs/units';
import { plainDecimal } from '../files/numberText';
import { csvField, csvQuoted, neutralizeFormula } from './csvCell';
import { componentName, isDefaultComponentName } from '../app/warningText';

const EOL = '\r\n';

const cell = (v: number | null | undefined, digits?: number): string => {
  if (v == null || !Number.isFinite(v)) return '';
  return digits == null ? plainDecimal(v, 6) : v.toFixed(digits);
};
const mul = (v: number | null | undefined, f: number): number | null =>
  v == null || !Number.isFinite(v) ? null : v * f;
const row = (cells: (string | number)[]): string => cells.join(',');

export type CsvTranslate = (key: string, vars?: Record<string, unknown>) => string;

const titled = (title: string, unit?: string): string => csvField(unit ? `${title} (${unit})` : title);

const textCell = (v: string): string => csvQuoted(v.replace(/[\r\n]+/g, ' '));

type UnitCol = { f: number; sym: string };

const col = (units: UnitSelection, q: Quantity): UnitCol => ({
  f: siToUiDelta(q, units[q], 1),
  sym: units[q],
});

export interface FlightCsvOptions extends Omit<CsvFormat, 'columns'> {
  columns: readonly string[];
  branchIndex: number;
  columnName: (c: FlightColumn) => string;
}

const DEFAULT_CSV_OPTIONS: FlightCsvOptions = {
  ...defaultCsvFormat(),
  branchIndex: 0,
  columnName: (c) => c.key,
};

function value(v: number | null | undefined, o: FlightCsvOptions): string {
  if (v == null || !Number.isFinite(v)) return '';
  return o.exponential ? v.toExponential(o.decimals) : v.toFixed(o.decimals);
}

/** Layout matches OpenRocket's CSV export so its parsers read this file too. */
export function flightDataCsv(
  r: FlightResult,
  units: UnitSelection,
  opts: Partial<FlightCsvOptions> = {},
  name?: string,
): string {
  const o: FlightCsvOptions = { ...DEFAULT_CSV_OPTIONS, ...opts };
  const cols = usableColumns(flightColumns(r, o.branchIndex), o.columns);
  const series = branchSeries(r, o.branchIndex);
  const branch = r.branches?.length ? r.branches[o.branchIndex] : undefined;
  const sep = o.separator;
  // Headers are never quoted, so every possible separator becomes a space (Excel uses its locale's).
  const clean = (text: string) => {
    const flat = text
      .split(sep)
      .join(' ')
      .replace(/[\r\n,;\t]/g, ' ');
    return sep === ' ' ? flat.split(' ').map(neutralizeFormula).join(' ') : neutralizeFormula(flat);
  };

  const unitOf = (c: (typeof cols)[number]): string => (c.quantity ? units[c.quantity] : (c.unit ?? ''));
  // A unit with an offset (°C, °F) needs `siToUi`: a multiplier drops the offset.
  const convertOf = (c: (typeof cols)[number]): ((si: number) => number) => {
    const q = c.quantity;
    if (q && siToUi(q, units[q], 0) !== 0) {
      const sym = units[q];
      return (si) => siToUi(q, sym, si);
    }
    const f = q ? siToUiDelta(q, units[q], 1) : (c.scale ?? 1);
    return (si) => si * f;
  };
  const converters = cols.map(convertOf);

  const lines: string[] = [];
  const comment = (text: string) => lines.push(`${o.commentChar} ${text}`);
  const n = series?.['time']?.length ?? 0;

  if (o.simDescription && name) comment(`Simulation: ${clean(name)}`);
  // A default stage name is a lookup key, not text.
  if (o.simDescription && branch?.name)
    comment(`Stage: ${isDefaultComponentName(branch.name.trim()) ? `Stage ${o.branchIndex + 1}` : clean(branch.name)}`);
  if (o.simDescription) comment(`${n} data points written for ${cols.length} variables.`);
  if (o.simDescription && o.fieldDescriptions) lines.push(o.commentChar);
  if (o.fieldDescriptions) {
    comment(
      cols
        .map((c) => {
          const u = unitOf(c);
          return clean(o.columnName(c)) + (u ? ` (${u})` : '');
        })
        .join(sep),
    );
  }

  const events = o.flightEvents ? [...(branch?.events ?? r.events ?? [])].sort((a, b) => a.time - b.time) : [];
  const time = series?.['time'];
  let next = 0;
  const eventsUpTo = (t: number) => {
    while (next < events.length && events[next]!.time <= t) {
      const e = events[next++]!;
      comment(`Event ${e.type} occurred at t=${plainDecimal(e.time, 3)} seconds`);
    }
  };
  if (!time) eventsUpTo(Infinity);

  for (let i = 0; i < n; i++) {
    const t = time?.[i];
    if (t != null && Number.isFinite(t)) eventsUpTo(t);
    lines.push(
      cols
        .map((c, j) => {
          const raw = (series as Record<string, (number | null)[] | undefined>)[c.key]?.[i];
          return value(raw == null ? null : converters[j]!(raw), o);
        })
        .join(sep),
    );
  }
  eventsUpTo(Infinity);
  return lines.join(EOL) + EOL;
}

export function aeroTableCsv(d: AeroSweep, units: UnitSelection): string {
  const len = col(units, 'length');
  // `Cd_` blocks a leading trigger, but an embedded separator still needs `csvField`.
  const compHeader = (name: string) => `Cd_${name.replace(/[[\]]/g, '').replace(/[\r\n]+/g, ' ')}`;
  const header = ['Mach', 'Cd', 'Cd_friction', 'Cd_pressure', 'Cd_base'];
  if (d.hasNozzle) header.push('Cd_powerOn');
  header.push(`CP (${len.sym})`, 'CNalpha (/rad)');
  const seen = new Map<string, number>();
  for (const c of d.components) {
    const base = compHeader(c.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    header.push(n > 1 ? `${base} (${n})` : base);
  }

  const lines = [row(header.map((h) => csvField(h)))];
  for (let i = 0; i < d.machs.length; i++) {
    const cells: string[] = [
      cell(d.machs[i], 3),
      cell(d.powerOff.total[i]),
      cell(d.powerOff.friction[i]),
      cell(d.powerOff.pressure[i]),
      cell(d.powerOff.base[i]),
    ];
    if (d.hasNozzle) cells.push(cell(d.powerOn.total[i]));
    cells.push(cell(mul(d.cp[i], len.f)));
    cells.push(cell(d.cna[i]));
    for (const c of d.components) cells.push(cell(c.cd[i]));
    lines.push(row(cells));
  }
  return lines.join(EOL) + EOL;
}

export function flightEventsCsv(
  rows: readonly EventRow[],
  units: UnitSelection,
  t: CsvTranslate,
  eventName: (row: EventRow) => string,
  stageName: (row: EventRow) => string,
  name?: string,
): string {
  const dist = col(units, 'distance');
  const vel = col(units, 'velocity');
  const ang = col(units, 'angle');
  const pres = col(units, 'pressure');
  const text = (v: string | undefined): string => (v ? textCell(v) : '');

  const lines: string[] = [];
  if (name) lines.push(`# ${t('csv.head.simulationLine', { name }).replace(/[\r\n,;\t]+/g, ' ')}`);
  lines.push(
    row([
      titled(t('csv.head.time'), 's'),
      titled(t('csv.head.event')),
      titled(t('csv.head.source')),
      titled(t('csv.head.stage')),
      titled(t('csv.head.altitude'), dist.sym),
      titled(t('csv.head.velocity'), vel.sym),
      titled(t('csv.head.stability'), t('stability.caliber')),
      titled(t('csv.head.thrustWeight')),
      titled(t('csv.head.aoa'), ang.sym),
      titled(t('csv.head.mach')),
      titled(t('csv.head.dynamicPressure'), pres.sym),
    ]),
  );
  for (const r of rows) {
    lines.push(
      row([
        cell(r.time, 3),
        text(eventName(r)),
        text(r.source && componentName(r.source, t)),
        text(stageName(r)),
        cell(mul(r.altitude, dist.f)),
        cell(mul(r.velocity, vel.f)),
        cell(r.stability),
        cell(r.twr),
        cell(mul(r.aoa, ang.f)),
        cell(r.mach),
        cell(mul(r.q, pres.f)),
      ]),
    );
  }
  return lines.join(EOL) + EOL;
}

export interface RunTableRow {
  name: string;
  configuration: string;
  motors: string;
  status: string;
  result?: FlightResult | null;
  fileSummary?: FlightSummary;
}

function peakColumns(units: UnitSelection, t: CsvTranslate, launcher: LauncherKind | null) {
  return {
    lt: withLauncher(t, launcher),
    dist: col(units, 'distance'),
    vel: col(units, 'velocity'),
    acc: col(units, 'acceleration'),
  };
}

function peakHeads(t: CsvTranslate, c: ReturnType<typeof peakColumns>): string[] {
  return [
    titled(t('csv.head.apogee'), c.dist.sym),
    titled(t('csv.head.maxVelocity'), c.vel.sym),
    titled(t('csv.head.maxAcceleration'), c.acc.sym),
    titled(t('csv.head.maxMach')),
    titled(c.lt('csv.head.exitVelocity'), c.vel.sym),
  ];
}

export function runTableCsv(
  rows: readonly RunTableRow[],
  units: UnitSelection,
  t: CsvTranslate,
  launcher: LauncherKind | null = null,
): string {
  const c = peakColumns(units, t, launcher);
  const { dist, vel, acc } = c;
  const pres = col(units, 'pressure');
  const ang = col(units, 'angle');
  const roll = col(units, 'rollRate');
  const text = textCell;
  const lines = [
    row([
      titled(t('csv.head.simulation')),
      titled(t('csv.head.configuration')),
      titled(t('csv.head.motors')),
      titled(t('csv.head.status')),
      ...peakHeads(t, c),
      titled(t('csv.head.timeToApogee'), 's'),
      titled(t('csv.head.flightTime'), 's'),
      titled(t('csv.head.deploymentVelocity'), vel.sym),
      titled(t('csv.head.landingVelocity'), vel.sym),
      titled(t('csv.head.optimumDelay'), 's'),
      titled(t('csv.head.maxQ'), pres.sym),
      titled(t('csv.head.maxQAlpha'), `${pres.sym}·${ang.sym}`),
      titled(t('csv.head.maxRollRate'), roll.sym),
    ]),
  ];
  for (const r of rows) {
    const s = r.result?.summary ?? r.fileSummary;
    const series = r.result?.series;
    const qa = r.result ? maxQAlpha(series, forwardFlightEnd(r.result)) : null;
    lines.push(
      row([
        text(r.name),
        text(r.configuration),
        text(r.motors),
        text(r.status),
        cell(mul(s?.maxAltitude, dist.f)),
        cell(mul(s?.maxVelocity, vel.f)),
        cell(mul(s?.maxAcceleration, acc.f)),
        cell(s?.maxMachNumber),
        cell(mul(s?.launchRodVelocity, vel.f)),
        cell(s?.timeToApogee),
        cell(s?.flightTime),
        cell(mul(s?.deploymentVelocity, vel.f)),
        cell(mul(s?.groundHitVelocity, vel.f)),
        cell(s?.optimumDelay),
        cell(mul(maxQ(series)?.q, pres.f)),
        cell(mul(qa?.value, pres.f * ang.f)),
        cell(mul(maxRollRate(series), roll.f)),
      ]),
    );
  }
  return lines.join(EOL) + EOL;
}

interface GuideMotorCells {
  motor: string;
  manufacturer: string;
  delay: string;
  row: { motor: CatalogMotor };
}

const motorHeads = (t: CsvTranslate, imp: UnitCol, force: UnitCol): string[] => [
  titled(t('csv.head.motor')),
  titled(t('csv.head.manufacturer')),
  titled(t('csv.head.delay'), 's'),
  titled(t('csv.head.totalImpulse'), imp.sym),
  titled(t('csv.head.avgThrust'), force.sym),
];

const motorCells = (r: GuideMotorCells, imp: UnitCol, force: UnitCol): string[] => [
  textCell(r.motor),
  textCell(r.manufacturer),
  textCell(r.delay),
  cell(mul(r.row.motor.impulse, imp.f)),
  cell(mul(avgThrustOf(r.row.motor), force.f)),
];

export interface GuideTableRow {
  motor: string;
  manufacturer: string;
  delay: string;
  status: string;
  row: GuideRow;
}

export function motorGuideCsv(
  rows: readonly GuideTableRow[],
  units: UnitSelection,
  t: CsvTranslate,
  launcher: LauncherKind | null = null,
): string {
  const imp = col(units, 'impulse');
  const force = col(units, 'force');
  const c = peakColumns(units, t, launcher);
  const { dist, vel, acc } = c;
  const text = textCell;
  const lines = [
    row([
      ...motorHeads(t, imp, force),
      titled(t('csv.head.burnTime'), 's'),
      titled(t('csv.head.optimumDelay'), 's'),
      ...peakHeads(t, c),
      titled(t('csv.head.railMargin'), t('stability.caliber')),
      titled(t('csv.head.thrustWeight')),
      titled(t('csv.head.timeToApogee'), 's'),
      titled(t('csv.head.deploymentVelocity'), vel.sym),
      titled(t('csv.head.landingVelocity'), vel.sym),
      titled(t('csv.head.status')),
    ]),
  ];
  for (const r of rows) {
    const g = r.row;
    lines.push(
      row([
        ...motorCells(r, imp, force),
        cell(g.motor.burn),
        cell(g.optimumDelay),
        cell(mul(g.apogee, dist.f)),
        cell(mul(g.maxVelocity, vel.f)),
        cell(mul(g.maxAcceleration, acc.f)),
        cell(g.maxMach),
        cell(mul(g.railExit, vel.f)),
        cell(g.railMargin),
        cell(g.railTwr),
        cell(g.timeToApogee),
        cell(mul(g.deployVelocity, vel.f)),
        cell(mul(g.landingVelocity, vel.f)),
        text(r.status),
      ]),
    );
  }
  return lines.join(EOL) + EOL;
}

export const CSV_MIME = 'text/csv;charset=utf-8';

export interface SimpleGuideTableRow {
  motor: string;
  manufacturer: string;
  delay: string;
  status: string;
  row: SimpleGuideRow;
}

export function simpleGuideCsv(rows: readonly SimpleGuideTableRow[], units: UnitSelection, t: CsvTranslate): string {
  const dist = col(units, 'distance');
  const vel = col(units, 'velocity');
  const acc = col(units, 'acceleration');
  const imp = col(units, 'impulse');
  const force = col(units, 'force');
  const has = (k: 'railStability' | 'deployVelocity' | 'landingVelocity') => rows.some((r) => r.row.figures[k] != null);
  const stability = has('railStability');
  const descent = has('landingVelocity');
  const lines = [
    row([
      ...motorHeads(t, imp, force),
      titled(t('csv.head.exitVelocity'), vel.sym),
      titled(t('csv.head.thrustWeight')),
      titled(t('csv.head.maxAcceleration'), acc.sym),
      titled(t('csv.head.apogee'), dist.sym),
      titled(t('csv.head.maxVelocity'), vel.sym),
      titled(t('csv.head.maxMach')),
      titled(t('csv.head.timeToApogee'), 's'),
      titled(t('csv.head.optimumDelay'), 's'),
      ...(stability ? [titled(t('csv.head.railMargin'), t('stability.caliber'))] : []),
      ...(descent
        ? [
            titled(t('csv.head.deploymentVelocity'), vel.sym),
            titled(t('csv.head.landingVelocity'), vel.sym),
            titled(t('csv.head.flightTime'), 's'),
          ]
        : []),
      titled(t('csv.head.status')),
    ]),
  ];
  for (const r of rows) {
    const g = r.row;
    const f = g.figures;
    lines.push(
      row([
        ...motorCells(r, imp, force),
        cell(mul(f.railExit, vel.f)),
        cell(f.railTwr),
        cell(mul(f.maxAcceleration, acc.f)),
        cell(mul(f.apogee, dist.f)),
        cell(mul(f.maxVelocity, vel.f)),
        cell(f.maxMach),
        cell(f.timeToApogee),
        cell(f.optimumDelay),
        ...(stability ? [cell(f.railStability)] : []),
        ...(descent
          ? [cell(mul(f.deployVelocity, vel.f)), cell(mul(f.landingVelocity, vel.f)), cell(f.flightTime)]
          : []),
        textCell(r.status),
      ]),
    );
  }
  return lines.join(EOL) + EOL;
}
