import { useId } from 'react';

const RADIO = 'flex items-center gap-1.5 text-xs text-ink-muted';

/**
 * A set of radio buttons in a fieldset, so a screen reader announces the
 * question before the choices. The group's name comes from `useId`: a static
 * name ties every mounted copy of the form together, and checking an option in
 * one would uncheck it in the other.
 *
 * - `row`: the question on the left, the choices on the right, the legend read
 *   out only (the visible `label` stands in for it, with a mixed-value marker
 *   when there is one).
 * - `stack`: the choices one per line under a visible legend; `children` go
 *   under them (a note).
 * - `inline`: the choices in a wrapping row with no visible question.
 */
export function RadioGroup<T extends string>({
  legend,
  label,
  options,
  value,
  onChange,
  fmt,
  isDisabled,
  layout = 'row',
  className = '',
  children,
}: {
  legend: string;
  label?: React.ReactNode;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  fmt: (v: T) => string;
  isDisabled?: (v: T) => boolean;
  layout?: 'row' | 'stack' | 'inline';
  className?: string;
  children?: React.ReactNode;
}) {
  const name = useId();
  const radios = options.map((o) => {
    const disabled = isDisabled?.(o) ?? false;
    return (
      <label key={o} className={RADIO}>
        <input
          type="radio"
          name={name}
          checked={value === o}
          disabled={disabled}
          onChange={() => onChange(o)}
          className="accent-accent-500"
        />
        <span className={disabled ? 'text-ink-faint' : undefined}>{fmt(o)}</span>
      </label>
    );
  });

  if (layout === 'stack')
    return (
      <fieldset className={className}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{legend}</legend>
        <div className="mt-1 space-y-1">{radios}</div>
        {children}
      </fieldset>
    );
  if (layout === 'inline')
    return (
      <fieldset className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
        <legend className="sr-only">{legend}</legend>
        {radios}
      </fieldset>
    );
  return (
    <fieldset className={className}>
      <legend className="sr-only">{legend}</legend>
      <div className="flex items-center justify-between gap-3">
        {label ?? <span className="text-xs text-ink-muted">{legend}</span>}
        <div className="flex gap-3">{radios}</div>
      </div>
    </fieldset>
  );
}
