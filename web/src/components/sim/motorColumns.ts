import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { avgThrustOf as avgOf, ispOf, massFracOf } from '../../services/motors/motorMath';
import { fmtNum, fmtPercent } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { motorTypeLabel } from './motorFormat';
import type { Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import { nsKey } from '../../services/storage/storageKeys';
import { readLocalJson, writeLocalJson } from '../../services/storage/localPref';
import { motorName } from '../../services/motors/motorName';
import { CATALOG_TO_SI } from '../../services/motors/catalogUnits';
import { usePersistedState } from '../common/usePersistedState';

/**
 * The motor dashboard's column table: every column the grid can show, how each
 * one formats and sorts, the persisted choice of visible columns, and the
 * header/alignment helpers the grid and the compare table share.
 */

/** Format a numeric cell to `d` decimals, or a dash when absent / non-finite. */
const fmtCell = (v: number | undefined, d: number) => (v != null && Number.isFinite(v) ? fmtNum(v, d) : NO_VALUE);

export interface Col {
  id: string;
  label: string; // i18n suffix under `dash.*`
  align: 'left' | 'center' | 'right';
  always?: boolean;
  cell: (m: CatalogMotor, u: Units, t: TFunction) => string;
  /** Sort key; omit for a column that does not sort. NaN or '' means unknown, which sorts last. */
  sortVal?: (m: CatalogMotor) => number | string;
  /**
   * Preference group for the column's unit. The header appends its symbol, so
   * the labels stay unitless; a column with a fixed unit (seconds, a percent)
   * keeps it in the label instead. Each `cell` lifts the catalog's own units
   * (mm / g, see CatalogMotor) to SI first.
   */
  quantity?: Quantity;
}

/** Column heading: the unitless label, plus the unit the column is shown in. */
export const heading = (c: Col, t: TFunction, u: Units): string =>
  c.quantity ? `${t(`dash.${c.label}`)} ${u.sym(c.quantity)}` : t(`dash.${c.label}`);

/**
 * A catalog value in the user's unit, the catalog's mm/g lifted to SI first.
 * `d` fixes the decimals; absent, the magnitude ladder of the value as shown
 * picks them, as the detail pane does, so a 29 mm motor reads 1.14 in rather
 * than 1 in beside every 13 to 38 mm one.
 */
const cell = (u: Units, q: Quantity, v: number | undefined, siScale: number, d?: number): string =>
  v != null && Number.isFinite(v) ? u.fmt(q, v * siScale, d) : NO_VALUE;

// Every column the grid can show. `always` = the anchor (Motor), never hidden.
export const COLUMNS: Col[] = [
  {
    id: 'designation',
    label: 'colMotor',
    align: 'left',
    always: true,
    cell: (m) => m.designation,
    sortVal: (m) => m.designation,
  },
  { id: 'manufacturer', label: 'colMfr', align: 'left', cell: (m) => m.manufacturer, sortVal: (m) => m.manufacturer },
  { id: 'class', label: 'colClass', align: 'center', cell: (m) => m.class, sortVal: (m) => m.class },
  {
    id: 'diameter',
    label: 'colDia',
    align: 'right',
    quantity: 'motorDimensions',
    cell: (m, u) => cell(u, 'motorDimensions', m.diameter, CATALOG_TO_SI),
    sortVal: (m) => m.diameter,
  },
  {
    id: 'impulse',
    label: 'colImpulse',
    align: 'right',
    quantity: 'impulse',
    cell: (m, u) => cell(u, 'impulse', m.impulse, 1),
    sortVal: (m) => m.impulse,
  },
  {
    id: 'avg',
    label: 'colAvg',
    align: 'right',
    quantity: 'force',
    cell: (m, u) => cell(u, 'force', avgOf(m), 1, 0),
    sortVal: (m) => avgOf(m),
  },
  {
    id: 'peak',
    label: 'colPeak',
    align: 'right',
    quantity: 'force',
    cell: (m, u) => cell(u, 'force', m.maxThrust, 1, 0),
    sortVal: (m) => m.maxThrust ?? NaN,
  },
  { id: 'burn', label: 'colBurn', align: 'right', cell: (m) => fmtNum(m.burn, 1), sortVal: (m) => m.burn },
  {
    id: 'length',
    label: 'colLength',
    align: 'right',
    quantity: 'motorDimensions',
    cell: (m, u) => cell(u, 'motorDimensions', m.length, CATALOG_TO_SI),
    sortVal: (m) => m.length ?? NaN,
  },
  {
    id: 'mass',
    label: 'colMass',
    align: 'right',
    quantity: 'mass',
    cell: (m, u) => cell(u, 'mass', m.mass, CATALOG_TO_SI),
    sortVal: (m) => m.mass ?? NaN,
  },
  {
    id: 'prop',
    label: 'colProp',
    align: 'right',
    quantity: 'mass',
    cell: (m, u) => cell(u, 'mass', m.propWeightG, CATALOG_TO_SI),
    sortVal: (m) => m.propWeightG ?? NaN,
  },
  { id: 'delays', label: 'colDelays', align: 'center', cell: (m) => m.delays ?? NO_VALUE },
  {
    id: 'type',
    label: 'colType',
    align: 'center',
    cell: (m, _u, t) => (m.type ? motorTypeLabel(m.type, t) : NO_VALUE),
    sortVal: (m) => m.type ?? '',
  },
  {
    id: 'code',
    label: 'colCode',
    align: 'left',
    cell: (m) => motorName(m),
    sortVal: (m) => motorName(m),
  },
  { id: 'isp', label: 'colIsp', align: 'right', cell: (m) => fmtCell(ispOf(m), 0), sortVal: (m) => ispOf(m) },
  {
    id: 'massFrac',
    label: 'colMassFrac',
    align: 'right',
    cell: (m) => fmtPercent(massFracOf(m)),
    sortVal: (m) => massFracOf(m),
  },
  {
    id: 'sparky',
    label: 'colSparky',
    align: 'center',
    cell: (m, _u, t) => (m.sparky ? t('motorDlg.yes') : NO_VALUE),
    sortVal: (m) => (m.sparky ? 1 : 0),
  },
  {
    id: 'curves',
    label: 'colCurves',
    align: 'right',
    cell: (m) => String(m.curves?.length ?? 0),
    sortVal: (m) => m.curves?.length ?? 0,
  },
];
const DEFAULT_COLS = ['designation', 'manufacturer', 'class', 'diameter', 'impulse', 'avg', 'burn'];
export const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

// The chosen columns persist across sessions.
const COLS_KEY = nsKey('motorDash:cols');
const isColumnList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');
const loadCols = (): string[] => readLocalJson(COLS_KEY, isColumnList, DEFAULT_COLS);
const saveCols = (ids: string[]): void => void writeLocalJson(COLS_KEY, ids);

/** The user's column choice (persisted) and the columns to render from it. */
export function useVisibleColumns() {
  const [visCols, setVisCols] = usePersistedState<string[]>(loadCols, saveCols);

  // Columns to render, in canonical COLUMNS order regardless of toggle order.
  const cols = useMemo(() => COLUMNS.filter((c) => c.always || visCols.includes(c.id)), [visCols]);
  const toggleCol = (id: string) =>
    setVisCols((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return { visCols, cols, toggleCol };
}
