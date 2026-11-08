import { useUnits } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import { NumberInput } from './NumberInput';

export function UnitBound({
  quantity,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  min,
}: {
  quantity: Quantity;
  value: number | null;
  onChange: (si: number | null) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  min?: number;
}) {
  const u = useUnits();
  return (
    <NumberInput
      value={value == null ? null : u.toUi(quantity, value)}
      onChange={(ui) => onChange(ui === null ? null : u.toSi(quantity, ui))}
      min={min}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
