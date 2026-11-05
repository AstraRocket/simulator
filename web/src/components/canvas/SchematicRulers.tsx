import { useMemo } from 'react';
import { useUnits, type Units } from '../../prefs/useUnits';
import { tickDigits } from '../../i18n/format';
import {
  isZoomIdentity,
  niceRulerStep,
  rulerGraduations,
  RULER_H,
  RULER_W,
  type ZoomState,
} from '../../tree/schematicGeometry';
import { token } from '../common/colorTokens';
import { rulerSpan, CORNER_GAP } from './rulerSpan';

export interface RulerSides {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

interface RulerFrameProps {
  rulers: RulerSides;
  w: number;
  h: number;
  zoom: ZoomState;
  ctxX0: number;
  // Screen px per meter.
  viewScale: number;
  rTop: number;
  rBot: number;
}

/** Where the marks fall, shared so the grid's lines land on the ruler's. */
function rulerFrame({ rulers, w, h, zoom, ctxX0, viewScale, rTop, rBot }: RulerFrameProps, u: Units) {
  const rulerStepUi = niceRulerStep(u.toUi('length', (8 * 22) / viewScale));
  const vTop = rTop + 4;
  const vBot = h - rBot - 4;
  return {
    ...rulerSpan(rulers, w),
    rulerStepUi,
    rulerStep: u.fromUi('length', rulerStepUi),
    frameTopY: rulers.top ? RULER_H - 4 + CORNER_GAP : 2,
    frameBotY: rulers.bottom ? h - RULER_H + 4 - CORNER_GAP : h - 2,
    vTop,
    vSpanM: (vBot - vTop) / viewScale,
    x0: zoom.x + zoom.k * ctxX0,
    vy0: zoom.y + zoom.k * vTop,
  };
}

/**
 * A `path`, not a `g`: `schematicSvg` takes the svg's first `g` as the zoom group.
 * Drawn at the current zoom, so that export leaves it out.
 */
export function SchematicGrid(props: RulerFrameProps) {
  const u = useUnits();
  const { rulerX0, rulerX1, rulerStep, frameTopY, frameBotY, vTop, vSpanM, x0, vy0 } = rulerFrame(props, u);
  const scale = props.viewScale;
  const { rulerMarks, vTicks } = rulerGraduations({
    showLen: true,
    showRad: true,
    rulerStep,
    rulerX0,
    rulerX1,
    x0,
    scale,
    vSpanM,
    vTop,
    vy0,
  });
  const d = [
    ...rulerMarks.map((m) => `M${x0 + m * scale} ${frameTopY}V${frameBotY}`),
    ...vTicks.map((tk) => `M${rulerX0} ${tk.y}H${rulerX1}`),
  ].join('');
  return <path data-schematic-grid d={d} fill="none" pointerEvents="none" className="stroke-line/20" />;
}

export function SchematicRulerLayer(props: RulerFrameProps) {
  const { rulers, w, h, zoom, viewScale } = props;
  const u = useUnits();
  const { rulerX0, rulerX1, rulerStepUi, rulerStep, frameTopY, frameBotY, vTop, vSpanM, x0, vy0 } = rulerFrame(
    props,
    u,
  );
  const showLen = rulers.top || rulers.bottom;
  const showRad = rulers.left || rulers.right;
  const zoomed = !isZoomIdentity(zoom);
  // The step's own decimals, so a 2.5 step labels 2.5 and 7.5 rather than 3 and 8.
  const rulerDigits = tickDigits(rulerStepUi, 0, 3);
  const { rulerMarks, vTicks, rulerMinorMarks, vMinorTicks } = useMemo(
    () => rulerGraduations({ showLen, showRad, rulerStep, rulerX0, rulerX1, x0, scale: viewScale, vSpanM, vTop, vy0 }),
    [showLen, showRad, rulerStep, rulerX0, rulerX1, x0, viewScale, vSpanM, vTop, vy0],
  );
  const lengthRulerProps = { x0: rulerX0, x1: rulerX1, ctxX0: x0, scale: viewScale, rulerStep, rulerDigits };
  const radialRulerProps = { frameTopY, frameBotY, vTop, originY: vy0, scale: viewScale, rulerStep, rulerDigits };

  return (
    <>
      {zoomed && (
        <g pointerEvents="none" fill={token('surface')} opacity={0.9}>
          {rulers.top && <rect x={0} y={0} width={w} height={RULER_H} />}
          {rulers.bottom && <rect x={0} y={h - RULER_H} width={w} height={RULER_H} />}
          {rulers.left && <rect x={0} y={0} width={RULER_W} height={h} />}
          {rulers.right && <rect x={w - RULER_W} y={0} width={RULER_W} height={h} />}
        </g>
      )}
      {rulers.bottom && (
        <LengthRuler
          {...lengthRulerProps}
          baseY={h - RULER_H + 4}
          dir={1}
          labelY={h - 3}
          unitY={h - 3}
          marks={rulerMarks}
          minorMarks={rulerMinorMarks}
        />
      )}
      {rulers.top && (
        <LengthRuler
          {...lengthRulerProps}
          baseY={RULER_H - 4}
          dir={-1}
          labelY={11}
          unitY={11}
          marks={rulerMarks}
          minorMarks={rulerMinorMarks}
        />
      )}
      {rulers.right && vTicks.length > 0 && (
        <RadialRuler
          {...radialRulerProps}
          baseX={w - RULER_W + 4}
          dir={1}
          labelX={w - RULER_W + 20}
          anchor="start"
          ticks={vTicks}
          minorTicks={vMinorTicks}
        />
      )}
      {rulers.left && vTicks.length > 0 && (
        <RadialRuler
          {...radialRulerProps}
          baseX={RULER_W - 4}
          dir={-1}
          labelX={RULER_W - 20}
          anchor="end"
          ticks={vTicks}
          minorTicks={vMinorTicks}
        />
      )}
    </>
  );
}

function LengthRuler({
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

function RadialRuler({
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
