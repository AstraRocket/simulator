import { useId } from 'react';

const FILL = { surface: 'bg-surface', raised: 'bg-raised/40' } as const;
const HEADING = 'text-xs font-semibold uppercase tracking-wide text-ink-muted';

/** Use `fill="raised"` inside a dialog, whose background is already the surface color. */
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
