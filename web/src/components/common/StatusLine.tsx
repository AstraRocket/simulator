import type { ReactNode } from 'react';

const TONE = { danger: 'text-danger-400', warn: 'text-warn-400', muted: 'text-ink-muted' } as const;
const SIZE = { xs: 'text-xs', fine: 'text-[11px] leading-snug' } as const;

/**
 * A status line under a form or in a dialog's footer: always mounted, empty
 * until there is something to say, because a live region created together with
 * its text is not announced by most screen readers. `danger` for a refused
 * write or a failed action, `warn` for an advisory, `muted` for a plain report.
 * One component, so the same kind of message reads in the same tone everywhere.
 */
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
