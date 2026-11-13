import { FieldLabel } from './FieldMark';
import { markRing } from './markRing';

const SIZE = { sm: 'text-sm', xs: 'text-xs' } as const;

/** A label on the left and a select on the right; the wrapping label names the select. */
export function SelectRow<T extends string = string>({
  label,
  value,
  onChange,
  width = '',
  size = 'sm',
  labelClassName = 'text-xs text-ink-muted',
  className = '',
  mixed,
  disabled,
  title,
  children,
}: {
  label: string;
  value: T | number;
  onChange: (v: T) => void;
  /** Width classes for the select, e.g. `w-32` or `min-w-0 flex-1`. */
  width?: string;
  size?: keyof typeof SIZE;
  labelClassName?: string;
  /** Extra classes for the row. */
  className?: string;
  mixed?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 ${className}`}>
      <FieldLabel text={label} mixed={mixed} className={`shrink-0 ${labelClassName}`} />
      <select
        value={value}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(e.target.value as T)}
        className={markRing(
          `${width} rounded-md bg-raised px-2 py-1 ${SIZE[size]} text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 disabled:bg-raised/50 disabled:text-ink-faint`,
          false,
          mixed,
        )}
      >
        {children}
      </select>
    </label>
  );
}
