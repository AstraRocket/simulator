import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UnitChip } from '../common/UnitChip';
import { NumberInput } from '../common/NumberInput';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { unitScope } from '../../prefs/units';
import { token } from '../common/colorTokens';

type Pt = [number, number];

const FALLBACK: Pt[] = [
  [0, 0],
  [0.02, 0.05],
  [0.05, 0.05],
  [0.06, 0],
];

// Points are [x, y] in meters: x along the body, y above its surface; the root closes along y = 0.
export function FreeformFinEditor({
  points,
  onChange,
  onCommit,
}: {
  points: Pt[];
  onChange: (pts: Pt[]) => void;
  onCommit?: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const ptX = u.at(unitScope('freeform', 'x'), 'length');
  const ptY = u.at(unitScope('freeform', 'y'), 'length');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const pts: Pt[] = points.length >= 3 ? points : FALLBACK;

  const W = 300,
    H = 180,
    PAD = 22;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(xMin + 0.01, ...xs);
  const yMax = Math.max(0.01, ...ys);
  const scale = Math.min((W - 2 * PAD) / (xMax - xMin), (H - 2 * PAD) / yMax);
  const sx = (x: number) => PAD + (x - xMin) * scale;
  const sy = (y: number) => H - PAD - y * scale;

  const toVB = (e: React.PointerEvent): DOMPoint | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  };

  const last = pts.length - 1;
  // FreeformFinSet.setPoints pins the first, clampLastPoint snaps the last, removePoint refuses both.
  const fixedEnd = (i: number) => i === 0 || i === last;
  // Interior x is unbounded, as in FreeformFinSet.setPoint, for swept-forward leading edges.
  const setPoint = (i: number, x: number, y: number) => {
    if (i === 0) return;
    onChange(
      pts.map((p, j) => (j === i ? ([i === last ? Math.max(0, x) : x, i === last ? 0 : Math.max(0, y)] as Pt) : p)),
    );
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragging.current == null) return;
    const p = toVB(e);
    if (p) setPoint(dragging.current, xMin + (p.x - PAD) / scale, (H - PAD - p.y) / scale);
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
    onChange([...pts.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, ...pts.slice(i + 1)]);
    setSel(i + 1);
    onCommit?.();
  };
  const removeSel = () => {
    if (sel == null || pts.length <= 3 || fixedEnd(sel)) return;
    onChange(pts.filter((_, j) => j !== sel));
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
      setPoint(i, p[0] + dx, p[1] + dy);
      onCommit?.();
    };
    if (e.key === 'ArrowLeft') return move(-step, 0);
    if (e.key === 'ArrowRight') return move(step, 0);
    if (e.key === 'ArrowUp') return move(0, step);
    if (e.key === 'ArrowDown') return move(0, -step);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setSel(i);
      if (pts.length > 3 && !fixedEnd(i)) {
        onChange(pts.filter((_, j) => j !== i));
        setSel(null);
        onCommit?.();
      }
    }
  };

  const poly = pts.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ');
  const selPt = sel != null ? pts[sel] : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">{t('freeform.outline')}</span>
        <button
          onClick={removeSel}
          disabled={sel == null || pts.length <= 3 || fixedEnd(sel)}
          className="rounded bg-raised px-2 py-1 text-xs text-ink-soft hover:bg-elevated disabled:opacity-40"
        >
          {t('freeform.removePoint')}
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="group"
        aria-label={t('freeform.outline')}
        className="block touch-none rounded-lg bg-canvas ring-1 ring-line/10"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <line x1={PAD / 2} y1={sy(0)} x2={W - PAD / 2} y2={sy(0)} className="stroke-line/15" strokeDasharray="4 3" />
        <polygon
          points={poly}
          fill={token('warn-400')}
          fillOpacity="0.18"
          stroke={token('warn-400')}
          strokeWidth="1.5"
        />
        {pts.slice(0, last).map((p, i) => {
          const b = pts[i + 1]!;
          return (
            <circle
              key={`add-${i}`}
              cx={(sx(p[0]) + sx(b[0])) / 2}
              cy={(sy(p[1]) + sy(b[1])) / 2}
              r="4"
              role="button"
              tabIndex={0}
              aria-label={t('freeform.insertAfter', { n: i + 1 })}
              // Focus is a stroke: an SVG shape draws no box-shadow ring.
              className="cursor-pointer fill-accent-500/60 hover:fill-accent-400 focus:outline-none focus-visible:stroke-ink-strong focus-visible:stroke-2"
              onPointerDown={(e) => {
                e.stopPropagation();
                insertAfter(i);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                insertAfter(i);
              }}
            />
          );
        })}
        {pts.map((p, i) =>
          i === 0 ? (
            <circle
              key="v-0"
              cx={sx(p[0])}
              cy={sy(p[1])}
              r="4"
              strokeWidth="1.5"
              aria-hidden="true"
              className="fill-surface stroke-warn-500"
            />
          ) : (
            <circle
              key={`v-${i}`}
              cx={sx(p[0])}
              cy={sy(p[1])}
              r="5.5"
              strokeWidth="1.5"
              role="button"
              tabIndex={0}
              aria-label={t('freeform.vertex', { n: i + 1 })}
              className={`cursor-grab stroke-surface focus:outline-none focus-visible:stroke-ink-strong focus-visible:stroke-[2.5] ${
                sel === i ? 'fill-warn-300' : 'fill-warn-500'
              }`}
              onPointerDown={startDrag(i)}
              onFocus={() => setSel(i)}
              onKeyDown={onVertexKey(i)}
            />
          ),
        )}
      </svg>

      {selPt && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="text-ink-faint">{t('freeform.point', { n: sel! + 1 })}</span>
          <label className="flex items-center gap-1">
            {t('freeform.x')}
            {/* A raw `parseFloat(...) || 0` snaps the vertex to the origin while the box holds only `-`. */}
            <NumberInput
              value={ptX.toUi(selPt[0])}
              onChange={onSi(ptX, (si) => si !== null && setPoint(sel!, si, selPt[1]))}
              onCommit={onCommit}
              step={ptX.step(0.001)}
              ariaLabel={t('freeform.x')}
              className="w-16 rounded bg-raised px-1.5 py-0.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
            />
            <UnitChip label={t('freeform.x')} quantity="length" scope={unitScope('freeform', 'x')} />
          </label>
          <label className="flex items-center gap-1">
            {t('freeform.y')}
            <NumberInput
              value={ptY.toUi(selPt[1])}
              onChange={onSi(ptY, (si) => si !== null && setPoint(sel!, selPt[0], si))}
              onCommit={onCommit}
              disabled={sel === last}
              step={ptY.step(0.001)}
              ariaLabel={t('freeform.y')}
              className="w-16 rounded bg-raised px-1.5 py-0.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
            />
            <UnitChip label={t('freeform.y')} quantity="length" scope={unitScope('freeform', 'y')} />
          </label>
        </div>
      )}
      <p className="text-[11px] leading-snug text-ink-faint">{t('freeform.hint')}</p>
    </div>
  );
}
