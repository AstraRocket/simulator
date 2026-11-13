import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { NumberInput } from '../common/NumberInput';
import { UnitChip } from '../common/UnitChip';

const SCOPE = unitScope('material', 'shearModulus');

/** Desktop's `CustomMaterialDialog` field, bulk materials only. `value` is in Pa; null while empty. */
export function ShearModulusInput({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (pa: number | null) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const fu = useUnits().at(SCOPE, 'shearModulus');
  const label = `${t('material.shearModulus')} (${fu.sym})`;
  return (
    <div className="flex items-center gap-2">
      <NumberInput
        value={value === null ? null : fu.toUi(value)}
        onChange={(ui) => onChange(fu.toSi(ui))}
        min={0}
        step={fu.step(1e9)}
        placeholder={label}
        ariaLabel={label}
        className={className}
      />
      <UnitChip quantity="shearModulus" scope={SCOPE} />
    </div>
  );
}
