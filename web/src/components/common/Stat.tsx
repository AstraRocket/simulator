/** A compact labeled stat tile (value + unit/sub), used by the stability badge and the simulation summary.
 *  `card` wraps the tile in its own surface (one card per stat).
 *  `inline` is the two-line card: see `InlineStat`.
 *  `sub` is a node, not just text, so a tile can put a UnitChip in its unit slot
 *  and let the unit be changed from where it is read. */
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
  /** What the value is made of ("empty / loaded"), after the unit, or beside the label when inline. */
  note?: string;
  /** A verdict word for a tile whose tone is a judgment, so it is not told by color alone. */
  status?: string;
}) {
  if (inline) return <InlineStat label={label} value={value} sub={sub} tone={tone} note={note} status={status} />;
  // The carded tiles are the flight summary's grid, and the static statistics
  // in their standard layout: a dozen of them read side by side, where what
  // you are looking for matters as much as the number itself. So its label and
  // unit lines run a step larger and the value a step smaller than the
  // default, a flatter scale that scans as a set. The plain
  // tiles keep the default: they sit in dense dialog grids where the number is
  // the point and the vertical room is tighter.
  //
  // `text-xs` and not an arbitrary size: the sub line usually holds a UnitChip,
  // which sets its own `text-xs` because it is a <select> and form controls do
  // not inherit the page font. Anything else here leaves the unit a pixel off
  // the label above it.
  // `dense` sets the three lines closer, for a card grid that shares its pane
  // with something taller (the static statistics under the drawing). On each
  // line, not the card: a `text-*` size carries its own line height.
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

/**
 * The card on two lines rather than three: the label over the value with its
 * unit beside it, left-aligned. The rocket's static-stats strip uses it, a dozen
 * tiles that read as a table, six to a row on a desktop, so the strip takes two
 * rows instead of four and leaves the height to the drawing.
 *
 * The note and the verdict sit on the label line, which has room to the right
 * of a short label, rather than lengthening the value line past a narrow column.
 * A label too long for its column truncates, with the whole of it in the title.
 */
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
