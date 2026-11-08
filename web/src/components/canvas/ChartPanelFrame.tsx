import { PAD_L, PAD_R } from './flightChartAxis';
import { PanelExpandButton } from './PanelExpandButton';

export function ChartPanelFrame({
  title,
  reading,
  expanded,
  onToggleExpand,
  w,
  height,
  summary,
  children,
}: {
  title: string;
  reading: React.ReactNode;
  expanded: boolean;
  onToggleExpand?: () => void;
  w: number;
  height: number;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 rounded-lg bg-raised/40 ring-1 ring-line/10">
      <div className="flex items-baseline justify-between gap-2 px-2 pt-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{title}</span>
        <span className="flex items-baseline gap-2">
          {reading}
          {onToggleExpand && <PanelExpandButton expanded={expanded} onClick={onToggleExpand} />}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
        role="img"
        aria-label={summary}
      >
        {children}
      </svg>
    </div>
  );
}

/** Goes in `<defs>`. */
export function PanelClip({ id, w, height }: { id: string; w: number; height: number }) {
  return (
    <clipPath id={id}>
      <rect x={PAD_L} y={0} width={Math.max(0, w - PAD_L - PAD_R)} height={height} />
    </clipPath>
  );
}

export function PanelLines({ paths, colors }: { paths: readonly string[]; colors: readonly string[] }) {
  return (
    <>
      {paths.map((d, i) =>
        d ? (
          <path key={i} d={d} fill="none" stroke={colors[i]} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
    </>
  );
}

export function YEnds({
  top,
  bottom,
  padT,
  padB,
  height,
}: {
  top: string;
  bottom: string;
  padT: number;
  padB: number;
  height: number;
}) {
  return (
    <>
      <text x={PAD_L - 4} y={padT + 7} textAnchor="end" className="fill-ink-faint text-[9px] tabular-nums">
        {top}
      </text>
      <text x={PAD_L - 4} y={height - padB} textAnchor="end" className="fill-ink-faint text-[9px] tabular-nums">
        {bottom}
      </text>
    </>
  );
}
