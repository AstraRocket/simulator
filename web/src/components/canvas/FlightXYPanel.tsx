import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtNum, ladderDigits, withUnit } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { useUnits } from '../../prefs/useUnits';
import { hoverValue } from './flightChartHoverValue';
import { PAD_L, PAD_R } from './flightChartAxis';
import { traceLabel, traceOffset, traceScale, traceUnit, type Branch, type Meta } from './flightChartTraces';
import { polylinePath } from '../common/svgPath';
import { ChartPanelFrame, PanelClip, PanelLines, YEnds } from './ChartPanelFrame';
import { peakAcross, xySummary } from './chartSummary';

const SAME_SCALE = new Set(['distance', 'length']);

export function FlightXYPanel({
  meta,
  branches,
  w,
  height,
  hoverT,
  clipT = Infinity,
  expanded,
  onToggleExpand,
}: {
  meta: Meta;
  branches: Branch[];
  w: number;
  height: number;
  hoverT: number | null;
  clipT?: number;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const uid = useId();
  const padT = 8;
  const padB = 16;
  const ih = height - padT - padB;
  const iw = Math.max(1, w - PAD_L - PAD_R);
  const xMeta = meta.xy?.x ?? meta;
  const yMeta = meta.xy?.y ?? meta;
  const xs = traceScale(xMeta, u);
  const xo = traceOffset(xMeta, u);
  const ys = traceScale(yMeta, u);
  const yo = traceOffset(yMeta, u);
  const xUnit = traceUnit(xMeta, u, t);
  const yUnit = traceUnit(yMeta, u, t);
  const clipped = !!xMeta.aero || !!yMeta.aero;
  const sameScale = !!xMeta.quantity && xMeta.quantity === yMeta.quantity && SAME_SCALE.has(xMeta.quantity);

  const { lines, x0, x1, y0, y1 } = useMemo(() => {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    const out: { color: string; pts: [number, number][]; time: number[]; xv: number[]; yv: number[] }[] = [];
    for (const b of branches) {
      const pts: [number, number][] = [];
      const time: number[] = [];
      const xv: number[] = [];
      const yv: number[] = [];
      const ts = b.series.time ?? [];
      const xr = b.series[xMeta.key] ?? [];
      const yr = b.series[yMeta.key] ?? [];
      for (let i = 0; i < ts.length; i++) {
        const ti = ts[i];
        const a = xr[i];
        const v = yr[i];
        if (ti == null || a == null || v == null || !Number.isFinite(a) || !Number.isFinite(v)) continue;
        if (clipped && ti > clipT) continue;
        const x = a * xs + xo;
        const y = v * ys + yo;
        pts.push([x, y]);
        time.push(ti);
        xv.push(x);
        yv.push(y);
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
      out.push({ color: b.color, pts, time, xv, yv });
    }
    if (!(xMin < Infinity)) [xMin, xMax, yMin, yMax] = [0, 1, 0, 1];
    const span = (lo: number, hi: number) => hi - lo || Math.abs(hi) || 1;
    let lx = xMeta.level ? xMin - span(xMin, xMax) * 0.05 : Math.min(0, xMin);
    let hx = xMeta.level ? xMax + span(xMin, xMax) * 0.05 : Math.max(0, xMax);
    let ly = yMeta.level ? yMin - span(yMin, yMax) * 0.1 : Math.min(0, yMin);
    let hy = yMeta.level ? yMax + span(yMin, yMax) * 0.1 : Math.max(0, yMax) + span(Math.min(0, yMin), yMax) * 0.08;
    if (!(hx > lx)) hx = lx + 1;
    if (!(hy > ly)) hy = ly + 1;
    if (sameScale) {
      const k = Math.max((hx - lx) / iw, (hy - ly) / ih);
      const cx = (lx + hx) / 2;
      const cy = (ly + hy) / 2;
      [lx, hx] = [cx - (k * iw) / 2, cx + (k * iw) / 2];
      [ly, hy] = [cy - (k * ih) / 2, cy + (k * ih) / 2];
    }
    return { lines: out, x0: lx, x1: hx, y0: ly, y1: hy };
  }, [branches, xMeta, yMeta, xs, xo, ys, yo, clipped, clipT, sameScale, iw, ih]);

  const { X, Y, paths } = useMemo(() => {
    const toX = (x: number) => PAD_L + ((x - x0) / (x1 - x0)) * iw;
    const toY = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * ih;
    return {
      X: toX,
      Y: toY,
      paths: lines.map((l) =>
        l.pts.length >= 2
          ? polylinePath(
              l.pts.map((p) => [toX(p[0]), toY(p[1])]),
              'comma',
            )
          : '',
      ),
    };
  }, [lines, x0, x1, y0, y1, iw, ih]);

  const hovered =
    hoverT == null
      ? []
      : lines.map((l) => {
          const spanOf = { xs: l.time, t0: l.time[0], t1: l.time[l.time.length - 1] };
          return { l, a: hoverValue({ ...spanOf, ys: l.xv }, hoverT), v: hoverValue({ ...spanOf, ys: l.yv }, hoverT) };
        });
  const head = hovered[0];
  const xDigits = ladderDigits(x1 - x0);
  const yDigits = ladderDigits(y1 - y0);
  const title = traceLabel(meta, t);
  const yText = (v: number) => withUnit(fmtNum(v, yDigits), yUnit);
  const xText = (v: number) => withUnit(fmtNum(v, xDigits), xUnit);
  const peak = peakAcross(lines.map((l) => ({ xs: l.xv, ys: l.yv })))?.value ?? null;
  const summary = useMemo(() => {
    const xd = ladderDigits(x1 - x0);
    const yd = ladderDigits(y1 - y0);
    const xu = traceUnit(xMeta, u, t);
    const yu = traceUnit(yMeta, u, t);
    return xySummary(
      t,
      title,
      lines.map((l, i) => ({ name: branches[i]?.name ?? '', xs: l.xv, ys: l.yv })),
      {
        y: (v) => withUnit(fmtNum(v, yd), yu),
        x: (v) => withUnit(fmtNum(v, xd), xu),
      },
    );
  }, [t, title, lines, branches, x0, x1, y0, y1, xMeta, yMeta, u]);

  return (
    <ChartPanelFrame
      title={title}
      reading={
        <>
          {hoverT == null && <span className="text-[10px] text-ink-faint">{t('flight.peakTag')}</span>}
          <span className="text-xs font-semibold tabular-nums text-ink-strong">
            {hoverT == null
              ? peak == null
                ? NO_VALUE
                : yText(peak)
              : head && head.v != null && head.a != null
                ? t('flight.yAtX', { y: yText(head.v), x: xText(head.a) })
                : NO_VALUE}
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
        <PanelClip id={`${uid}-clip`} w={w} height={height} />
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        <PanelLines paths={paths} colors={lines.map((l) => l.color)} />
        {hovered.map(({ l, a, v }, i) =>
          a != null && v != null ? <circle key={i} cx={X(a)} cy={Y(v)} r={3} fill={l.color} /> : null,
        )}
      </g>
      <YEnds top={fmtNum(y1, yDigits)} bottom={fmtNum(y0, yDigits)} padT={padT} padB={padB} height={height} />
      <text x={PAD_L} y={height - 3} className="fill-ink-faint text-[9px] tabular-nums">
        {fmtNum(x0, xDigits)}
      </text>
      <text x={w - PAD_R} y={height - 3} textAnchor="end" className="fill-ink-faint text-[9px] tabular-nums">
        {xText(x1)}
      </text>
    </ChartPanelFrame>
  );
}
