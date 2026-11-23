import { useTranslation } from 'react-i18next';
import { SIM_STEPPERS } from '../../services/flight/simulations';
import { SelectRow } from '../common/SelectRow';
import { KERNEL_METHOD_ROWS, STEPPER_LABELS } from './simOptionFields';
import { calcMethodKey, hasAeroTables, type AeroTables } from '../../services/flight/aeroTables';

/**
 * The fixed kernel methods, shown read-only; `sm` beside the settings rows, `xs` in a simulation card.
 * `tables` are a simulation's desktop drag / stability tables, which replace the calculation they name.
 */
export function KernelMethodRows({
  size = 'sm',
  className,
  tables = {},
}: {
  size?: 'sm' | 'xs';
  className?: string;
  tables?: AeroTables;
}) {
  const { t } = useTranslation();
  const text = size === 'sm' ? 'text-sm' : 'text-xs';
  const tabled = hasAeroTables(tables);
  return (
    <dl className={className}>
      {KERNEL_METHOD_ROWS.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-3">
          <dt className={`${text} text-ink-muted`}>{t(r.label)}</dt>
          {r.label === 'settings.calcMethod' && tabled ? (
            <dd className={`${text} text-right font-medium text-accent-300`}>{t(calcMethodKey(tables))}</dd>
          ) : (
            <dd className={`${text} text-ink-soft`}>{t(r.value)}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/** The integration method; `defaultLabel` adds an empty choice that follows the global setting. */
export function StepperSelect({
  value,
  onChange,
  defaultLabel,
  mixed,
  size,
  labelClassName,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  defaultLabel?: string;
  mixed?: boolean;
  size?: 'sm' | 'xs';
  labelClassName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <SelectRow
      label={t('settings.simMethod')}
      value={value}
      onChange={onChange}
      mixed={mixed}
      size={size}
      labelClassName={labelClassName}
      className={className}
    >
      {defaultLabel !== undefined && <option value="">{defaultLabel}</option>}
      {SIM_STEPPERS.map((s) => (
        <option key={s} value={s}>
          {t(STEPPER_LABELS[s])}
        </option>
      ))}
    </SelectRow>
  );
}
