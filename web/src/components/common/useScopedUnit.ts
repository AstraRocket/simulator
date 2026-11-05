import { createElement } from 'react';
import type { Quantity } from '../../prefs/units';
import { useUnits } from '../../prefs/useUnits';
import { UnitChip } from './UnitChip';

export function useScopedUnit(scope: string, quantity: Quantity) {
  const field = useUnits().at(scope, quantity);
  return {
    ...field,
    chip: (label: string, className?: string) => createElement(UnitChip, { label, quantity, scope, className }),
  };
}
