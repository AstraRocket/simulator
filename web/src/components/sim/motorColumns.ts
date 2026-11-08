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

const fmtCell = (v: number | undefined, d: number) => (v != null && Number.isFinite(v) ? fmtNum(v, d) : NO_VALUE);

export interface Col {
  id: string;
  label: string;
  align: 'left' | 'center' | 'right';
  always?: boolean;
  cell: (m: CatalogMotor, u: Units, t: TFunction) => string;
  /** NaN or '' means unknown, which sorts last. */
  sortVal?: (m: CatalogMotor) => number | string;
  /** Each `cell` lifts the catalog's mm / g to SI first. */
  quantity?: Quantity;
}

export const heading = (c: Col, t: TFunction, u: Units): string =>
  c.quantity ? `${t(`dash.${c.label}`)} ${u.sym(c.quantity)}` : t(`dash.${c.label}`);

/** `siScale` lifts the catalog's mm/g to SI. */
const cell = (u: Units, q: Quantity, v: number | undefined, siScale: number, d?: number): string =>
  v != null && Number.isFinite(v) ? u.fmt(q, v * siScale, d) : NO_VALUE;

export const COLUMNS: Col[] = [
  {
    id: 'designation',
    label: 'colMotor',
    align: 'left',
    always: true,
    // Full designation (`H128W`): the common name cannot tell propellants apart.
    cell: (m) => motorName(m),
    sortVal: (m) => motorName(m),
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
    // The id `code` must stay stable for saved column choices.
    id: 'code',
    label: 'colCode',
    align: 'left',
    cell: (m) => m.designation,
    sortVal: (m) => m.designation,
  },
  {
    id: 'propellant',
    label: 'colPropellant',
    align: 'left',
    cell: (m) => m.propInfo ?? NO_VALUE,
    sortVal: (m) => m.propInfo ?? '',
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

const COLS_KEY = nsKey('motorDash:cols');
const isColumnList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');
const loadCols = (): string[] => readLocalJson(COLS_KEY, isColumnList, DEFAULT_COLS);
const saveCols = (ids: string[]): void => void writeLocalJson(COLS_KEY, ids);

export function useVisibleColumns() {
  const [visCols, setVisCols] = usePersistedState<string[]>(loadCols, saveCols);

  const cols = useMemo(() => COLUMNS.filter((c) => c.always || visCols.includes(c.id)), [visCols]);
  const toggleCol = (id: string) =>
    setVisCols((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return { visCols, cols, toggleCol };
}
