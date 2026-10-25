import { ToggleButton } from '../common/ToggleButton';
/** Small overlay button for the 2D view presets (Side / Aft / Reset) and the
 *  CG/CP · Info view toggles. */
export function ViewBtn({
  active,
  onClick,
  title,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  /** Accessible name, for a button whose content is a bare glyph. */
  label?: string;
  children: React.ReactNode;
}) {
  const shape = 'inline-flex h-7 items-center rounded-md px-2 text-xs font-medium ring-1 ring-line/10';
  // A toggle takes the shared on and off inks; a one-shot action (Reset) is a
  // plain button in the off ink.
  if (active !== undefined) {
    return (
      <ToggleButton active={active} onClick={onClick} title={title} label={label} className={shape}>
        {children}
      </ToggleButton>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className={`${shape} bg-raised text-ink-soft hover:bg-elevated`}
    >
      {children}
    </button>
  );
}
