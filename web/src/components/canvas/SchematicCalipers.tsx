import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import type { Ctx } from '../../tree/schematicGeometry';
import { token } from '../common/colorTokens';

// Lands on `lo` when hi < lo.
const clampX = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

interface CaliperProps {
  cal: { a: number; b: number };
  ctx: Ctx;
  scale: number;
  totalLen: number;
  // viewBox px
  viewX0: number;
  viewX1: number;
  onDragStart: (end: 'a' | 'b') => (e: React.PointerEvent) => void;
  onKey: (end: 'a' | 'b') => (e: React.KeyboardEvent) => void;
}

export function HorizontalCaliper({
  cal,
  ctx,
  scale,
  h,
  rBot,
  rTop = 0,
  totalLen,
  viewX0,
  viewX1,
  onDragStart,
  onKey,
}: CaliperProps & {
  h: number;
  rBot: number;
  rTop?: number; // viewBox px
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const ax = ctx.x0 + cal.a * scale,
    bx = ctx.x0 + cal.b * scale;
  const top = rTop + 4,
    bot = h - rBot - 2,
    dimY = rTop + 14,
    mid = clampX((ax + bx) / 2, viewX0 + 28, viewX1 - 28);
  return (
    <g>
      {(['a', 'b'] as const).map((k) => {
        const x = ctx.x0 + cal[k] * scale;
        return (
          <g key={k}>
            <line
              x1={x}
              y1={top}
              x2={x}
              y2={bot}
              stroke="var(--accent)"
              strokeWidth="1"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={x - 5}
              y={top}
              width={10}
              height={bot - top}
              fill="transparent"
              style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
              onPointerDown={onDragStart(k)}
              tabIndex={0}
              role="slider"
              aria-label={t('schematic.caliperH', { end: k === 'a' ? 1 : 2 })}
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={totalLen}
              aria-valuenow={cal[k]}
              aria-valuetext={`${u.fmtSym('length', cal[k])}`}
              onKeyDown={onKey(k)}
            />
            <circle cx={x} cy={top + 2} r={3.5} fill="var(--accent)" pointerEvents="none" />
          </g>
        );
      })}
      <g pointerEvents="none">
        <line
          x1={ax}
          y1={dimY}
          x2={bx}
          y2={dimY}
          stroke="var(--accent)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* Theme surface, not a fixed dark box: the readout must hold 4.5:1 in every theme. */}
        <rect
          x={mid - 28}
          y={dimY - 9}
          width={56}
          height={14}
          rx="3"
          fill={token('surface')}
          stroke="var(--accent)"
          strokeWidth="0.8"
        />
        <text x={mid} y={dimY - 1} textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--accent)">
          {u.fmtSym('length', Math.abs(cal.b - cal.a))}
        </text>
      </g>
    </g>
  );
}

export function VerticalCaliper({
  cal,
  ctx,
  scale,
  totalLen,
  vHalf,
  viewX0,
  onDragStart,
  onKey,
}: CaliperProps & { vHalf: number }) {
  const { t } = useTranslation();
  const u = useUnits();
  const ay = ctx.cy - cal.a * scale,
    by = ctx.cy - cal.b * scale;
  const left = ctx.x0,
    right = ctx.x0 + totalLen * scale;
  const grip = Math.min(right, Math.max(left, viewX0));
  const dimX = grip + 20,
    mid = (ay + by) / 2;
  const vMin = -vHalf;
  return (
    <g>
      {(['a', 'b'] as const).map((k) => {
        const y = ctx.cy - cal[k] * scale;
        return (
          <g key={k}>
            <line
              x1={left}
              y1={y}
              x2={right}
              y2={y}
              stroke="var(--accent)"
              strokeWidth="1"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={grip - 4}
              y={y - 8}
              width={34}
              height={16}
              fill="transparent"
              style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
              onPointerDown={onDragStart(k)}
              tabIndex={0}
              role="slider"
              aria-label={t('schematic.caliperV', { end: k === 'a' ? 1 : 2 })}
              aria-orientation="vertical"
              aria-valuemin={vMin}
              aria-valuemax={vHalf}
              aria-valuenow={cal[k]}
              aria-valuetext={`${u.fmtSym('length', cal[k])}`}
              onKeyDown={onKey(k)}
            />
            <circle cx={grip + 4} cy={y} r={3.5} fill="var(--accent)" pointerEvents="none" />
          </g>
        );
      })}
      <g pointerEvents="none">
        <line
          x1={dimX}
          y1={ay}
          x2={dimX}
          y2={by}
          stroke="var(--accent)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={dimX - 30}
          y={mid - 7}
          width={60}
          height={14}
          rx="3"
          fill={token('surface')}
          stroke="var(--accent)"
          strokeWidth="0.8"
        />
        <text x={dimX} y={mid + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--accent)">
          {u.fmtSym('length', Math.abs(cal.a - cal.b))}
        </text>
      </g>
    </g>
  );
}
