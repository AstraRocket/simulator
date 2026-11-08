import { useRef, useState, type RefObject } from 'react';
import { snapNear, type ZoomState, type computeSchematicLayout } from '../../tree/schematicGeometry';

// Client px; a physical click jitters 1-3 px.
const PAN_SLOP = 4;

/** Pan and roll on the svg, and the two calipers' drag and arrow keys. */
export function useSchematicDrag({
  svgRef,
  layout,
  zoom,
  setZoom,
  onRoll,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  layout: ReturnType<typeof computeSchematicLayout>;
  zoom: ZoomState;
  setZoom: (f: (z: ZoomState) => ZoomState) => void;
  onRoll?: (deltaRadians: number) => void;
}) {
  const { totalLen, vHalf, snapXs, radialSnaps, w, h, scale, ctx } = layout;
  // Model meters: H is x, V is radial offset from the centerline.
  const [caliperH, setCaliperH] = useState<{ a: number; b: number } | null>(null);
  const [caliperV, setCaliperV] = useState<{ a: number; b: number } | null>(null);
  const caliperDrag = useRef<{ axis: 'h' | 'v'; end: 'a' | 'b' } | null>(null);
  const pan = useRef<{ pointerX: number; pointerY: number; x0: number; y0: number; active: boolean } | null>(null);

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

  return { caliperH, setCaliperH, caliperV, setCaliperV, beginPan, beginCaliperDrag, caliperKeys, onMove, endDrag };
}
