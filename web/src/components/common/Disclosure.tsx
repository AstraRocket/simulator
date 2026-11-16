import type { ReactNode } from 'react';

const HEADING_BUTTON = 'flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised';
const HEADING_LABEL = 'shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted';

/** A fold toggle; the button sits inside the heading, since a heading inside a button is flattened. */
export function Disclosure({
  open,
  onToggle,
  label,
  after,
  as: Heading = 'h2',
  id,
  title,
  className = HEADING_BUTTON,
  labelClassName = HEADING_LABEL,
  glyphClassName = 'text-base leading-none text-accent-400',
}: {
  open: boolean;
  onToggle: () => void;
  label: ReactNode;
  /** Inside the button, after the label: a summary shown while folded. */
  after?: ReactNode;
  /** `null` for a toggle that is not a heading, such as a card's own header. */
  as?: 'h2' | 'h3' | null;
  id?: string;
  title?: string;
  className?: string;
  labelClassName?: string;
  glyphClassName?: string;
}) {
  const button = (
    <button type="button" onClick={onToggle} aria-expanded={open} title={title} className={className}>
      <span className={glyphClassName} aria-hidden="true">
        {open ? '▾' : '▸'}
      </span>
      <span className={labelClassName}>{label}</span>
      {after}
    </button>
  );
  if (!Heading) return button;
  return (
    <Heading id={id} className="flex min-w-0">
      {button}
    </Heading>
  );
}
