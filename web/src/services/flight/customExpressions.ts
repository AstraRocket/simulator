// Desktop's custom expressions (`OpenRocketDocument.getCustomExpressions`, `<datatypes>`): flight variables the user
// defines, calculated by the engine after each step. They only read the flight.
import type { RocketTree } from '../../engine/openRocketEngine';
import type { Quantity } from '../../prefs/units';
import { isRecord } from '../app/numbers';

export interface CustomExpression {
  name: string;
  /** What other expressions call it. */
  symbol: string;
  unit: string;
  expression: string;
}

/** Wrong symbols and formulas, by the engine's `api/Expressions.java`. */
export type SymbolFault = 'empty' | 'characters' | 'function' | 'taken';
export type FormulaFault = 'empty' | 'characters' | 'formula';

export interface ExpressionFault {
  symbol: SymbolFault | null;
  expression: FormulaFault | null;
}

/** A flight's series key for an expression; no series of the engine's own starts with it. */
export const expressionKey = (symbol: string): string => `$${symbol}`;
export const isExpressionKey = (key: string): boolean => key.startsWith('$');

function isCustomExpression(v: unknown): v is CustomExpression {
  return isRecord(v) && ['name', 'symbol', 'unit', 'expression'].every((k) => typeof v[k] === 'string');
}

export function customExpressionsOf(tree: Pick<RocketTree, 'customExpressions'>): CustomExpression[] {
  const list: unknown = tree.customExpressions;
  return Array.isArray(list) ? list.filter(isCustomExpression) : [];
}

export function withCustomExpressions<T extends RocketTree>(tree: T, list: CustomExpression[]): T {
  const { customExpressions: _old, ...rest } = tree;
  return (list.length ? { ...rest, customExpressions: list } : rest) as T;
}

export const sameExpression = (a: CustomExpression, b: CustomExpression): boolean =>
  a.name === b.name && a.symbol === b.symbol && a.unit === b.unit && a.expression === b.expression;

/** Another design's expressions added after these, less any whose symbol or name is in use. */
export function importExpressions(
  have: readonly CustomExpression[],
  from: readonly CustomExpression[],
): { list: CustomExpression[]; added: number; skipped: number } {
  const list = [...have];
  let skipped = 0;
  for (const e of from) {
    if (list.some((x) => x.symbol === e.symbol || nameKey(x.name) === nameKey(e.name))) skipped++;
    else list.push(e);
  }
  return { list, added: list.length - have.length, skipped };
}

/** Desktop's `FlightDataType.equals`: names that match, ignoring case, share one series there. */
const nameKey = (name: string): string => name.trim().toLowerCase();

/** `CustomExpression.checkName`'s characters. */
const NAME_CHARACTERS = /[,()[\]{}<>#$]/;

export type NameFault = 'empty' | 'characters' | 'taken';

export function nameFault(name: string, taken: readonly string[]): NameFault | null {
  if (!name.trim()) return 'empty';
  if (NAME_CHARACTERS.test(name)) return 'characters';
  return taken.some((x) => nameKey(x) === nameKey(name)) ? 'taken' : null;
}

/** `UnitGroup.SIUNITS`: these units convert to the display units, any other is shown as written. */
const UNIT_QUANTITY: Readonly<Record<string, Quantity>> = {
  m: 'distance',
  'm^2': 'area',
  'm/s': 'velocity',
  'm/s^2': 'acceleration',
  kg: 'mass',
  'kg/m^3': 'density',
  N: 'force',
  Ns: 'impulse',
  Pa: 'pressure',
  K: 'temperature',
};
const UNIT_TEXT: Readonly<Record<string, string>> = {
  'kg m^2': 'kg·m²',
  'N m': 'N·m',
  'kg m/s': 'kg·m/s',
  'kg m^2/s': 'kg·m²/s',
};

export const SI_UNITS: readonly string[] = [
  ...Object.keys(UNIT_QUANTITY),
  ...Object.keys(UNIT_TEXT),
  's',
  'V',
  'A',
  'J',
  'W',
  'Hz',
];

export function expressionUnit(unit: string): { quantity?: Quantity; unit: string } {
  if (Object.hasOwn(UNIT_QUANTITY, unit)) return { quantity: UNIT_QUANTITY[unit], unit: '' };
  return { unit: Object.hasOwn(UNIT_TEXT, unit) ? UNIT_TEXT[unit]! : unit };
}
