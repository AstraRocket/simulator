import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ComponentNode, RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { partLabel, tickDigits } from '../../i18n/format';
import type { ExportData } from '../../services/exports/schematicExport.js';
import {
  computeSchematicLayout,
  niceRulerStep,
  rulerGraduations,
  RULER_H,
  RULER_W,
  snapNear,
  ZOOM_IDENTITY,
  zoomStep,
  MAX_ZOOM,
  WHEEL_ZOOM_FACTOR,
  isZoomIdentity,
  type MotorDims,
} from '../../tree/schematicGeometry';
import { buildSchematicShapes } from './schematicShapes';
import { useWheelZoom } from './useWheelZoom';
import { zoomSurfaceProps } from './keyPan';
import { HorizontalCaliper, VerticalCaliper } from './SchematicCalipers';
import { SchematicControls } from './SchematicControls';
import { ZoomButtons } from './ZoomButtons';
import { HoverOverlay, StabilityOverlay } from './SchematicOverlay';
import { LengthRuler, RadialRuler } from './SchematicRulers';
import { useElementResize } from '../common/useElementResize';
import { token } from '../common/colorTokens';

// Client px; a physical click jitters 1-3 px.
const PAN_SLOP = 4;

// Module scope so memo dependencies keep one identity.
const DEFAULT_RULERS = { top: true, bottom: false, left: true, right: false };
const WHEEL_ZOOM = { factor: WHEEL_ZOOM_FACTOR, max: MAX_ZOOM };
const ZOOM_CLEAR = 36; // px

export function TreeSchematic({
  tree,
  info,
  motors,
  maxHeight = 480,
  selectedId,
  onSelect,
  exportData,
  onError,
  fillHeight,
  roll = 0,
  onRoll,
  controlsSlot,
  showMarkers = true,
  rulers = DEFAULT_RULERS,
}: {
  tree: RocketTree;
  info: StaticInfo | null;
  motors?: MotorDims;
  maxHeight?: number; // px
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  exportData?: ExportData;
  onError?: (message: string) => void;
  fillHeight?: boolean;
  // Radians; each fin projects by cos(roll + i*2pi/N), as in OpenRocket.
  roll?: number;
  onRoll?: (deltaRadians: number) => void;
  controlsSlot?: HTMLElement | null;
  showMarkers?: boolean;
  rulers?: { top: boolean; bottom: boolean; left: boolean; right: boolean };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(640);
  const [chPx, setChPx] = useState(480);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // viewBox px
  const [zoom, setZoom] = useState(ZOOM_IDENTITY);
  // Model meters: H is x, V is radial offset from the centerline.
  const [caliperH, setCaliperH] = useState<{ a: number; b: number } | null>(null);
  const [caliperV, setCaliperV] = useState<{ a: number; b: number } | null>(null);
  const caliperDrag = useRef<{ axis: 'h' | 'v'; end: 'a' | 'b' } | null>(null);
  const { t } = useTranslation();
  const u = useUnits();
  const pan = useRef<{ pointerX: number; pointerY: number; x0: number; y0: number; active: boolean } | null>(null);

  const layout = useMemo(
    () => computeSchematicLayout(tree, info, { chPx, cw, maxHeight, fillHeight, rulers }),
    [tree, info, chPx, cw, maxHeight, fillHeight, rulers],
  );
  const { chain, totalLen, maxR, vHalf, snapXs, radialSnaps, rTop, rBot, w, h, scale, ctx } = layout;

  // Arms only: capturing on press would land the click on the <svg>, not the part.
  const beginPan = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    pan.current = { pointerX: e.clientX, pointerY: e.clientY, x0: zoom.x, y0: zoom.y, active: false };
  };

  // Meters.
  const clientToModelX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    const viewBoxX = ((clientX - rect.left) / rect.width) * w;
    return ((viewBoxX - zoom.x) / zoom.k - ctx.x0) / scale;
  };
  // Meters, + up.
  const clientToModelY = (clientY: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.height) return 0;
    const viewBoxY = ((clientY - rect.top) / rect.height) * h;
    return (ctx.cy - (viewBoxY - zoom.y) / zoom.k) / scale;
  };

  const beginCaliperDrag = (axis: 'h' | 'v', end: 'a' | 'b') => (e: React.PointerEvent) => {
    e.stopPropagation();
    caliperDrag.current = { axis, end };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const caliperKeys = (axis: 'h' | 'v', end: 'a' | 'b') => (e: React.KeyboardEvent) => {
    const step = (e.shiftKey ? 0.01 : 0.001) * (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1);
    const isArrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
    if (!isArrow && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    e.stopPropagation();
    if (axis === 'h') {
      setCaliperH((c) => {
        if (!c) return c;
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? totalLen : c[end] + step;
        return { ...c, [end]: Math.max(0, Math.min(totalLen, next)) };
      });
    } else {
      setCaliperV((c) => {
        if (!c) return c;
        const next = e.key === 'Home' ? -vHalf : e.key === 'End' ? vHalf : c[end] + step;
        return { ...c, [end]: Math.max(-vHalf, Math.min(vHalf, next)) };
      });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (caliperDrag.current) {
      const { axis, end } = caliperDrag.current;
      const eps = 6 / (scale * zoom.k); // 6 screen px
      if (axis === 'h') {
        const mx = Math.max(0, Math.min(totalLen, snapNear(clientToModelX(e.clientX), snapXs, eps)));
        setCaliperH((c) => (c ? { ...c, [end]: mx } : c));
      } else {
        const raw = clientToModelY(e.clientY);
        const mag = snapNear(Math.abs(raw), radialSnaps, eps);
        const my = Math.max(-vHalf, Math.min(vHalf, Math.sign(raw || 1) * mag));
        setCaliperV((c) => (c ? { ...c, [end]: my } : c));
      }
      return;
    }
    const p = pan.current;
    if (p) {
      const dx = e.clientX - p.pointerX;
      const dy = e.clientY - p.pointerY;
      if (!p.active) {
        if (Math.abs(dx) < PAN_SLOP && Math.abs(dy) < PAN_SLOP) return;
        p.active = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      if (onRoll && zoom.k <= 1) {
        const r = svgRef.current?.getBoundingClientRect();
        const width = r && r.width ? r.width : 400;
        onRoll((dx / width) * 2 * Math.PI);
        p.pointerX = e.clientX;
        return;
      }
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const clientScale = w / rect.width;
      setZoom((z) => ({ ...z, x: p.x0 + dx * clientScale, y: p.y0 + dy * clientScale }));
    }
  };

  const endDrag = () => {
    pan.current = null;
    caliperDrag.current = null;
  };

  useElementResize(wrapRef, (_r, el) => {
    if (el.clientWidth > 0) setCw(el.clientWidth);
    if (el.clientHeight > 0) setChPx(el.clientHeight);
  });

  const wheelToView = useCallback(
    (e: WheelEvent, rect: DOMRect) => ({
      px: ((e.clientX - rect.left) / rect.width) * w,
      py: ((e.clientY - rect.top) / rect.height) * h,
    }),
    [w, h],
  );
  useWheelZoom(svgRef, setZoom, wheelToView, WHEEL_ZOOM);

  const zoomBy = (f: number) => setZoom((z) => zoomStep(z, w / 2, h / 2, f, WHEEL_ZOOM.max));

  // Namespaces clipPath ids: url(#id) resolves to the first match in the document.
  const uid = useId().replace(/:/g, '');
  const partName = useCallback((n: ComponentNode) => partLabel(t, n), [t]);
  const typeTag = useCallback((type: string) => t(`schematic.tag.${type}`), [t]);
  // The hovered id is deliberately not an input: hover resolves from `extents`, not a rebuild.
  const { shapes, overlay, wires, clipDefs, extents } = useMemo(
    () =>
      buildSchematicShapes({
        chain,
        ctx,
        scale,
        w,
        h,
        roll,
        uid,
        motors,
        selectedId,
        onSelect,
        setHoverId,
        partName,
        typeTag,
      }),
    [chain, ctx, scale, w, h, roll, uid, motors, selectedId, onSelect, partName, typeTag],
  );
  const hovered = hoverId ? extents.get(hoverId) : undefined;
  const hoverBox = hovered
    ? {
        x0: zoom.x + zoom.k * hovered.box.x0,
        x1: zoom.x + zoom.k * hovered.box.x1,
        y0: zoom.y + zoom.k * hovered.box.y0,
        y1: zoom.y + zoom.k * hovered.box.y1,
      }
    : null;

  const showLen = rulers.top || rulers.bottom;
  const showRad = rulers.left || rulers.right;
  // Screen px per meter.
  const viewScale = scale * zoom.k;
  const zoomed = !isZoomIdentity(zoom);
  const viewCtx = { ...ctx, x0: zoom.x + zoom.k * ctx.x0, cy: zoom.y + zoom.k * ctx.cy };
  const rulerStepUi = niceRulerStep(u.toUi('length', (8 * 22) / viewScale));
  const rulerStep = u.fromUi('length', rulerStepUi);
  // The step's own decimals, so a 2.5 step labels 2.5 and 7.5 rather than 3 and 8.
  const rulerDigits = tickDigits(rulerStepUi, 0, 3);
  const CORNER_GAP = 5;
  const rulerX0 = rulers.left ? RULER_W - 4 + CORNER_GAP : 2;
  const rulerX1 = rulers.right ? w - RULER_W + 4 - CORNER_GAP : w - 2;
  const frameTopY = rulers.top ? RULER_H - 4 + CORNER_GAP : 2;
  const frameBotY = rulers.bottom ? h - RULER_H + 4 - CORNER_GAP : h - 2;
  const vTop = rTop + 4;
  const vBot = h - rBot - 4;
  const vSpanM = (vBot - vTop) / viewScale;
  // Read out first so the memo keys on numbers; reading `ctx.x0` inside, the compiler refuses to preserve it.
  const x0 = zoom.x + zoom.k * ctx.x0;
  const vy0 = zoom.y + zoom.k * vTop;
  const { rulerMarks, vTicks, rulerMinorMarks, vMinorTicks } = useMemo(
    () => rulerGraduations({ showLen, showRad, rulerStep, rulerX0, rulerX1, x0, scale: viewScale, vSpanM, vTop, vy0 }),
    [showLen, showRad, rulerStep, rulerX0, rulerX1, x0, viewScale, vSpanM, vTop, vy0],
  );
  const lengthRulerProps = { x0: rulerX0, x1: rulerX1, ctxX0: x0, scale: viewScale, rulerStep, rulerDigits };
  const radialRulerProps = { frameTopY, frameBotY, vTop, originY: vy0, scale: viewScale, rulerStep, rulerDigits };

  const controls = (
    <SchematicControls
      svgRef={svgRef}
      exportData={exportData}
      onError={onError}
      scale={scale}
      w={w}
      h={h}
      totalLen={totalLen}
      maxR={maxR}
      caliperH={caliperH}
      caliperV={caliperV}
      setCaliperH={setCaliperH}
      setCaliperV={setCaliperV}
    />
  );
  const zoomButtons = <ZoomButtons zoom={zoom} setZoom={setZoom} zoomBy={zoomBy} />;
  const zoomCorner = {
    right: rulers.right ? RULER_W + 4 : 8,
    bottom: rulers.bottom ? RULER_H + 4 : 8,
  };

  const surface = zoomSurfaceProps(zoom, setZoom, w, t('schematic.sideAria'), t('schematic.panHint'));
  return (
    <div ref={wrapRef} style={{ position: 'relative', ...(fillHeight ? { height: '100%' } : null) }}>
      {/* No role="img": it would hide every clickable component from assistive tech. */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        {...surface}
        style={{ width: '100%', height: 'auto', display: 'block', ...surface.style }}
        onPointerDown={beginPan}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        // A touch the OS takes over ends without pointerup.
        onPointerCancel={endDrag}
      >
        <defs>
          <pattern id="bulkhead-hatch" patternUnits="userSpaceOnUse" width="5" height="5">
            <path d="M0 5 L5 0" stroke={token('sch-hatch')} strokeWidth="0.9" />
          </pattern>
          {clipDefs}
        </defs>
        <g transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
          {shapes}
          {overlay}
          {wires}
        </g>
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
        {/* After the rulers, so a ruler backing never covers them. */}
        <StabilityOverlay
          info={info}
          showMarkers={showMarkers}
          ctx={viewCtx}
          scale={viewScale}
          vHalf={vHalf}
          w={w}
          h={h - ZOOM_CLEAR}
        />
        <HoverOverlay box={hoverBox} name={hovered?.name ?? ''} w={w} h={h} />
        {caliperH && (
          <HorizontalCaliper
            cal={caliperH}
            ctx={viewCtx}
            scale={viewScale}
            h={h}
            rBot={rBot}
            rTop={rTop}
            totalLen={totalLen}
            viewX0={rulerX0}
            viewX1={rulerX1}
            onDragStart={(end) => beginCaliperDrag('h', end)}
            onKey={(end) => caliperKeys('h', end)}
          />
        )}
        {caliperV && (
          <VerticalCaliper
            cal={caliperV}
            ctx={viewCtx}
            scale={viewScale}
            totalLen={totalLen}
            viewX0={rulerX0}
            viewX1={rulerX1}
            vHalf={vHalf}
            onDragStart={(end) => beginCaliperDrag('v', end)}
            onKey={(end) => caliperKeys('v', end)}
          />
        )}
      </svg>
      {controlsSlot ? (
        <>
          {createPortal(controls, controlsSlot)}
          <div className="schematic-controls" style={zoomCorner}>
            {zoomButtons}
          </div>
        </>
      ) : (
        <div className="schematic-controls" style={zoomCorner}>
          {controls}
          {zoomButtons}
        </div>
      )}
    </div>
  );
}
