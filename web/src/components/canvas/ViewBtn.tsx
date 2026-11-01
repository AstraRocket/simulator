import { ToggleButton } from '../common/ToggleButton';

/**
 * A thin rule between groups of the canvas header's controls (view, overlays,
 * rulers; export, calipers), so a row of buttons reads as short
 * groups. Decoration only, hidden from a screen reader.
 *
 * `@[63rem]/bar` is the header row's width (`@container/bar` on CenterToolbar)
 * from which it has room for these and for the calipers' words, which use the
 * same query. Narrower, both give way and the row is as long as it was before
 * them, so it stays one line where it was one line: a wrapped row costs the
 * drawing a line of height.
 */
export function ToolDivider() {
  return <span aria-hidden className="hidden h-4 w-px shrink-0 bg-line/20 @[63rem]/bar:block" />;
}

/** Toggles joined into one block, as `Segmented` joins a choice of one. */
export function ToolGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md ring-1 ring-line/10">
      {children}
    </div>
  );
}

/** One button of a `ToolGroup`: the header row's height, no ring or rounding of its own. */
export const JOINED = 'inline-flex h-7 items-center justify-center px-2 text-xs font-medium';
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
