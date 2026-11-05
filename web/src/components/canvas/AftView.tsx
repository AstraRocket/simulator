import { must } from '../../services/app/must';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RocketTree } from '../../engine/openRocketEngine';
import { MAX_ZOOM, WHEEL_ZOOM_FACTOR, ZOOM_IDENTITY, zoomStep, type MotorDims } from '../../tree/schematicGeometry';
import { ZoomButtons } from './ZoomButtons';
import { useWheelZoom } from './useWheelZoom';
import { zoomSurfaceProps } from './keyPan';
import { radToDeg } from '../../prefs/units';
import { token } from '../common/colorTokens';
import { buildAftScene, type Shape } from './aftScene';

// Hoisted so the hook's options keep one identity.
const WHEEL_ZOOM = { factor: WHEEL_ZOOM_FACTOR, max: MAX_ZOOM };

/** The square viewBox is letterboxed (xMidYMid meet), so map through the screen matrix. */
function clientToViewBox(
  svg: SVGSVGElement | null,
  rect: DOMRect,
  E: number,
  clientX: number,
  clientY: number,
): { vx: number; vy: number } {
  const m = typeof svg?.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
  const det = m ? m.a * m.d - m.b * m.c : 0;
  if (m && det !== 0) {
    const dx = clientX - m.e;
    const dy = clientY - m.f;
    return { vx: (m.d * dx - m.c * dy) / det, vy: (m.a * dy - m.b * dx) / det };
  }
  return {
    vx: -E + ((clientX - rect.left) / rect.width) * 2 * E,
    vy: -E + ((clientY - rect.top) / rect.height) * 2 * E,
  };
}

export function AftView({
  tree,
  motors,
  hiddenIds,
  roll = 0,
  onRoll,
}: {
  tree: RocketTree;
  motors?: MotorDims;
  hiddenIds?: ReadonlySet<string>;
  /** Radians. */
  roll?: number;
  onRoll?: (deltaRadians: number) => void;
}) {
  const { t } = useTranslation();
  // Zoom/pan in viewBox (meter) coordinates.
  const [zoom, setZoom] = useState(ZOOM_IDENTITY);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pan = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const rollDrag = useRef<number | null>(null);
  const zoomBy = (f: number) => setZoom((z) => zoomStep(z, 0, 0, f, WHEEL_ZOOM.max));
  // Roll and zoom are applied by the SVG transform, so neither is a memo input.
  const { hulls, inner, outer, extent } = useMemo(
    () => buildAftScene(tree.components, motors, t, hiddenIds),
    [tree.components, motors, t, hiddenIds],
  );

  const E = extent * 1.12;
  const scale = 1;
  const toSvg = (v: number) => v * scale;

  const wheelToView = useCallback(
    (e: WheelEvent, rect: DOMRect) => {
      const { vx, vy } = clientToViewBox(svgRef.current, rect, E, e.clientX, e.clientY);
      return { px: vx, py: vy };
    },
    [E],
  );
  useWheelZoom(svgRef, setZoom, wheelToView, WHEEL_ZOOM);

  // Dash arrays are given in screen pixels; scale them with the line width.
  const dashAt = (dash: string | undefined) =>
    !dash || dash === 'none'
      ? dash
      : dash
          .split(' ')
          .map((d) => (Number(d) * E) / 110)
          .join(' ');
  const ink = (s: Shape) => ({ fill: s.fill, stroke: s.stroke, strokeWidth: E / 220, strokeDasharray: dashAt(s.dash) });
  const drawShape = (s: Shape) => {
    if (s.kind === 'circle') {
      return (
        <circle
          key={s.key}
          cx={toSvg(s.y)}
          cy={-toSvg(s.z)}
          r={toSvg(s.r)}
          fill={s.fill}
          fillOpacity={s.fill === token('sch-motor') ? 0.45 : undefined}
          stroke={s.stroke}
          strokeWidth={E / 220}
          strokeDasharray={dashAt(s.dash)}
        >
          {s.title ? <title>{s.title}</title> : null}
        </circle>
      );
    }
    if (s.kind === 'poly') {
      return (
        <polygon key={s.key} points={s.points.map(([y, z]) => `${toSvg(y)},${-toSvg(z)}`).join(' ')} {...ink(s)}>
          {s.title ? <title>{s.title}</title> : null}
        </polygon>
      );
    }
    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);
    const ny = -sin;
    const nz = cos;
    const h = s.thick / 2;
    const pts: [number, number][] = [
      [s.y + s.from * cos + ny * h, s.z + s.from * sin + nz * h],
      [s.y + s.to * cos + ny * h, s.z + s.to * sin + nz * h],
      [s.y + s.to * cos - ny * h, s.z + s.to * sin - nz * h],
      [s.y + s.from * cos - ny * h, s.z + s.from * sin - nz * h],
    ];
    return (
      <polygon key={s.key} points={pts.map(([y, z]) => `${toSvg(y)},${-toSvg(z)}`).join(' ')} {...ink(s)}>
        {s.title ? <title>{s.title}</title> : null}
      </polygon>
    );
  };

  const toView = (clientX: number, clientY: number) =>
    clientToViewBox(svgRef.current, must(svgRef.current, 'aft view').getBoundingClientRect(), E, clientX, clientY);
  const surface = zoomSurfaceProps(zoom, setZoom, 2 * E, t('schematic.aftAria'), t('schematic.panHint'));
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`${-E} ${-E} ${2 * E} ${2 * E}`}
        {...surface}
        style={{ width: '100%', height: '100%', display: 'block', ...surface.style }}
        // Not "img": it hides every per-part <title> from screen readers.
        role="group"
        onPointerDown={(e) => {
          if (zoom.k <= 1) {
            if (!onRoll) return;
            rollDrag.current = e.clientX;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            return;
          }
          const { vx, vy } = toView(e.clientX, e.clientY);
          pan.current = { px: vx, py: vy, x: zoom.x, y: zoom.y };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (rollDrag.current !== null && onRoll) {
            const width = svgRef.current?.getBoundingClientRect().width || 300;
            // Negated with the drawing's rotation, so a drag right turns it clockwise.
            onRoll((-(e.clientX - rollDrag.current) / width) * 2 * Math.PI);
            rollDrag.current = e.clientX;
            return;
          }
          // Read here, not in the updater: a pointer-up before it runs nulls pan.current.
          const p = pan.current;
          if (!p || !svgRef.current) return;
          const { vx, vy } = toView(e.clientX, e.clientY);
          setZoom((z) => ({ ...z, x: p.x + (vx - p.px), y: p.y + (vy - p.py) }));
        }}
        onPointerUp={() => {
          pan.current = null;
          rollDrag.current = null;
        }}
        onPointerLeave={() => {
          pan.current = null;
          rollDrag.current = null;
        }}
        // A touch the OS takes over ends without a pointerup.
        onPointerCancel={() => {
          pan.current = null;
          rollDrag.current = null;
        }}
      >
        {/* Negated: SVG rotate() is clockwise, and roll must match the side view's cos(angle + roll). */}
        <g transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k}) rotate(${-radToDeg(roll)})`}>
          {hulls.map(drawShape)}
          {inner.map(drawShape)}
          {outer.map(drawShape)}
          <line x1={-E * 0.05} y1={0} x2={E * 0.05} y2={0} stroke={token('sch-ink')} strokeWidth={E / 300} />
          <line x1={0} y1={-E * 0.05} x2={0} y2={E * 0.05} stroke={token('sch-ink')} strokeWidth={E / 300} />
        </g>
      </svg>
      <div className="schematic-controls">
        <ZoomButtons zoom={zoom} setZoom={setZoom} zoomBy={zoomBy} />
      </div>
    </div>
  );
}
