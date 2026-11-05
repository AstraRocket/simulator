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

export function ToolResultCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="h-fit rounded-xl bg-surface p-3 ring-1 ring-line/10" aria-label={label}>
      {children}
    </section>
  );
}
