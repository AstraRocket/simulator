import { useTranslation } from 'react-i18next';
import type { StaticInfo } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import type { StabilityState } from '../../services/flight/simReport.js';
import {
  calloutLayout,
  hoverTagFor,
  marginText,
  MARKER_R,
  stationLabel,
  type Ctx,
  type HoverBox,
} from '../../tree/schematicGeometry';
import { token } from '../common/colorTokens';

// Every group is pointerEvents="none": the markers sit on the centerline where parts are clicked.

const LABEL_CHAR_W = 7; // px, 11 px bold

const STABILITY_VAR: Record<StabilityState, string> = {
  under: 'var(--status-serious)',
  over: 'var(--status-warn)',
  ok: 'var(--status-good)',
};

export function StabilityOverlay({
  info,
  showMarkers,
  ctx,
  scale,
  vHalf,
  w,
  h,
}: {
  info: StaticInfo | null;
  showMarkers: boolean;
  ctx: Ctx;
  scale: number;
  vHalf: number;
  w: number;
  h: number;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  // NaN stations are skipped, or the SVG gets cx="NaN".
  const cgX = info && showMarkers && Number.isFinite(info.cg) ? ctx.x0 + info.cg * scale : null;
  const cpX = info && showMarkers && Number.isFinite(info.cp) ? ctx.x0 + info.cp * scale : null;
  const margin = info ? marginText(info.stabilityCalibers, info.stabilityPercent, t) : null;
  const stab = margin?.state ?? null;
  const cgLabel = info ? stationLabel(t, u, 'cg', info.cg) : t('schematic.cg');
  const cpLabel = info ? stationLabel(t, u, 'cp', info.cp) : t('schematic.cp');
  const callouts = calloutLayout(cgX, cpX, ctx.cy, vHalf * scale, w, h, margin?.text ?? null);
  const side = (x: number, label: string) =>
    x + 8 + label.length * LABEL_CHAR_W > w
      ? { x: x - 8, textAnchor: 'end' as const }
      : { x: x + 8, textAnchor: 'start' as const };

  return (
    <>
      {cgX !== null && (
        <g pointerEvents="none">
          <circle
            cx={cgX}
            cy={ctx.cy}
            r={MARKER_R}
            fill="var(--surface-1)"
            stroke="var(--text-primary)"
            strokeWidth="1.5"
          />
          <path
            d={`M ${cgX} ${ctx.cy} L ${cgX + MARKER_R} ${ctx.cy} A ${MARKER_R} ${MARKER_R} 0 0 1 ${cgX} ${ctx.cy + MARKER_R} Z`}
            fill="var(--text-primary)"
          />
          <path
            d={`M ${cgX} ${ctx.cy} L ${cgX - MARKER_R} ${ctx.cy} A ${MARKER_R} ${MARKER_R} 0 0 1 ${cgX} ${ctx.cy - MARKER_R} Z`}
            fill="var(--text-primary)"
          />
        </g>
      )}
      {cpX !== null && (
        <g pointerEvents="none">
          <circle cx={cpX} cy={ctx.cy} r={MARKER_R} fill="none" stroke="var(--status-serious)" strokeWidth="2" />
          <circle cx={cpX} cy={ctx.cy} r={3.5} fill="var(--status-serious)" />
        </g>
      )}
      {(callouts.cg || callouts.cp) && (
        <g pointerEvents="none">
          {callouts.cg && (
            <>
              <line
                x1={callouts.cg.x}
                y1={callouts.cg.leaderY1}
                x2={callouts.cg.x}
                y2={callouts.cg.leaderY2}
                stroke="var(--text-primary)"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <circle cx={callouts.cg.x} cy={callouts.cg.leaderY2} r={4} fill="var(--text-primary)" />
              <text
                {...side(callouts.cg.x, cgLabel)}
                y={callouts.cg.leaderY2}
                dominantBaseline="central"
                fontSize="11"
                fontWeight="bold"
                fill="var(--text-primary)"
              >
                {cgLabel}
              </text>
            </>
          )}
          {callouts.cp && (
            <>
              <line
                x1={callouts.cp.x}
                y1={callouts.cp.leaderY1}
                x2={callouts.cp.x}
                y2={callouts.cp.leaderY2}
                stroke="var(--status-serious)"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <circle cx={callouts.cp.x} cy={callouts.cp.leaderY2} r={4} fill="var(--status-serious)" />
              <text
                {...side(callouts.cp.x, cpLabel)}
                y={callouts.cp.leaderY2}
                dominantBaseline="central"
                fontSize="11"
                fontWeight="bold"
                fill="var(--status-serious)"
              >
                {cpLabel}
              </text>
            </>
          )}
          {callouts.margin && stab && (
            <text
              x={callouts.margin.x}
              y={callouts.margin.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="11"
              fontWeight="bold"
              fill={STABILITY_VAR[stab]}
            >
              {margin?.text}
            </text>
          )}
        </g>
      )}
    </>
  );
}

export function HoverOverlay({ box, name, w, h }: { box: HoverBox | null; name: string; w: number; h: number }) {
  const tag = box ? hoverTagFor(box, name, w, h) : null;
  if (!box || !tag) return null;
  return (
    <g pointerEvents="none">
      <rect
        x={box.x0 - 2}
        y={box.y0 - 2}
        width={box.x1 - box.x0 + 4}
        height={box.y1 - box.y0 + 4}
        rx="3"
        fill="var(--accent)"
        fillOpacity="0.14"
        stroke="var(--accent)"
        strokeWidth="1"
        strokeOpacity="0.6"
      />
      <g>
        <rect
          x={tag.x - tag.tw / 2}
          y={tag.y - 9}
          width={tag.tw}
          height={18}
          rx="4"
          fill="rgba(13,14,18,0.9)"
          stroke="var(--border)"
          strokeWidth="1"
        />
        <text
          x={tag.x}
          y={tag.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fill={token('sch-label')}
        >
          {name}
        </text>
      </g>
    </g>
  );
}
