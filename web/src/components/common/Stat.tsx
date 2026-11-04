export function Stat({
  label,
  value,
  sub,
  tone = 'text-ink-strong',
  card = false,
  inline = false,
  dense = false,
  note,
  status,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  tone?: string;
  card?: boolean;
  inline?: boolean;
  dense?: boolean;
  note?: string;
  status?: string;
}) {
  if (inline) return <InlineStat label={label} value={value} sub={sub} tone={tone} note={note} status={status} />;
  // `dense` goes on each line, since a `text-*` size carries its own line height.
  const lead = dense ? ' leading-tight' : '';
  const labelClass = (card ? 'text-xs' : 'text-[10px]') + lead;
  const valueClass = (card ? 'text-base' : 'text-lg') + lead;
  const subClass = (card ? 'text-xs' : 'text-[10px]') + lead;
  const cardClass = `rounded-lg bg-raised/60 px-2 ring-1 ring-line/10 ${dense ? 'py-1' : 'py-1.5'}`;
  return (
    <div className={`text-center ${card ? cardClass : ''}`}>
      <div className={`${labelClass} uppercase tracking-wide text-ink-muted`}>{label}</div>
      <div className={`${valueClass} font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className={`${subClass} text-ink-faint`}>
        {sub}
        {note && ` · ${note}`}
        {status && (
          <>
            {' · '}
            <span className={tone}>{status}</span>
          </>
        )}
      </div>
    </div>
  );
}

function InlineStat({
  label,
  value,
  sub,
  tone,
  note,
  status,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  tone: string;
  note?: string;
  status?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-raised/60 px-2.5 py-1.5 text-left ring-1 ring-line/10">
      <div className="flex items-baseline gap-1.5 text-[10px]">
        <span title={label} className="truncate uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        {note && <span className="shrink-0 text-ink-faint">{note}</span>}
        {status && <span className={`ml-auto shrink-0 font-medium ${tone}`}>{status}</span>}
      </div>
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <span className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
        <span className="truncate text-xs text-ink-faint">{sub}</span>
      </div>
    </div>
  );
}
