import { useCallback, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtNum } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import { PAD_L, PAD_R, PANEL_H } from './flightChartAxis';
import {
  panelDigits,
  panelSeries,
  traceLabel,
  traceOffset,
  traceScale,
  traceUnit,
  type Branch,
  type Meta,
} from './flightChartTraces';
import { PanelHover } from './FlightChartHover';
import { hoverValue } from './flightChartHoverValue';
import { NO_VALUE } from '../../i18n/noValue';
import { polylinePath, areaPath } from '../common/svgPath';
import { ChartPanelFrame, PanelClip, PanelLines, YEnds } from './ChartPanelFrame';
import { token } from '../common/colorTokens';
import { timeSeriesSummary, peakAcross } from './chartSummary';

type Pt = readonly [number, number];

export function FlightChartPanel({
  meta,
  branches,
  w,
  X,
  hoverT,
  clipT,
  events,
  height = PANEL_H,
  expanded = false,
  onToggleExpand,
}: {
  meta: Meta;
  branches: Branch[];
  w: number;
  X: (t: number) => number;
  hoverT: number | null;
  clipT: number;
  events: { type: string; time: number }[];
  height?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const padT = 8;
  const padB = 8;
  const ih = height - padT - padB;
  // A scale factor, not `toUi`: a temperature's offset is added after it.
  const scale = traceScale(meta, u);
  const offset = traceOffset(meta, u);
  const unit = traceUnit(meta, u, t);
  const title = traceLabel(meta, t);
  // Namespaced: with a fixed id, two charts' `url(#...)` resolve to whichever rendered first.
  const uid = useId();
  const clipId = `${uid}-clip-${meta.key}`;
  const single = branches.length === 1;

  const { list, lo, hi } = useMemo(
    () => panelSeries(branches, meta, scale, clipT, offset),
    [branches, meta, scale, clipT, offset],
  );
  const digits = panelDigits(meta, lo, hi);

  const Y = useCallback((v: number) => padT + (1 - (v - lo) / (hi - lo)) * ih, [lo, hi, ih]);
  const mkLine = useCallback(
    (pts: Pt[]) =>
      pts.length >= 2
        ? polylinePath(
            pts.map((p) => [X(p[0]), Y(p[1])]),
            'comma',
          )
        : '',
    [X, Y],
  );

  const { paths, area, peak } = useMemo(() => {
    const first = list[0];
    return {
      paths: list.map((sr) => mkLine(sr.pts)),
      area:
        first && first.pts.length >= 2
          ? areaPath(
              first.pts.map((p) => [X(p[0]), Y(p[1])]),
              Y(Math.max(lo, 0)),
              'comma',
            )
          : '',
      peak: peakAcross(list)?.value ?? null,
    };
  }, [list, mkLine, X, Y, lo]);

  const zeroInRange = lo < 0 && hi > 0;

  const summary = useMemo(
    () => timeSeriesSummary(t, title, unit, digits, !!meta.level, list),
    [t, title, meta.level, unit, digits, list],
  );

  const primary = list[0];
  const showsPeak = hoverT == null;
  const shown = showsPeak ? peak : primary ? hoverValue(primary, hoverT) : null;

  return (
    <ChartPanelFrame
      title={title}
      reading={
        <>
          {showsPeak && <span className="text-[10px] text-ink-faint">{t('flight.peakTag')}</span>}
          <span className="text-xs font-semibold tabular-nums text-ink-strong">
            {shown == null ? (
              NO_VALUE
            ) : (
              <>
                {fmtNum(shown, digits)}
                {unit && <span className="ml-0.5 text-[10px] text-ink-faint">{unit}</span>}
              </>
            )}
          </span>
        </>
      }
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      w={w}
      height={height}
      summary={summary}
    >
      <defs>
        {single && (
          <linearGradient id={`${uid}-${meta.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary?.color ?? token('series-1')} stopOpacity="0.25" />
            <stop offset="100%" stopColor={primary?.color ?? token('series-1')} stopOpacity="0" />
          </linearGradient>
        )}
        <PanelClip id={clipId} w={w} height={height} />
      </defs>
      {zeroInRange && <line x1={PAD_L} y1={Y(0)} x2={w - PAD_R} y2={Y(0)} className="stroke-line/15" />}
      <g clipPath={`url(#${clipId})`}>
        {events.map((e, i) => (
          <line
            key={i}
            x1={X(e.time)}
            y1={padT}
            x2={X(e.time)}
            y2={height - padB}
            className="stroke-warn-400/25"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {single && !meta.level && area && <path d={area} fill={`url(#${uid}-${meta.key})`} />}
        <PanelLines paths={paths} colors={list.map((s) => s.color)} />
        {hoverT != null && (
          <PanelHover
            hoverT={hoverT}
            list={list}
            X={X}
            Y={Y}
            top={padT}
            bottom={height - padB}
            single={single}
            digits={digits}
          />
        )}
      </g>
      <YEnds top={fmtNum(hi, digits)} bottom={fmtNum(lo, digits)} padT={padT} padB={padB} height={height} />
    </ChartPanelFrame>
  );
}
