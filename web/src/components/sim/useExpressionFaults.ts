import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEngineStore } from '../../state/engineStore';
import { checkExpressions } from '../../engine/openRocketEngine';
import {
  nameFault,
  type CustomExpression,
  type ExpressionFault,
  type FormulaFault,
  type NameFault,
  type SymbolFault,
} from '../../services/flight/customExpressions';
import { EXPRESSION_VARIABLES } from '../../services/flight/expressionVocabulary';

// An empty box needs no message: Save waits for it.
const NAME_FAULT: Record<NameFault, string | null> = {
  empty: null,
  characters: 'expressions.fault.nameCharacters',
  taken: 'expressions.fault.nameTaken',
};
const SYMBOL_FAULT: Record<SymbolFault, string | null> = {
  empty: null,
  characters: 'expressions.fault.symbolCharacters',
  function: 'expressions.fault.symbolFunction',
  taken: 'expressions.fault.symbolTaken',
};
const FORMULA_FAULT: Record<FormulaFault, string | null> = {
  empty: null,
  characters: 'expressions.fault.braces',
  formula: 'expressions.fault.formula',
};

/** Null until the engine can say. */
export function useListFaults(list: readonly CustomExpression[]): ExpressionFault[] | null {
  const ready = useEngineStore((s) => s.phase === 'ready');
  return useMemo(() => (ready && list.length ? checkExpressions(list) : null), [ready, list]);
}

/** What is wrong with a draft whose formula can use the expressions `before` it, beside all the `others`. */
export function useExpressionFaults(
  { name, symbol, expression }: CustomExpression,
  before: readonly CustomExpression[],
  others: readonly CustomExpression[],
) {
  const { t } = useTranslation();
  const list = useMemo(() => [...before, { name: '', symbol, unit: '', expression }], [before, symbol, expression]);
  const fault = useListFaults(list)?.[before.length] ?? null;
  // One below this is taken too, which the engine, reading from the top, does not see.
  const symbolFault = fault?.symbol ?? (others.some((e) => e.symbol === symbol) ? 'taken' : null);

  const builtIn = useMemo(() => EXPRESSION_VARIABLES.map((v) => t(v.labelKey)), [t]);
  const badName = nameFault(name, [...others.map((e) => e.name), ...builtIn]);

  return {
    nameKey: badName && NAME_FAULT[badName],
    symbolKey: symbolFault && SYMBOL_FAULT[symbolFault],
    formulaKey: fault?.expression ? FORMULA_FAULT[fault.expression] : null,
    usable: fault !== null && !badName && !symbolFault && !fault.expression,
  };
}
