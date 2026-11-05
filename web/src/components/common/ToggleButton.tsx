import type { ReactNode } from 'react';

export function ToggleButton({
  active,
  onClick,
  current = false,
  disabled,
  title,
  label,
  className = 'rounded-lg px-3 py-1 text-xs font-medium',
  children,
}: {
  active: boolean;
  onClick: () => void;
  current?: boolean;
  disabled?: boolean;
  title?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={current ? undefined : active}
      aria-current={current && active ? 'true' : undefined}
      className={`disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-accent-600 text-on-accent' : 'bg-raised text-ink-soft hover:bg-elevated'
      } ${className}`}
    >
      {children}
    </button>
  );
}
