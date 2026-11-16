import type { ReactNode } from 'react';

const TONE = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  muted: 'text-ink-muted',
  soft: 'text-ink-soft',
} as const;
const SIZE = { micro: 'text-[10px]', fine: 'text-[11px] leading-snug', xs: 'text-xs', sm: 'text-sm' } as const;

/** Keep it mounted and empty: most screen readers skip a live region created with its text. */
export function StatusLine({
  tone,
  size = 'xs',
  className = '',
  children,
}: {
  tone: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <p role="status" aria-live="polite" className={`${SIZE[size]} ${TONE[tone]} ${className}`}>
      {children}
    </p>
  );
}
