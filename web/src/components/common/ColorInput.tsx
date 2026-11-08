import { useId, useLayoutEffect, useRef } from 'react';
import { useNativeChange } from './useNativeChange';

/** React's `onChange` fires on every drag tick; this uses native `change` plus blur (the picker's OK may not move focus). */
export function ColorInput({
  value,
  onCommit,
  id,
  disabled,
  ariaLabel,
  title,
  className,
  style,
}: {
  value: string;
  onCommit: (color: string) => void;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Uncontrolled and re-seeded rather than remounted, so the native listener stays attached.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) el.value = value;
  }, [value]);
  useNativeChange(ref, (el) => {
    if (el.value !== value) onCommit(el.value);
  });
  return (
    <input
      ref={ref}
      id={id}
      type="color"
      defaultValue={value}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
      className={className}
      style={style}
    />
  );
}

export function ColorField({
  label,
  value,
  disabled,
  onCommit,
  labelClassName,
  children,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (color: string) => void;
  labelClassName: string;
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <span className="flex items-center gap-2">
        <ColorInput
          id={id}
          value={value}
          disabled={disabled}
          onCommit={onCommit}
          className="h-7 w-10 cursor-pointer rounded-md border border-line/10 bg-raised p-0.5 disabled:cursor-default disabled:opacity-40"
        />
        {children}
      </span>
    </div>
  );
}
