import { ToggleButton } from './ToggleButton';

const SIZE = {
  xs: 'px-2 py-0.5 text-[11px] font-medium',
  sm: 'px-3 py-1 text-xs font-semibold',
  bar: 'inline-flex h-7 items-center px-3 text-xs font-medium',
} as const;

/** `disabled` disables every button, since `pointer-events-none` alone would still let the keyboard flip it. */
export function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
  fmt,
  title,
  disabled,
  size = 'xs',
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  fmt: (v: T) => string;
  title?: (v: T) => string;
  disabled?: boolean;
  size?: keyof typeof SIZE;
}) {
  return (
    <div
      className={`inline-flex overflow-hidden ring-1 ring-line/10 ${size === 'sm' ? 'rounded-lg' : 'rounded-md'} ${disabled ? 'opacity-40' : ''}`}
    >
      {options.map((o) => (
        <ToggleButton
          key={String(o)}
          active={value === o}
          onClick={() => onChange(o)}
          title={title?.(o)}
          disabled={disabled}
          className={SIZE[size]}
        >
          {fmt(o)}
        </ToggleButton>
      ))}
    </div>
  );
}
