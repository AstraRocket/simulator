import type { ReactNode } from 'react';

// warn-200: light's warn-300 is under 4.5:1 on the page.
const TONE = {
  warn: 'bg-warn-500/10 text-warn-200 ring-warn-400/30',
  danger: 'bg-danger-500/10 text-danger-300 ring-danger-400/30',
} as const;
const SIZE = {
  fine: 'rounded-md px-2 py-1.5 text-[11px] leading-snug',
  xs: 'rounded-lg px-3 py-1.5 text-xs leading-snug',
  sm: 'rounded-lg px-3 py-2 text-sm leading-relaxed',
} as const;

/** A tinted inline notice; `role="status"` is polite, `role="alert"` assertive. */
export function Notice({
  tone,
  size = 'xs',
  role,
  className = '',
  children,
}: {
  tone: keyof typeof TONE;
  size?: keyof typeof SIZE;
  role?: 'status' | 'alert';
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      className={`ring-1 ${SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {children}
    </p>
  );
}
