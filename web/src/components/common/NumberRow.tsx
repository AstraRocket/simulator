import type { ComponentProps, ReactNode } from 'react';
import { FieldLabel } from './FieldMark';
import { markRing } from './markRing';
import { NumberInput } from './NumberInput';

export interface NumberRowMarks {
  placeholder?: string;
  hint?: string;
  caution?: string;
  mixed?: boolean;
  required?: boolean;
  missing?: boolean;
  onChange: (v: number | null) => void;
}

export function NumberRow({
  label,
  unit,
  value,
  step = 1,
  min,
  max,
  placeholder,
  hint,
  caution,
  mixed,
  required,
  missing,
  onChange,
  onCommit,
  commitOnBlur,
  labelClassName,
}: {
  label: string;
  unit?: ReactNode;
  value: number | null;
  step?: number;
  min?: number;
  max?: number;
  onCommit?: () => void;
  commitOnBlur?: boolean;
  labelClassName?: string;
} & NumberRowMarks) {
  if (hint || caution) {
    return (
      <div>
        <NumberRow
          label={label}
          unit={unit}
          value={value}
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          mixed={mixed}
          required={required}
          missing={missing}
          onChange={onChange}
          onCommit={onCommit}
          commitOnBlur={commitOnBlur}
          labelClassName={labelClassName}
        />
        {hint && <p className="mt-0.5 pr-24 text-[11px] leading-snug text-ink-faint">{hint}</p>}
        {caution && <p className="mt-0.5 text-[11px] leading-snug text-warn-300">{caution}</p>}
      </div>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3">
      <FieldLabel text={label} required={required} missing={missing} mixed={mixed} className={labelClassName} />
      <NumberWithUnit
        unit={unit}
        missing={missing}
        mixed={mixed}
        ariaLabel={label}
        value={value}
        /* No focus trap on an empty required box: that would break WCAG 2.1.2. */
        onChange={(v) => (v === null && required ? undefined : onChange(v))}
        onCommit={onCommit}
        commitOnBlur={commitOnBlur}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
      />
    </label>
  );
}

export function NumberWithUnit({
  unit,
  className = '',
  fill = 'bg-raised text-ink-strong',
  missing,
  mixed,
  ...input
}: Omit<ComponentProps<typeof NumberInput>, 'className'> & {
  unit?: ReactNode;
  className?: string;
  fill?: string;
  missing?: boolean;
  mixed?: boolean;
}) {
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <NumberInput
        {...input}
        className={markRing(
          `w-24 rounded-md px-2 py-1 text-right text-sm ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 ${fill}`,
          missing,
          mixed,
        )}
      />
      {unit && <span className="min-w-10 text-xs text-ink-faint">{unit}</span>}
    </span>
  );
}
