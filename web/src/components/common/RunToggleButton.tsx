const SIZE = {
  xs: 'rounded-md px-2 text-xs',
  sm: 'rounded-md px-3 text-xs',
  md: 'rounded-md px-4 py-2 text-sm',
  lg: 'rounded-lg px-4 py-2.5 text-sm',
} as const;

// U+FE0E forces text glyphs: Windows otherwise draws ▶ and ■ as emoji.
const PLAY = '▶︎';
const STOP = '■︎';

/**
 * The run button that turns into a stop button while busy.
 * `glyph`: `lead` puts ▶ before the idle label, `only` shows just ▶ or ■ and names the button by `label`.
 */
export function RunToggleButton({
  busy,
  label,
  onClick,
  disabled = false,
  title,
  glyph = 'none',
  size = 'lg',
  className = '',
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  glyph?: 'none' | 'lead' | 'only';
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={glyph === 'only' ? label : undefined}
      className={`font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50 ${SIZE[size]} ${
        busy ? 'bg-prominent hover:bg-prominent-hover' : 'bg-accent-600 hover:bg-accent-700'
      } ${className}`}
    >
      {glyph === 'only' ? (
        <span aria-hidden>{busy ? STOP : PLAY}</span>
      ) : glyph === 'lead' && !busy ? (
        <>
          <span aria-hidden>{PLAY}</span> {label}
        </>
      ) : (
        label
      )}
    </button>
  );
}
