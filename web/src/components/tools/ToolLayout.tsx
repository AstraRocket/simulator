/**
 * The page of a standalone tool: the form column, a fixed 22rem on a wide
 * screen, beside its result. `wide` lets the result take the rest of the row
 * (the landing estimator's map wants the room); otherwise it stops at 28rem so
 * a few figures do not stretch across a monitor. `help` adds a third column
 * on a screen wide enough for it; narrower, the help falls under the form.
 */
export function ToolLayout({
  wide = false,
  help = false,
  children,
}: {
  wide?: boolean;
  help?: boolean;
  children: React.ReactNode;
}) {
  const cols = wide
    ? 'lg:grid-cols-[22rem_minmax(0,1fr)]'
    : help
      ? 'lg:grid-cols-[22rem_minmax(0,28rem)] xl:grid-cols-[22rem_minmax(0,28rem)_minmax(0,22rem)]'
      : 'lg:grid-cols-[22rem_minmax(0,28rem)]';
  return <div className={`grid gap-4 ${cols}`}>{children}</div>;
}

/** The tool's title and what it is for, over the cards of its form. */
export function ToolForm({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-xs text-ink-muted">{intro}</p>
      </div>
      {children}
    </div>
  );
}

/** The result beside the form, as one card named for a screen reader. */
export function ToolResultCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="h-fit rounded-xl bg-surface p-3 ring-1 ring-line/10" aria-label={label}>
      {children}
    </section>
  );
}
