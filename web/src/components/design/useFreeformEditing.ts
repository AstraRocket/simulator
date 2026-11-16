import { useRef, useState } from 'react';
import { finViewport, type Pt } from './finViewport';
import { outlineCrossesItself } from '../../services/design/finOutline';

const FALLBACK: Pt[] = [
  [0, 0],
  [0.02, 0.05],
  [0.05, 0.05],
  [0.06, 0],
];

export function useFreeformEditing({
  points,
  onChange,
  onCommit,
}: {
  points: Pt[];
  onChange: (pts: Pt[]) => void;
  onCommit: (() => void) | undefined;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const pts: Pt[] = points.length >= 3 ? points : FALLBACK;

  // As desktop's setPoint: an edit that would cross the outline is refused and the last good one kept,
  // since the kernel refuses a crossing outline and the whole design stops building.
  const apply = (next: Pt[]): boolean => {
    if (outlineCrossesItself(next)) return false;
    onChange(next);
    return true;
  };

  const view = finViewport(pts);

  const toVB = (e: React.PointerEvent): DOMPoint | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  };

  const last = pts.length - 1;
  // FreeformFinSet.setPoints pins the first, clampLastPoint snaps the last, removePoint refuses both.
  const fixedEnd = (i: number) => i === 0 || i === last;
  // Interior x is unbounded, as in FreeformFinSet.setPoint, for swept-forward leading edges.
  const setPoint = (i: number, x: number, y: number): boolean => {
    if (i === 0) return false;
    return apply(
      pts.map((p, j) => (j === i ? ([i === last ? Math.max(0, x) : x, i === last ? 0 : Math.max(0, y)] as Pt) : p)),
    );
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragging.current == null) return;
    const p = toVB(e);
    if (p) setPoint(dragging.current, ...view.fromView(p.x, p.y));
  };

  const startDrag = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragging.current = i;
    setSel(i);
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  // Also on pointercancel and lostpointercapture: a scroll takeover or pen out of range sends no pointerup.
  const endDrag = (e: React.PointerEvent) => {
    if (dragging.current != null) onCommit?.();
    dragging.current = null;
    try {
      svgRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
  };

  // No insert on the closing root edge: FreeformFinSet.addPoint refuses an index past the trailing edge.
  const insertAfter = (i: number) => {
    if (i >= last) return;
    const a = pts[i]!,
      b = pts[i + 1]!;
    if (!apply([...pts.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, ...pts.slice(i + 1)])) return;
    setSel(i + 1);
    onCommit?.();
  };
  const removeSel = () => {
    if (sel == null || pts.length <= 3 || fixedEnd(sel)) return;
    if (!apply(pts.filter((_, j) => j !== sel))) return;
    setSel(null);
    onCommit?.();
  };

  const NUDGE = 0.001; // 1 mm, in stored meters
  const onVertexKey = (i: number) => (e: React.KeyboardEvent) => {
    const p = pts[i]!;
    const step = e.shiftKey ? NUDGE * 10 : NUDGE;
    const move = (dx: number, dy: number) => {
      e.preventDefault();
      setSel(i);
      if (setPoint(i, p[0] + dx, p[1] + dy)) onCommit?.();
    };
    if (e.key === 'ArrowLeft') return move(-step, 0);
    if (e.key === 'ArrowRight') return move(step, 0);
    if (e.key === 'ArrowUp') return move(0, step);
    if (e.key === 'ArrowDown') return move(0, -step);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setSel(i);
      if (pts.length > 3 && !fixedEnd(i) && apply(pts.filter((_, j) => j !== i))) {
        setSel(null);
        onCommit?.();
      }
    }
  };

  return {
    pts,
    view,
    svgRef,
    sel,
    setSel,
    last,
    fixedEnd,
    setPoint,
    onMove,
    startDrag,
    endDrag,
    insertAfter,
    removeSel,
    onVertexKey,
  };
}
