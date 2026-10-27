import { PAD_L, PAD_R } from './flightChartAxis';
import { PanelExpandButton } from './PanelExpandButton';

/**
 * A flight chart panel's frame: the title and the reading in a header row, the
 * expand toggle beside the reading, and the plot as an SVG `w` by `height`
 * that describes itself to a screen reader with `summary`.
 */
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
  /** Absent hides the toggle. */
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

/**
 * The clip that keeps a panel's time- or distance-mapped marks inside the plot
 * area, so a point zoomed out of the window does not spill over the y labels.
 * Goes in the panel's `<defs>`, with the marks in a group clipped to `id`.
 */
export function PanelClip({ id, w, height }: { id: string; w: number; height: number }) {
  return (
    <clipPath id={id}>
      <rect x={PAD_L} y={0} width={Math.max(0, w - PAD_L - PAD_R)} height={height} />
    </clipPath>
  );
}

/** One stroked path per line, in its stage's color; a line with no path draws nothing. */
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

/** The y axis's two end labels, already formatted: the top of the plot and its bottom. */
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
