import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/SettingsProvider';
import { UNITS, unitFor, type Quantity } from '../../prefs/units';
import { withKey } from '../../services/app/objectKeys';
import { useUnits } from '../../prefs/useUnits';

/** Picking the Settings default removes the override, so the field follows later preference changes. */
export function UnitChip({
  quantity,
  scope,
  label,
  className = '',
}: {
  quantity: Quantity;
  scope: string;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const current = unitFor(settings.units, settings.unitOverrides, quantity, scope);
  const overridden = current !== settings.units[quantity];
  return (
    <select
      value={current}
      title={overridden ? t('units.chipOverridden', { unit: settings.units[quantity] }) : t('units.chipTitle')}
      aria-label={
        overridden
          ? t('units.ariaForOverridden', { quantity: label ?? t(`units.q.${quantity}`) })
          : t('units.ariaFor', { quantity: label ?? t(`units.q.${quantity}`) })
      }
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value;
        update({ unitOverrides: withKey(settings.unitOverrides, scope, v === settings.units[quantity] ? null : v) });
      }}
      className={`cursor-pointer appearance-none bg-transparent text-xs hover:text-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-500 ${
        overridden ? 'font-medium text-warn-400' : 'text-ink-faint'
      } ${className}`}
    >
      {UNITS[quantity].map((u) => (
        <option key={u.symbol} value={u.symbol} className="bg-raised text-ink-strong">
          {u.symbol}
        </option>
      ))}
    </select>
  );
}

export function useScopedUnit(scope: string, quantity: Quantity) {
  const field = useUnits().at(scope, quantity);
  return {
    ...field,
    chip: (label: string, className?: string) => (
      <UnitChip label={label} quantity={quantity} scope={scope} className={className} />
    ),
  };
}
