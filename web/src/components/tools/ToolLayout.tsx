/**
 * The page of a standalone tool: the form column, a fixed 22rem on a wide
 * screen, beside its result. `wide` lets the result take the rest of the row
 * (the landing estimator's map wants the room); otherwise it stops at 28rem so
 * a few figures do not stretch across a monitor.
 */
export function ToolLayout({ wide = false, children }: { wide?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid gap-4 ${wide ? 'lg:grid-cols-[22rem_minmax(0,1fr)]' : 'lg:grid-cols-[22rem_minmax(0,28rem)]'}`}
    >
      {children}
    </div>
  );
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
