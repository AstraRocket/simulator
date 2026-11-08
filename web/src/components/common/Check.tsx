import type { ReactNode } from 'react';

export function Check({
  checked,
  onChange,
  label,
  disabled,
  hint,
  title,
  className = 'text-sm text-ink-soft',
  align = 'center',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  hint?: string;
  title?: string;
  className?: string;
  align?: 'center' | 'start';
}) {
  const row = (
    <label
      title={title}
      className={`flex ${align === 'start' ? 'items-start' : 'items-center'} gap-2 ${className} ${disabled ? 'opacity-40' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={`accent-accent-500 ${align === 'start' ? 'mt-0.5' : ''}`}
      />
      {label}
    </label>
  );
  if (!hint) return row;
  return (
    <div>
      {row}
      <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{hint}</p>
    </div>
  );
}
