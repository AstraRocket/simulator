import { useUnits } from '../../prefs/useUnits';

export function LengthRuler({
  baseY,
  dir,
  labelY,
  unitY,
  x0,
  x1,
  ctxX0,
  scale,
  rulerStep,
  rulerDigits,
  marks,
  minorMarks,
}: {
  baseY: number;
  dir: 1 | -1;
  labelY: number;
  unitY: number;
  // viewBox px
  x0: number;
  x1: number;
  ctxX0: number;
  scale: number;
  rulerStep: number;
  rulerDigits: number;
  // Model meters.
  marks: number[];
  minorMarks: number[];
}) {
  const u = useUnits();
  return (
    <g pointerEvents="none">
      <line x1={x0} y1={baseY} x2={x1} y2={baseY} className="stroke-line/55" />
      {minorMarks.map((m, i) => {
        const x = ctxX0 + m * scale;
        const medium = isHalfStep(m, rulerStep);
        return (
          <line
            key={`n${i}`}
            x1={x}
            y1={baseY}
            x2={x}
            y2={baseY + dir * (medium ? 10 : 7)}
            className={medium ? 'stroke-line/80' : 'stroke-line/60'}
          />
        );
      })}
      {marks.map((m, i) => {
        const x = ctxX0 + m * scale;
        return (
          <g key={i}>
            <line x1={x} y1={baseY} x2={x} y2={baseY + dir * 12} className="stroke-line/90" strokeWidth={1.5} />
            <text x={x} y={labelY} textAnchor="middle" className="fill-ink-strong text-[8px] tabular-nums">
              {u.fmt('length', m, rulerDigits)}
            </text>
          </g>
        );
      })}
      <text x={x1} y={unitY} textAnchor="end" data-ruler-unit className="fill-ink-soft text-[9px] font-medium">
        {u.sym('length')}
      </text>
    </g>
  );
}

function isHalfStep(m: number, rulerStep: number): boolean {
  return Math.abs(((((m / rulerStep) % 1) + 1) % 1) - 0.5) < 0.02;
}

export function RadialRuler({
  baseX,
  dir,
  labelX,
  anchor,
  frameTopY,
  frameBotY,
  vTop,
  originY = vTop,
  scale,
  rulerStep,
  rulerDigits,
  ticks,
  minorTicks,
}: {
  baseX: number;
  dir: 1 | -1;
  labelX: number;
  anchor: 'start' | 'end';
  // viewBox px
  frameTopY: number;
  frameBotY: number;
  vTop: number;
  originY?: number;
  scale: number;
  rulerStep: number;
  rulerDigits: number;
  // Majors already placed in px; minors in model meters.
  ticks: { y: number; label: number }[];
  minorTicks: number[];
}) {
  const u = useUnits();
  return (
    <g pointerEvents="none">
      <line x1={baseX} y1={frameTopY} x2={baseX} y2={frameBotY} className="stroke-line/55" />
      {minorTicks.map((m, i) => {
        const y = originY + m * scale;
        const medium = isHalfStep(m, rulerStep);
        return (
          <line
            key={`n${i}`}
            x1={baseX}
            y1={y}
            x2={baseX + dir * (medium ? 10 : 7)}
            y2={y}
            className={medium ? 'stroke-line/80' : 'stroke-line/60'}
          />
        );
      })}
      {ticks.map((tk, i) => (
        <g key={i}>
          <line x1={baseX} y1={tk.y} x2={baseX + dir * 12} y2={tk.y} className="stroke-line/90" strokeWidth={1.5} />
          <text
            x={labelX}
            y={tk.y}
            textAnchor={anchor}
            dominantBaseline="central"
            className="fill-ink-strong text-[8px] tabular-nums"
          >
            {u.fmt('length', tk.label, rulerDigits)}
          </text>
        </g>
      ))}
      <text
        x={labelX}
        y={vTop - 6}
        textAnchor={anchor}
        data-ruler-unit
        className="fill-ink-soft text-[9px] font-medium"
      >
        {u.sym('length')}
      </text>
    </g>
  );
}
