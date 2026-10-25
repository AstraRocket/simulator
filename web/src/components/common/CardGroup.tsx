import { useId } from 'react';

const FILL = { surface: 'bg-surface', raised: 'bg-raised/40' } as const;
const HEADING = 'text-xs font-semibold uppercase tracking-wide text-ink-muted';

/**
 * One titled card of a form or a results pane: a heading over a vertically
 * spaced stack. `aside` sits at the heading's end (an export button); `fill`
 * is `raised` inside a dialog, whose own background is the surface color.
 * `region` names the section by its heading, making it a landmark; only for a
 * card worth jumping to, since a form card often shares its title with a field.
 */
export function CardGroup({
  title,
  aside,
  fill = 'surface',
  region = false,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  fill?: keyof typeof FILL;
  region?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  const headingId = region ? id : undefined;
  return (
    <section aria-labelledby={headingId} className={`rounded-xl ${FILL[fill]} p-3 ring-1 ring-line/10`}>
      {aside ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id={headingId} className={HEADING}>
            {title}
          </h3>
          {aside}
        </div>
      ) : (
        <h3 id={headingId} className={`mb-2 ${HEADING}`}>
          {title}
        </h3>
      )}
      <div className="space-y-2">{children}</div>
    </section>
  );
}
