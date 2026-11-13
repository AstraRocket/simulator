import { useTranslation } from 'react-i18next';
import { UnitChip } from '../common/UnitChip';
import { NumberInput } from '../common/NumberInput';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { unitScope } from '../../prefs/units';
import { token } from '../common/colorTokens';
import { pointsAttr } from '../common/svgPath';
import { PanelButton } from './PanelButton';
import type { Pt } from './finViewport';
import { useFreeformEditing } from './useFreeformEditing';

function FinOutline({
  edit: { pts, view, svgRef, sel, setSel, last, onMove, startDrag, endDrag, insertAfter, onVertexKey },
}: {
  edit: ReturnType<typeof useFreeformEditing>;
}) {
  const { t } = useTranslation();
  const { W, H, PAD, sx, sy } = view;
  const poly = pointsAttr(
    pts.map((p) => [sx(p[0]), sy(p[1])]),
    1,
  );
  return (
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
      <polygon points={poly} fill={token('warn-400')} fillOpacity="0.18" stroke={token('warn-400')} strokeWidth="1.5" />
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
  );
}

function PointFields({
  n: sel,
  point: selPt,
  last,
  setPoint,
  onCommit,
}: {
  n: number;
  point: Pt;
  last: number;
  setPoint: (i: number, x: number, y: number) => void;
  onCommit: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const ptX = u.at(unitScope('freeform', 'x'), 'length');
  const ptY = u.at(unitScope('freeform', 'y'), 'length');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
      <span className="text-ink-faint">{t('freeform.point', { n: sel + 1 })}</span>
      <label className="flex items-center gap-1">
        {t('freeform.x')}
        {/* A raw `parseFloat(...) || 0` snaps the vertex to the origin while the box holds only `-`. */}
        <NumberInput
          value={ptX.toUi(selPt[0])}
          onChange={onSi(ptX, (si) => si !== null && setPoint(sel, si, selPt[1]))}
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
          onChange={onSi(ptY, (si) => si !== null && setPoint(sel, selPt[0], si))}
          onCommit={onCommit}
          disabled={sel === last}
          step={ptY.step(0.001)}
          ariaLabel={t('freeform.y')}
          className="w-16 rounded bg-raised px-1.5 py-0.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        />
        <UnitChip label={t('freeform.y')} quantity="length" scope={unitScope('freeform', 'y')} />
      </label>
    </div>
  );
}

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
  const edit = useFreeformEditing({ points, onChange, onCommit });
  const { pts, sel, last, fixedEnd, setPoint, removeSel } = edit;
  const selPt = sel != null ? pts[sel] : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">{t('freeform.outline')}</span>
        <PanelButton onClick={removeSel} disabled={sel == null || pts.length <= 3 || fixedEnd(sel)}>
          {t('freeform.removePoint')}
        </PanelButton>
      </div>

      <FinOutline edit={edit} />

      {sel != null && selPt && (
        <PointFields n={sel} point={selPt} last={last} setPoint={setPoint} onCommit={onCommit} />
      )}
      <p className="text-[11px] leading-snug text-ink-faint">{t('freeform.hint')}</p>
    </div>
  );
}
