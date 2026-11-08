import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { onSi } from '../../prefs/entryValue';
import type { FieldUnit } from '../../prefs/useUnits';
import { overrideFieldLabel } from './overrideFieldLabel';

export function OverrideCard({
  name,
  overridden,
  children,
}: {
  name: string;
  overridden: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={name} className="rounded-xl bg-surface p-3 ring-1 ring-line/10">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">{name}</span>
        {overridden && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-warn-300">{t('configs.overridden')}</span>
        )}
      </div>
      {children}
    </section>
  );
}

export function OverrideRow({ label, first, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <label className={`${first ? '' : 'mt-2 '}flex items-center justify-between gap-3`}>
      <span className="text-xs text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

export function OverrideSelect({
  name,
  label,
  value,
  designed,
  options,
  onChange,
  first,
  width = 'w-40',
}: {
  name: string;
  label: string;
  value: string | null | undefined;
  designed: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
  first?: boolean;
  width?: string;
}) {
  const { t } = useTranslation();
  return (
    <OverrideRow label={label} first={first}>
      <select
        value={value ?? ''}
        aria-label={overrideFieldLabel(name, label)}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${width} rounded-md bg-raised px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500`}
      >
        <option value="">{t('configs.asDesigned', { value: designed })}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </OverrideRow>
  );
}

export function OverrideNumber({
  name,
  label,
  value,
  placeholder,
  step,
  min,
  unit,
  onChange,
  onCommit,
  first,
}: {
  name: string;
  label: string;
  value: number | null;
  placeholder: string;
  step: number;
  min: number;
  unit: string;
  onChange: (value: number | null) => void;
  onCommit: () => void;
  first?: boolean;
}) {
  return (
    <OverrideRow label={label} first={first}>
      <span className="flex items-center gap-1">
        <NumberInput
          ariaLabel={overrideFieldLabel(name, label)}
          value={value}
          placeholder={placeholder}
          step={step}
          min={min}
          onChange={onChange}
          onCommit={onCommit}
          className="w-24 rounded-md bg-raised px-2 py-1 text-right text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        />
        <span className="min-w-6 text-xs text-ink-faint">{unit}</span>
      </span>
    </OverrideRow>
  );
}

// Floored at zero: `onSi` accepts negatives, and a negative altitude never fires the kernel's trigger.
export function OverrideAltitude({
  name,
  label,
  si,
  designedSi,
  unit,
  onChange,
  onCommit,
}: {
  name: string;
  label: string;
  /** Meters. */
  si: number | null | undefined;
  designedSi: number;
  unit: FieldUnit;
  onChange: (si: number | null) => void;
  onCommit: () => void;
}) {
  return (
    <OverrideNumber
      name={name}
      label={label}
      value={si == null ? null : unit.toUi(si)}
      placeholder={unit.fmt(designedSi)}
      step={unit.step(10)}
      min={unit.toUi(0)}
      unit={unit.sym}
      onChange={onSi(unit, onChange)}
      onCommit={onCommit}
    />
  );
}
