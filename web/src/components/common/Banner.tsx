const TONE = {
  accent: 'border-accent-500/40 bg-accent-900/60 text-accent-50',
  warn: 'border-warn-500/30 bg-warn-950/60 text-warn-200',
  danger: 'border-danger-500/30 bg-danger-950/60 text-danger-300',
  neutral: 'border-line/10 bg-surface text-ink-soft',
} as const;

/**
 * A full-width strip under the header: an update, a catalog change, a storage
 * or build problem, the engine still loading. `role` is the caller's, since a
 * banner that is always mounted holds its live region on a wrapper instead.
 * `onDismiss` adds the closing ✕ at the end of the row.
 */
export function Banner({
  tone,
  role,
  onDismiss,
  dismissLabel,
  children,
}: {
  tone: keyof typeof TONE;
  role?: 'status' | 'alert';
  onDismiss?: () => void;
  dismissLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div role={role} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm ${TONE[tone]}`}>
      {children}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-lg px-1 py-1.5 opacity-70 hover:opacity-100"
          aria-label={dismissLabel}
        >
          ✕
        </button>
      )}
    </div>
  );
}
