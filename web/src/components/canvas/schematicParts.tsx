import type { ComponentNode } from '../../engine/openRocketEngine';
import {
  FREEFORM_FALLBACK,
  finPlacement,
  finBodyPoint,
  finPointsWithRoot,
  finRootChord,
  finSpan,
  finTabPoints,
  type FinPose,
} from '../../tree/finPlanform';
import { finCant, num, str } from '../../tree/nodeProps';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults.js';
import { railButtonSize } from './railButton';
import { placementOffsets, turnedOffset } from '../../tree/placement';
import { tubeFinSeat } from '../../tree/tubefins.js';
import { motorSeatStart } from '../../tree/position.js';
import { DISC_TYPES } from '../../services/files/componentFormats.js';
import { discDims, tubeRadii } from '../../services/design/discGeometry.js';
import { token } from '../common/colorTokens';
import { pointsAttr } from '../common/svgPath';
import { dashOf } from '../../services/design/figureStyle';
import { axialStart, innerTubeExtent, internalExtent } from '../../tree/schematicGeometry';
import { figureInk, type Painter } from './schematicPainter';

/** Where a child part sits: its parent's span and radius in meters, and the section's centerline in px. */
export interface PartPlace {
  parent: ComponentNode;
  pStart: number;
  pLen: number;
  pRadius: number;
  baseY: number;
  // `turn` is the view roll plus every enclosing pod angle (FlightConfiguration.java:470-485).
  turn: number;
  surfaceAt: (x: number) => number;
}

function finTabShape(
  paint: Painter,
  child: ComponentNode,
  baseY: number,
  pose: FinPose,
  tab: [number, number][] | null,
): void {
  const { ctx, wire, wires, shapes, nextKey } = paint;
  if (!tab) return;
  const [front, bottomFront, , trail] = tab as [[number, number], [number, number], [number, number], [number, number]];
  const at = (x: number, y: number): [number, number] => {
    const [bx, by] = finBodyPoint(x, y, 0, pose);
    return [ctx.x0 + bx * ctx.scale, baseY - by * ctx.scale];
  };
  const px = (x: number) => at(x, 0)[0];
  const py = (y: number) => at(0, y)[1];
  const ink = {
    fill: wire ? 'none' : figureInk(child),
    fillOpacity: wire ? undefined : '0.35',
    stroke: token('sch-line'),
    strokeWidth: '1',
    strokeDasharray: '3 2',
    style: { pointerEvents: 'none' } as React.CSSProperties,
  };
  const ys = [py(front[1]), py(bottomFront[1]), py(trail[1])];
  const hPx = Math.max(...ys) - Math.min(...ys);
  if (wire && hPx < 0.5) return;
  if (front[1] === trail[1] && pose.cant === 0) {
    const yInner = py(bottomFront[1]);
    const ySurface = py(front[1]);
    (wire ? wires : shapes).push(
      <rect
        key={nextKey()}
        x={px(front[0])}
        y={Math.min(yInner, ySurface)}
        width={Math.max(2, (trail[0] - front[0]) * ctx.scale)}
        height={wire ? hPx : Math.max(1.5, hPx)}
        {...ink}
      />,
    );
    return;
  }
  (wire ? wires : shapes).push(<polygon key={nextKey()} points={pointsAttr(tab.map(([x, y]) => at(x, y)))} {...ink} />);
}

export function finSetShapes(paint: Painter, at: PartPlace, child: ComponentNode): void {
  const { ctx, wire, shapes, overlay, nextKey, noteHoverFins, wallClip, finFactors, pushWire, partLine } = paint;
  const { parent, pStart, pLen, pRadius, baseY, turn } = at;
  const grab = paint.clickable(child);
  // Body radius under the fin front, not the widest.
  const { fp, R } = finPlacement(child, parent, pStart, pRadius);
  const outline = finPointsWithRoot(child, fp) ?? FREEFORM_FALLBACK;
  const tab = finTabPoints(child, fp);
  const chord = finRootChord(child);
  const aftX = Math.max(...outline.map((pt) => pt[0]));
  const start = typeof fp === 'number' ? axialStart(child, chord, pStart, pLen) : pStart + fp.front;
  // A freeform fin's span reads its parent (`FreeformFinSet.getSpan`).
  const ymax = finSpan(child, fp);
  const reach = R + ymax;
  const cant = finCant(child);
  const projections = finFactors(child, turn);
  noteHoverFins(child, ctx.x0 + start * ctx.scale, ctx.x0 + (start + aftX) * ctx.scale, baseY, reach, R, projections);
  const clip = wallClip(parent, pStart, pLen, pRadius, baseY);
  for (const { angle, p, near } of projections) {
    const pose: FinPose = { front: start, radius: R, chord, cant, angle };
    const ptsStr = pointsAttr(
      outline.map(([px, py]) => {
        const [bx, by] = finBodyPoint(px, py, 0, pose);
        return [ctx.x0 + bx * ctx.scale, baseY - by * ctx.scale];
      }),
    );
    if (wire) {
      pushWire(child, grab, clip, (extra) => <polygon key={nextKey()} points={ptsStr} {...extra} />);
      finTabShape(paint, child, baseY, pose, tab);
      continue;
    }
    const body = (
      <polygon
        key={nextKey()}
        points={ptsStr}
        clipPath={near ? undefined : `url(#${clip})`}
        {...partLine(child, figureInk(child))}
        {...grab}
      />
    );
    if (reach * Math.abs(p) > R) {
      (near ? overlay : shapes).push(body);
      finTabShape(paint, child, baseY, pose, tab);
    }
  }
}

export function tubeFinShapes(paint: Painter, at: PartPlace, child: ComponentNode): void {
  const { ctx, wire, shapes, overlay, wires, nextKey, noteHover, wallClip, finFactors, pushWire, selStroke, selWidth } =
    paint;
  const { parent, pStart, pLen, pRadius, baseY, turn, surfaceAt } = at;
  const grab = paint.clickable(child);
  const seat = tubeFinSeat(child, pStart, pLen, (o) => surfaceAt(pStart + o));
  const { length: len, start, bodyRadius: R, tubeRadius: rt } = seat;
  const X = ctx.x0 + start * ctx.scale;
  noteHover(child, X, baseY - (R + 2 * rt) * ctx.scale, X + len * ctx.scale, baseY + (R + 2 * rt) * ctx.scale);
  const tubes = finFactors(child, turn, 6);
  const tubeClip = wallClip(parent, pStart, pLen, pRadius, baseY);
  for (const { p, near } of tubes) {
    const yc = baseY - (R + rt) * p * ctx.scale;
    const half = rt * ctx.scale;
    const w2 = Math.max(2, len * ctx.scale);
    const centerline = (cut?: string) => (
      <line
        key={nextKey()}
        x1={X}
        y1={yc}
        x2={X + len * ctx.scale}
        y2={yc}
        clipPath={cut}
        stroke={token('sch-line')}
        strokeWidth="0.8"
        strokeDasharray="4 3"
        style={{ pointerEvents: 'none' }}
      />
    );
    if (wire) {
      pushWire(child, grab, tubeClip, (extra) => (
        <rect key={nextKey()} x={X} y={yc - half} width={w2} height={2 * half} rx="2" {...extra} />
      ));
      wires.push(centerline());
      continue;
    }
    const cut = near ? undefined : `url(#${tubeClip})`;
    if ((R + rt) * Math.abs(p) + rt > R) {
      const into = near ? overlay : shapes;
      into.push(
        <rect
          key={nextKey()}
          x={X}
          y={yc - half}
          clipPath={cut}
          width={w2}
          height={2 * half}
          rx="2"
          fill={figureInk(child)}
          fillOpacity="0.6"
          stroke={selStroke(child, token('sch-line'))}
          strokeWidth={selWidth(child)}
          strokeDasharray={dashOf(child)}
          {...grab}
        />,
        centerline(cut),
      );
    }
  }
}

export function fairingShape(paint: Painter, at: PartPlace, child: ComponentNode): void {
  const { ctx, shapes, nextKey, noteHover, partLine } = paint;
  const { pStart, pLen, baseY, surfaceAt } = at;
  const grab = paint.clickable(child);
  const len = num(child, 'length', KERNEL_DEFAULTS.fairing.length);
  const hgt = num(child, 'height', KERNEL_DEFAULTS.fairing.height);
  const fshape = str(child, 'fairingShape', 'halfround');
  const start = axialStart(child, len, pStart, pLen);
  const X = ctx.x0 + start * ctx.scale;
  const y0 = baseY - surfaceAt(start) * ctx.scale;
  const yh = y0 - hgt * ctx.scale;
  const Xe = X + len * ctx.scale;
  noteHover(child, X, yh, Xe, y0);
  shapes.push(
    fshape === 'streamlined' ? (
      <polygon
        key={nextKey()}
        points={`${X},${y0} ${X + 0.3 * len * ctx.scale},${yh} ${X + 0.7 * len * ctx.scale},${yh} ${Xe},${y0}`}
        {...partLine(child, figureInk(child))}
        {...grab}
      />
    ) : fshape === 'halfround' ? (
      <path
        key={nextKey()}
        d={`M ${X} ${y0} L ${X} ${yh + 0.35 * (y0 - yh)} Q ${X} ${yh} ${X + Math.min(8, len * ctx.scale * 0.25)} ${yh} L ${Xe - Math.min(8, len * ctx.scale * 0.25)} ${yh} Q ${Xe} ${yh} ${Xe} ${yh + 0.35 * (y0 - yh)} L ${Xe} ${y0} Z`}
        {...partLine(child, figureInk(child))}
        {...grab}
      />
    ) : (
      <rect
        key={nextKey()}
        x={X}
        y={yh}
        width={Math.max(2, len * ctx.scale)}
        height={Math.max(2, hgt * ctx.scale)}
        {...partLine(child, figureInk(child))}
        {...grab}
      />
    ),
  );
}

export function lugShape(paint: Painter, at: PartPlace, child: ComponentNode): void {
  const { ctx, shapes, nextKey, noteHover, partLine } = paint;
  const { pStart, pLen, baseY, turn, surfaceAt } = at;
  const grab = paint.clickable(child);
  const t = child.type;
  // A rail button is 0-long in the kernel (RailButton.getInstanceBoundingBox), so it is centered.
  const btn = t === 'railbutton' ? railButtonSize(child) : null;
  const len = btn ? btn.diameter : num(child, 'length', KERNEL_DEFAULTS.launchlug.length);
  const reach = btn ? btn.reach : 2 * num(child, 'outerRadius', KERNEL_DEFAULTS.launchlug.outerRadius);
  const station = axialStart(child, btn ? 0 : len, pStart, pLen);
  const start = btn ? station - len / 2 : station;
  const c = Math.cos(
    num(child, 'angleOffset', KERNEL_DEFAULTS[t === 'railbutton' ? 'railbutton' : 'launchlug'].angleOffset) + turn,
  );
  const R = surfaceAt(station);
  const yInner = baseY - R * c * ctx.scale;
  const yOuter = baseY - (R + reach) * c * ctx.scale;
  const yTop = Math.min(yInner, yOuter);
  const h = Math.max(1, Math.abs(yOuter - yInner));
  noteHover(child, ctx.x0 + start * ctx.scale, yTop, ctx.x0 + (start + len) * ctx.scale, yTop + h);
  shapes.push(
    <rect
      key={nextKey()}
      x={ctx.x0 + start * ctx.scale}
      y={yTop}
      width={Math.max(2, len * ctx.scale)}
      height={h}
      {...partLine(child, figureInk(child))}
      {...grab}
    />,
  );
}

/** The tag text is `schematic.tag.<type>`, in the user's language. */
const TAGGED_TYPES: ReadonlySet<string> = new Set([
  'parachute',
  'streamer',
  'shockcord',
  'masscomponent',
  'centeringring',
  'bulkhead',
  'engineblock',
  'tubecoupler',
  'innertube',
]);

/** True when the type has a glyph, which then replaces the tag. */
function partGlyph(
  paint: Painter,
  child: ComponentNode,
  gcx: number,
  gcy: number,
  gs: number,
  bw: number,
  bh: number,
): boolean {
  const { overlay, nextKey } = paint;
  const g = gs / 2;
  const glyphProps = {
    stroke: figureInk(child),
    fill: 'none',
    strokeWidth: 1.2,
    style: { pointerEvents: 'none' as const },
  };
  if (child.type === 'parachute') {
    overlay.push(
      <g key={nextKey()} {...glyphProps}>
        <path d={`M ${gcx - g} ${gcy} A ${g} ${g} 0 0 1 ${gcx + g} ${gcy}`} />
        <path
          d={`M ${gcx - g} ${gcy} L ${gcx} ${gcy + g} L ${gcx + g} ${gcy} M ${gcx - g * 0.45} ${gcy - g * 0.65} L ${gcx} ${gcy + g} M ${gcx + g * 0.45} ${gcy - g * 0.65} L ${gcx} ${gcy + g}`}
        />
      </g>,
    );
  } else if (child.type === 'masscomponent') {
    overlay.push(
      <g key={nextKey()} {...glyphProps}>
        <rect
          x={gcx - g * 0.7}
          y={gcy - g * 0.35}
          width={g * 1.4}
          height={g * 1.05}
          fill={figureInk(child)}
          fillOpacity="0.35"
        />
        <path
          d={`M ${gcx - g * 0.35} ${gcy - g * 0.35} A ${g * 0.4} ${g * 0.5} 0 0 1 ${gcx + g * 0.35} ${gcy - g * 0.35}`}
        />
      </g>,
    );
  } else if (child.type === 'centeringring') {
    overlay.push(
      <g key={nextKey()} {...glyphProps}>
        <line x1={gcx} y1={gcy - bh / 2 + 1.5} x2={gcx} y2={gcy - bh * 0.16} strokeWidth={Math.max(2, bw * 0.5)} />
        <line x1={gcx} y1={gcy + bh * 0.16} x2={gcx} y2={gcy + bh / 2 - 1.5} strokeWidth={Math.max(2, bw * 0.5)} />
      </g>,
    );
  } else if (child.type === 'shockcord') {
    const seg = gs / 4;
    overlay.push(
      <path
        key={nextKey()}
        {...glyphProps}
        d={`M ${gcx - g} ${gcy} ${[1, 2, 3, 4].map((i) => `L ${gcx - g + i * seg * 2 - seg} ${gcy + (i % 2 ? -1 : 1) * g * 0.45} L ${gcx - g + i * seg * 2} ${gcy}`).join(' ')}`}
      />,
    );
  } else return false;
  return true;
}

export function internalShapes(
  paint: Painter,
  at: PartPlace,
  child: ComponentNode,
  nest: (parent: ComponentNode, start: number, len: number, r: number, baseY: number, turn: number) => void,
): void {
  const { ctx, overlay, motors, nextKey, nameOf, noteHover, selStroke, selWidth, motorShapes } = paint;
  const { parent, pStart, pLen, pRadius, baseY, turn } = at;
  const grab = paint.clickable(child);
  const tagged = TAGGED_TYPES.has(child.type);
  // Not `internalExtent` for discs: its 85% cap would draw a coupler too small.
  const disc = DISC_TYPES.has(child.type) ? discDims(child, tubeRadii(parent), parent, pStart) : null;
  const { length: len, radius: r } = disc
    ? { length: disc.length, radius: disc.outerR }
    : child.type === 'innertube'
      ? innerTubeExtent(child)
      : internalExtent(child, pRadius);
  const start = axialStart(child, len, pStart, pLen);
  const offsets = placementOffsets(child, r).map((off) => turnedOffset(off, turn));
  const motor = child.type === 'innertube' && child.id ? motors?.[child.id] : undefined;
  for (const off of offsets) {
    const inkColor = selStroke(child, figureInk(child));
    noteHover(
      child,
      ctx.x0 + start * ctx.scale,
      baseY - (off.y + r) * ctx.scale,
      ctx.x0 + (start + len) * ctx.scale,
      baseY - (off.y - r) * ctx.scale,
    );
    overlay.push(
      <rect
        key={nextKey()}
        x={ctx.x0 + start * ctx.scale}
        y={baseY - (off.y + r) * ctx.scale}
        width={Math.max(2, len * ctx.scale)}
        height={2 * r * ctx.scale}
        fill={child.type === 'bulkhead' ? 'url(#bulkhead-hatch)' : 'rgba(127,127,127,0.001)'}
        stroke={inkColor}
        strokeWidth={selWidth(child)}
        strokeDasharray={dashOf(child, '3 2')}
        {...grab}
      >
        <title>{nameOf(child)}</title>
      </rect>,
    );
    const bw = len * ctx.scale;
    const bh = 2 * r * ctx.scale;
    const gcx = ctx.x0 + (start + len / 2) * ctx.scale;
    const gcy = baseY - off.y * ctx.scale;
    const gs = Math.min(bw * 0.8, bh * 0.7);
    const hasGlyph = gs >= 8 && partGlyph(paint, child, gcx, gcy, gs, bw, bh);
    const tagRoom = len * ctx.scale > 26 && 2 * r * ctx.scale > 11;
    if (tagged && !hasGlyph && tagRoom) {
      const tx = ctx.x0 + (start + len / 2) * ctx.scale;
      const ty = baseY - off.y * ctx.scale;
      overlay.push(
        <text
          key={nextKey()}
          x={tx}
          y={ty}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8.5"
          fill={figureInk(child)}
          style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {paint.typeTag(child.type)}
        </text>,
      );
    }
    if (motor) {
      overlay.push(...motorShapes(motor, motorSeatStart(child, start, len, motor.length), baseY - off.y * ctx.scale));
    }
    nest(child, start, len, r, baseY - off.y * ctx.scale, turn);
  }
}
