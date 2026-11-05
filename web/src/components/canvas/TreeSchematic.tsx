import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ComponentNode, RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { partLabel } from '../../i18n/format';
import type { ExportData } from '../../services/exports/schematicExport.js';
import {
  computeSchematicLayout,
  RULER_H,
  RULER_W,
  ZOOM_IDENTITY,
  zoomStep,
  MAX_ZOOM,
  WHEEL_ZOOM_FACTOR,
  type MotorDims,
} from '../../tree/schematicGeometry';
import { buildSchematicShapes, SchematicDefs } from './schematicShapes';
import { useWheelZoom } from './useWheelZoom';
import { zoomSurfaceProps } from './keyPan';
import { HorizontalCaliper, VerticalCaliper } from './SchematicCalipers';
import { SchematicControls } from './SchematicControls';
import { ZoomButtons } from './ZoomButtons';
import { HoverOverlay, StabilityOverlay } from './SchematicOverlay';
import { rulerSpan, SchematicGrid, SchematicRulerLayer, type RulerSides } from './SchematicRulers';
import { useSchematicDrag } from './useSchematicDrag';
import { useElementResize } from '../common/useElementResize';

// Module scope so memo dependencies keep one identity.
const DEFAULT_RULERS = { top: true, bottom: false, left: true, right: false };
const WHEEL_ZOOM = { factor: WHEEL_ZOOM_FACTOR, max: MAX_ZOOM };
const ZOOM_CLEAR = 36; // px

// Left at this length on purpose: dragging, rulers, overlays and part drawing already live elsewhere.
// What remains is the layout and the zoom and hover state those parts share, so another split would only move lines.
// eslint-disable-next-line max-lines-per-function -- its parts already live elsewhere; see the comment above
export function TreeSchematic({
  tree,
  info,
  motors,
  hiddenIds,
  showGrid = false,
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
  hiddenIds?: ReadonlySet<string>;
  showGrid?: boolean;
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
  rulers?: RulerSides;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(640);
  const [chPx, setChPx] = useState(480);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // viewBox px
  const [zoom, setZoom] = useState(ZOOM_IDENTITY);
  const { t } = useTranslation();

  const layout = useMemo(
    () => computeSchematicLayout(tree, info, { chPx, cw, maxHeight, fillHeight, rulers }),
    [tree, info, chPx, cw, maxHeight, fillHeight, rulers],
  );
  const { chain, totalLen, maxR, vHalf, rTop, rBot, w, h, scale, ctx } = layout;
  const { caliperH, setCaliperH, caliperV, setCaliperV, beginPan, beginCaliperDrag, caliperKeys, onMove, endDrag } =
    useSchematicDrag({ svgRef, layout, zoom, setZoom, onRoll });

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
        hiddenIds,
        selectedId,
        onSelect,
        setHoverId,
        partName,
        typeTag,
      }),
    [chain, ctx, scale, w, h, roll, uid, motors, hiddenIds, selectedId, onSelect, partName, typeTag],
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

  // Screen px per meter.
  const viewScale = scale * zoom.k;
  const viewCtx = { ...ctx, x0: zoom.x + zoom.k * ctx.x0, cy: zoom.y + zoom.k * ctx.cy };
  const { rulerX0, rulerX1 } = rulerSpan(rulers, w);

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
        <SchematicDefs clipDefs={clipDefs} />
        {showGrid && (
          <SchematicGrid
            rulers={rulers}
            w={w}
            h={h}
            zoom={zoom}
            ctxX0={ctx.x0}
            viewScale={viewScale}
            rTop={rTop}
            rBot={rBot}
          />
        )}
        <g transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
          {shapes}
          {overlay}
          {wires}
        </g>
        <SchematicRulerLayer
          rulers={rulers}
          w={w}
          h={h}
          zoom={zoom}
          ctxX0={ctx.x0}
          viewScale={viewScale}
          rTop={rTop}
          rBot={rBot}
        />
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
