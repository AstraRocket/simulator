// cspell:ignore draglookup stabilitylookup draglookupcsv stabilitylookupcsv angleofattack -- OpenRocket .ork element and column names
import { unwrapConditionsChild, wrapConditionsChild } from '../files/ork/passthrough';
import { escapeXml } from '../files/xmlUtil';
import { KeyedError } from '../../i18n/keyedError';

/** A simulation's desktop CSV tables, as `SimulationOptions` passes them to the kernel. */
export interface AeroTables {
  dragLookup?: string[];
  stabilityLookup?: string[];
}

export type AeroTableKind = 'drag' | 'stability';

export const AERO_TABLE_KINDS: readonly AeroTableKind[] = ['drag', 'stability'];

// SimulationConditionsHandler: `<draglookup file="..."><row>..</row></draglookup>`, or the older `*csv` element
// holding only a path on the desktop's disk.
const KINDS: Record<AeroTableKind, { rows: string; path: string; key: keyof AeroTables; columns: readonly string[] }> =
  {
    drag: { rows: 'draglookup', path: 'draglookupcsv', key: 'dragLookup', columns: ['cd'] },
    stability: {
      rows: 'stabilitylookup',
      path: 'stabilitylookupcsv',
      key: 'stabilityLookup',
      columns: ['cn', 'cm', 'cp'],
    },
  };

/** The columns a table of this kind must have besides `mach` (and the optional `aoa`). */
export const aeroTableColumns = (kind: AeroTableKind): readonly string[] => KINDS[kind].columns;

// Illustrative values only: what a file looks like, not data for any rocket.
const EXAMPLES: Record<AeroTableKind, readonly string[]> = {
  drag: ['mach,cd', '0.1,0.45', '0.8,0.48', '1.2,0.65'],
  stability: ['mach,aoa,cn,cm,cp', '0.3,0,0,0,0.62', '0.3,5,1.1,0.68,0.62', '0.8,5,1.2,0.77,0.64'],
};

/** A short sample of a table of this kind, in the form an upload takes. */
export const aeroTableExample = (kind: AeroTableKind): readonly string[] => EXAMPLES[kind];

/** A table a simulation carries: the CSV file it came from, and how many rows the file holds (0: a path only). */
export interface AeroTableSource {
  file: string;
  rows: number;
}

interface Read {
  tables: AeroTables;
  sources: Partial<Record<AeroTableKind, AeroTableSource>>;
}

/** Rows as upstream `CsvLookupHandler` collects them: each `<row>` trimmed, blank ones dropped. */
export function lookupRows(el: Element): string[] {
  return [...el.children]
    .filter((c) => c.tagName.toLowerCase() === 'row')
    .map((c) => (c.textContent ?? '').trim())
    .filter((r) => r !== '');
}

// Keyed by the array: a simulation's `xmlExtra` is replaced, never mutated.
const readCache = new WeakMap<readonly string[], Read>();

function readOf(xmlExtra: readonly string[] | undefined): Read {
  if (!xmlExtra?.length) return { tables: {}, sources: {} };
  let read = readCache.get(xmlExtra);
  if (!read) {
    read = readTables(xmlExtra);
    readCache.set(xmlExtra, read);
  }
  return read;
}

/** The `<draglookup>` / `<stabilitylookup>` rows an imported simulation carries in its passthrough. */
export const aeroTablesOf = (xmlExtra: readonly string[] | undefined): AeroTables => readOf(xmlExtra).tables;

/** Each table a simulation carries, readable here or not. */
export const aeroTableSources = (
  xmlExtra: readonly string[] | undefined,
): Partial<Record<AeroTableKind, AeroTableSource>> => readOf(xmlExtra).sources;

function kindOfTag(tag: string): { kind: AeroTableKind; rowsTag: boolean } | null {
  for (const kind of AERO_TABLE_KINDS) {
    if (tag === KINDS[kind].rows) return { kind, rowsTag: true };
    if (tag === KINDS[kind].path) return { kind, rowsTag: false };
  }
  return null;
}

function readTables(xmlExtra: readonly string[]): Read {
  const out: Read = { tables: {}, sources: {} };
  for (const raw of xmlExtra) {
    const inner = unwrapConditionsChild(raw);
    if (inner === null) continue;
    const el = new DOMParser().parseFromString(inner, 'application/xml').documentElement;
    const found = kindOfTag(el.tagName.toLowerCase());
    if (!found) continue;
    const { kind, rowsTag } = found;
    const rows = rowsTag ? lookupRows(el) : [];
    const file = (rowsTag ? el.getAttribute('file') : el.textContent)?.trim() ?? '';
    // Rows win over a path, as in `CsvLookupHandler`.
    if (rows.length) out.tables[KINDS[kind].key] = rows;
    if (rows.length || (file && !out.sources[kind]?.rows)) out.sources[kind] = { file, rows: rows.length };
  }
  return out;
}

const tagOf = (raw: string): string | null => {
  const inner = unwrapConditionsChild(raw);
  return inner === null ? null : (/^<([A-Za-z_][\w.-]*)/.exec(inner)?.[1]?.toLowerCase() ?? null);
};

/**
 * `xmlExtra` with this kind's table replaced by `table`, or removed when null, in the form desktop
 * `OpenRocketSaver.writeCsvLookup` writes. The `file` attribute keeps desktop from warning that the rows have no file.
 */
export function withAeroTable(
  xmlExtra: readonly string[] | undefined,
  kind: AeroTableKind,
  table: { file: string; rows: readonly string[] } | null,
): string[] | undefined {
  const rest = (xmlExtra ?? []).filter((raw) => {
    const tag = tagOf(raw);
    return tag === null || kindOfTag(tag)?.kind !== kind;
  });
  if (table) {
    const tag = KINDS[kind].rows;
    const rows = table.rows.map((r) => `<row>${escapeXml(r)}</row>`).join('');
    rest.push(wrapConditionsChild(`<${tag} file="${escapeXml(table.file)}">${rows}</${tag}>`));
  }
  return rest.length ? rest : undefined;
}

// Upstream `CsvLookupHandler.detectSeparator`, over the first row.
function separatorOf(first: string): string {
  const count = (ch: string) => first.split(ch).length - 1;
  const comma = count(',');
  const semicolon = count(';');
  const tab = count('\t');
  if (comma >= semicolon && comma >= tab && comma > 0) return ',';
  if (semicolon >= tab && semicolon > 0) return ';';
  if (tab > 0) return '\t';
  return ',';
}

// `MachAoALookup.normalize`, with `CsvMachAoALookup`'s angleofattack alias.
const normalize = (h: string): string => {
  const n = h.trim().toLowerCase().replace(/[\s_]/g, '');
  return n === 'angleofattack' ? 'aoa' : n;
};

// What `Double.parseDouble` takes, short of hex: Java's kernel reads the same cells.
const JAVA_DOUBLE = /^[+-]?(NaN|Infinity|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?)$/;

// `CsvMachAoALookup.parseHeader`: the first of a repeated column counts.
function headerOf(cells: readonly string[], required: readonly string[]): Map<string, number> {
  const header = new Map<string, number>();
  cells.forEach((c, j) => {
    const n = normalize(c);
    if (n && !header.has(n)) header.set(n, j);
  });
  if (!header.has('mach')) throw new KeyedError('errors.aeroTable.missingMach');
  const missing = required.find((c) => !header.has(c));
  if (missing) throw new KeyedError('errors.aeroTable.missingColumn', { column: missing });
  return header;
}

/**
 * A CSV file's rows checked as upstream `CsvMachAoALookup.parse` would read them: a header naming `mach` and
 * the kind's columns, then numeric rows. Throws a `KeyedError` naming the first problem.
 */
export function aeroTableRows(text: string, kind: AeroTableKind): string[] {
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim());
  const rows = lines.filter((l) => l !== '');
  const sep = separatorOf(rows[0] ?? '');
  const required = KINDS[kind].columns;
  let header: Map<string, number> | null = null;
  let data = 0;
  for (const [i, line] of lines.entries()) {
    if (line === '' || line.startsWith('#')) continue;
    const cells = line.split(sep);
    if (!header) {
      // The kernel takes the separator from the first line, comment or not: a semicolon or tab file opening
      // with a comment reads as one column, so name the cause rather than the missing mach.
      if (cells.length === 1 && rows[0]?.startsWith('#') && /[;\t]/.test(line))
        throw new KeyedError('errors.aeroTable.commentFirst');
      header = headerOf(cells, required);
      continue;
    }
    for (const column of ['mach', ...(header.has('aoa') ? ['aoa'] : []), ...required]) {
      const at = header.get(column);
      const cell = at === undefined ? undefined : cells[at]?.trim();
      if (cell === undefined) throw new KeyedError('errors.aeroTable.missingValue', { column, line: i + 1 });
      if (!JAVA_DOUBLE.test(cell))
        throw new KeyedError('errors.aeroTable.badValue', { value: cell, column, line: i + 1 });
    }
    data++;
  }
  if (!header) throw new KeyedError('errors.aeroTable.missingHeader');
  if (!data) throw new KeyedError('errors.aeroTable.noData');
  return rows;
}

/** This kind's rows in `tables`. */
export const aeroTableOf = (tables: AeroTables, kind: AeroTableKind): string[] | undefined => tables[KINDS[kind].key];

/** Rows split into cells as the kernel reads them, comments dropped: the header, then the data. */
export function aeroTableGrid(rows: readonly string[]): { header: string[]; body: string[][] } {
  const sep = separatorOf(rows[0] ?? '');
  const [header = [], ...body] = rows.filter((r) => !r.startsWith('#')).map((r) => r.split(sep).map((c) => c.trim()));
  return { header, body };
}

export type Span = readonly [min: number, max: number];

/** The Mach and (when the table has one) angle-of-attack span a table covers; AoA in degrees. */
export interface AeroTableRange {
  mach: Span;
  aoa?: Span;
}

function spanOf(body: readonly string[][], at: number | undefined): Span | undefined {
  if (at === undefined) return undefined;
  const values = body.map((cells) => Number(cells[at])).filter(Number.isFinite);
  return values.length ? [Math.min(...values), Math.max(...values)] : undefined;
}

export function aeroTableRange(rows: readonly string[]): AeroTableRange | null {
  const { header, body } = aeroTableGrid(rows);
  const at = (name: string) => {
    const i = header.findIndex((h) => normalize(h) === name);
    return i < 0 ? undefined : i;
  };
  const mach = spanOf(body, at('mach'));
  if (!mach) return null;
  const aoa = spanOf(body, at('aoa'));
  return aoa ? { mach, aoa } : { mach };
}

/** A flight past the edge of a table it flew, where `MachAoALookup` holds the edge values. */
export interface AeroRangeFinding {
  kind: AeroTableKind;
  quantity: 'mach' | 'aoa';
  /** The table's upper end and the flight's peak; AoA in degrees. */
  max: number;
  flown: number;
}

/**
 * Where a flight went past the top of a table. Only the top: every flight starts at Mach 0, so a table
 * starting above it is held at its first row on the pad, as desktop does, and that is no surprise.
 */
export function aeroRangeFindings(
  tables: AeroTables,
  flight: { maxMach: number; maxAoaDeg: number | null },
): AeroRangeFinding[] {
  const out: AeroRangeFinding[] = [];
  for (const kind of AERO_TABLE_KINDS) {
    const rows = aeroTableOf(tables, kind);
    const range = rows && aeroTableRange(rows);
    if (!range) continue;
    if (flight.maxMach > range.mach[1]) out.push({ kind, quantity: 'mach', max: range.mach[1], flown: flight.maxMach });
    if (range.aoa && flight.maxAoaDeg != null && flight.maxAoaDeg > range.aoa[1])
      out.push({ kind, quantity: 'aoa', max: range.aoa[1], flown: flight.maxAoaDeg });
  }
  return out;
}

export const hasAeroTables = (t: AeroTables): boolean => !!(t.dragLookup || t.stabilityLookup);

/** The i18n key naming what computes drag and stability for a flight with these tables. */
export function calcMethodKey(t: AeroTables): string {
  if (t.dragLookup && t.stabilityLookup) return 'settings.calcMethodTables';
  if (t.dragLookup) return 'settings.calcMethodDragTable';
  if (t.stabilityLookup) return 'settings.calcMethodStabilityTable';
  return 'settings.calcMethodValue';
}
