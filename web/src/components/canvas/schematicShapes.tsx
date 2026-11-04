import type { ComponentNode } from '../../engine/openRocketEngine';
import {
  FREEFORM_FALLBACK,
  bodyRadiusAt,
  finMount,
  finBodyPoint,
  finPointsWithRoot,
  finRootChord,
  finSpan,
  finTabPoints,
  mountRadius,
  type FinParent,
  type FinPose,
} from '../../tree/finPlanform';
import { hasShoulder, profileEnds, shouldersOf, type Shoulder } from '../../tree/shapeProfile';
import { bodyTubeRadius, countOf, finCant, noseConeAftRadius, num, str } from '../../tree/nodeProps';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults.js';
import { railButtonSize } from './railButton';
import { lineInstances, placementOffsets, turnedOffset } from '../../tree/placement';
import { tubeFinRadius } from '../../tree/tubefins.js';
import { DISPLAY_NAME } from '../../tree/schema.js';
import { motorSeatStart, partLength } from '../../tree/position.js';
import { DISC_TYPES } from '../../services/files/componentFormats.js';
import { discDims, tubeRadii } from '../../services/design/discGeometry.js';
import {
  assemblyChainLength,
  assemblyParentRadius,
  isAssembly,
  resolveAssemblyRadius,
  ringInstanceOffsets,
} from '../../tree/assembly.js';
import { token } from '../common/colorTokens';
import { dashOf } from '../../services/design/figureStyle';
import { chainWithKernelEnds } from '../../services/design/autoRadius.js';
import {
  axialStart,
  colorOf,
  figureToken,
  innerTubeExtent,
  internalExtent,
  profilePath,
  unionBox,
  type Ctx,
  type HoverBox,
} from '../../tree/schematicGeometry';

const fillOf = colorOf;

/** `p` = cos(angle): +1 up, 0 edge-on, -1 down. `near` (+z) draws whole; far fins clip at the wall. */
interface FinInstance {
  angle: number;
  p: number;
  near: boolean;
}

/** Hover is not an input, only its writer `setHoverId`, so hover never rebuilds shapes. */
export interface SchematicShapesCfg {
  chain: ComponentNode[];
  ctx: Ctx;
  scale: number;
  w: number;
  h: number;
  roll: number;
  /** clipPath id namespace: two schematics in one document would otherwise cross-clip. */
  uid: string;
  motors?: Record<string, { length: number; diameter: number; label?: string }>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  setHoverId: React.Dispatch<React.SetStateAction<string | null>>;
  partName?: (n: ComponentNode) => string;
  typeTag?: (type: string) => string;
}

export type HoverExtents = Map<string, { box: HoverBox; name: string }>;

export function buildSchematicShapes(cfg: SchematicShapesCfg): {
  shapes: React.ReactNode[];
  overlay: React.ReactNode[];
  wires: React.ReactNode[];
  clipDefs: React.ReactNode[];
  extents: HoverExtents;
} {
  const { ctx, scale, roll, uid, motors, selectedId, onSelect, setHoverId } = cfg;
  const chain = chainWithKernelEnds(cfg.chain);
  const nameOf = (n: ComponentNode): string =>
    cfg.partName?.(n) ?? ((typeof n.name === 'string' && n.name.trim()) || DISPLAY_NAME[n.type]);

  const isSel = (n: ComponentNode) => !!selectedId && n.id === selectedId;
  const clickable = (n: ComponentNode) => ({
    ...(n.id
      ? {
          onPointerEnter: () => setHoverId(n.id!),
          onPointerLeave: () => setHoverId((cur) => (cur === n.id ? null : cur)),
        }
      : {}),
    ...(onSelect && n.id
      ? {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelect(n.id!);
          },
          style: { cursor: 'pointer' } as React.CSSProperties,
        }
      : {}),
  });
  const selStroke = (n: ComponentNode, dflt: string) => (isSel(n) ? 'var(--accent)' : dflt);
  const selWidth = (n: ComponentNode, dflt: number | string = 1) => (isSel(n) ? 2 : dflt);
  const partLine = (n: ComponentNode, fill: string) => ({
    fill,
    stroke: selStroke(n, token('sch-line')),
    strokeWidth: selWidth(n),
    strokeDasharray: dashOf(n),
  });

  const shapes: React.ReactNode[] = [];
  // Painted after the whole hull: SVG stacks by document order, so a coupler would vanish under the next tube.
  const overlay: React.ReactNode[] = [];
  const wires: React.ReactNode[] = [];
  let key = 0;

  const wire = roll !== 0;

  const clipDefs: React.ReactNode[] = [];
  const FAR = 1e4;
  const airframeClips = new Map<string, string>();
  const airframeClip = (baseY: number, pRadius: number): string => {
    const top = baseY - pRadius * ctx.scale;
    const bottom = baseY + pRadius * ctx.scale;
    const memo = `${top.toFixed(3)}:${bottom.toFixed(3)}`;
    const seen = airframeClips.get(memo);
    if (seen) return seen;
    const id = `${uid}-outside-${airframeClips.size}`;
    airframeClips.set(memo, id);
    clipDefs.push(
      <clipPath key={id} id={id}>
        <rect x={-FAR} y={-FAR} width={2 * FAR} height={FAR + top} />
        <rect x={-FAR} y={bottom} width={2 * FAR} height={FAR} />
      </clipPath>,
    );
    return id;
  };

  const profileClips = new Map<string, string>();
  const wallClip = (parent: ComponentNode, pStart: number, pLen: number, pRadius: number, baseY: number): string => {
    if (parent.type !== 'nosecone' && parent.type !== 'transition') return airframeClip(baseY, pRadius);
    const { fore, aft } = profileEnds(parent);
    const outline = profilePath(ctx, parent, pStart, pLen, fore, aft, baseY);
    const seen = profileClips.get(outline);
    if (seen) return seen;
    const id = `${uid}-outside-profile-${profileClips.size}`;
    profileClips.set(outline, id);
    clipDefs.push(
      <clipPath key={id} id={id}>
        <path clipRule="evenodd" d={`M ${-FAR} ${-FAR} H ${FAR} V ${FAR} H ${-FAR} Z ${outline}`} />
      </clipPath>,
    );
    return id;
  };

  // Sorted furthest-out last so the reaching fin paints on top.
  const finFactors = (n: ComponentNode, turn: number, dfltCount = 3): FinInstance[] => {
    const count = countOf(n, 'finCount', dfltCount);
    const out: FinInstance[] = ringInstanceOffsets(count, 1, num(n, 'rotation', 0) + turn).map(({ y, z, angle }) => ({
      angle,
      p: y,
      near: z >= 0,
    }));
    return out.sort((x, y) => Math.abs(x.p) - Math.abs(y.p));
  };

  const wireInk = (n: ComponentNode, grab: Record<string, unknown>) => ({
    ...grab,
    fill: 'none',
    stroke: selStroke(n, fillOf(n, token('sch-line'))),
    strokeWidth: selWidth(n, 1.4),
    strokeDasharray: dashOf(n),
  });

  // Hit surface clipped outside the airframe so a click on bare tube misses a fin lying inside it.
  const pushWire = (
    n: ComponentNode,
    grab: Record<string, unknown>,
    clip: string,
    shape: (extra: Record<string, unknown>) => React.ReactNode,
  ) => {
    wires.push(shape(wireInk(n, grab)));
    wires.push(shape({ ...grab, fill: 'transparent', stroke: 'none', clipPath: `url(#${clip})` }));
  };

  const noteHoverFins = (
    n: ComponentNode,
    x0: number,
    x1: number,
    baseY: number,
    reach: number,
    pRadius: number,
    projections: FinInstance[],
  ) => {
    if (!projections.length) return;
    const ys = projections.flatMap(({ p, near }) => [
      baseY - reach * p * ctx.scale,
      baseY - pRadius * (near || wire ? p : Math.sign(p)) * ctx.scale,
    ]);
    noteHover(n, x0, Math.min(...ys), x1, Math.max(...ys));
  };

  // Recorded for all parts: filtering on the hovered id would rebuild every shape on hover.
  const extents: HoverExtents = new Map();
  const noteHover = (n: ComponentNode, x0: number, y0: number, x1: number, y1: number) => {
    if (!n.id) return;
    const box: HoverBox = {
      x0: Math.min(x0, x1),
      y0: Math.min(y0, y1),
      x1: Math.max(x0, x1),
      y1: Math.max(y0, y1),
    };
    const prev = extents.get(n.id);
    extents.set(n.id, { box: prev ? unionBox(prev.box, box) : box, name: nameOf(n) });
  };

  const motorShapes = (
    motor: { length: number; diameter: number; label?: string },
    mStart: number,
    cY: number,
  ): React.ReactNode[] => {
    const mR = motor.diameter / 2;
    const out: React.ReactNode[] = [
      <rect
        key={key++}
        x={ctx.x0 + mStart * ctx.scale}
        y={cY - mR * ctx.scale}
        width={Math.max(2, motor.length * ctx.scale)}
        height={Math.max(2, 2 * mR * ctx.scale)}
        rx="1"
        fill="var(--launch)"
        fillOpacity="0.85"
        stroke={token('sch-motor-outline')}
        strokeWidth="0.8"
        style={{ pointerEvents: 'none' }}
      />,
    ];
    if (motor.label && motor.length * ctx.scale > 36) {
      const lx = ctx.x0 + (mStart + motor.length / 2) * ctx.scale;
      out.push(
        <text
          key={key++}
          x={lx}
          y={cY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="10"
          fontWeight="bold"
          fill={token('sch-label')}
          style={{ pointerEvents: 'none' }}
        >
          {motor.label}
        </text>,
      );
    }
    return out;
  };

  // `turn` is the view roll plus every enclosing pod angle (FlightConfiguration.java:470-485).
  const renderChildren = (
    parent: ComponentNode,
    pStart: number,
    pLen: number,
    pRadius: number,
    baseY: number,
    turn: number,
  ) => {
    const surfaceAt = (x: number): number => bodyRadiusAt(parent, x - pStart) ?? pRadius;
    for (const child of (parent.children ?? []).flatMap(lineInstances)) {
      const t = child.type;
      // -off.y: the section frame's +y is up and SVG y grows down.
      if (isAssembly(t)) {
        const podChain = child.children ?? [];
        const podLen = assemblyChainLength(child);
        const podRadius = resolveAssemblyRadius(child, assemblyParentRadius(parent));
        const podStart = axialStart(child, podLen, pStart, pLen);
        const count = countOf(child, 'instanceCount', 2);
        for (const off of ringInstanceOffsets(count, podRadius, num(child, 'angleOffset', 0) + turn)) {
          renderChain(podChain, podStart, baseY - off.y * ctx.scale, off.angle);
        }
        continue;
      }
      const grab = {
        ...clickable(child),
      };
      const renderTab = (pose: FinPose, tab: [number, number][] | null) => {
        if (!tab) return;
        const [front, bottomFront, , trail] = tab as [
          [number, number],
          [number, number],
          [number, number],
          [number, number],
        ];
        const at = (x: number, y: number): [number, number] => {
          const [bx, by] = finBodyPoint(x, y, 0, pose);
          return [ctx.x0 + bx * ctx.scale, baseY - by * ctx.scale];
        };
        const px = (x: number) => at(x, 0)[0];
        const py = (y: number) => at(0, y)[1];
        const ink = {
          fill: wire ? 'none' : fillOf(child, token(figureToken(child.type))),
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
              key={key++}
              x={px(front[0])}
              y={Math.min(yInner, ySurface)}
              width={Math.max(2, (trail[0] - front[0]) * ctx.scale)}
              height={wire ? hPx : Math.max(1.5, hPx)}
              {...ink}
            />,
          );
          return;
        }
        (wire ? wires : shapes).push(
          <polygon key={key++} points={tab.map(([x, y]) => at(x, y).join(',')).join(' ')} {...ink} />,
        );
      };
      if (t === 'freeformfinset' || t === 'trapezoidfinset' || t === 'ellipticalfinset') {
        // Body radius under the fin front (`FinSet.getFinFront`), not the widest.
        const fp: FinParent = finMount(child, parent, pStart) ?? pRadius;
        const R = mountRadius(fp) ?? pRadius;
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
        noteHoverFins(
          child,
          ctx.x0 + start * ctx.scale,
          ctx.x0 + (start + aftX) * ctx.scale,
          baseY,
          reach,
          R,
          projections,
        );
        const clip = wallClip(parent, pStart, pLen, pRadius, baseY);
        for (const { angle, p, near } of projections) {
          const pose: FinPose = { front: start, radius: R, chord, cant, angle };
          const ptsStr = outline
            .map(([px, py]) => {
              const [bx, by] = finBodyPoint(px, py, 0, pose);
              return `${ctx.x0 + bx * ctx.scale},${baseY - by * ctx.scale}`;
            })
            .join(' ');
          if (wire) {
            pushWire(child, grab, clip, (extra) => <polygon key={key++} points={ptsStr} {...extra} />);
            renderTab(pose, tab);
            continue;
          }
          const body = (
            <polygon
              key={key++}
              points={ptsStr}
              clipPath={near ? undefined : `url(#${clip})`}
              {...partLine(child, fillOf(child, token(figureToken(child.type))))}
              {...grab}
            />
          );
          if (reach * Math.abs(p) > R) {
            (near ? overlay : shapes).push(body);
            renderTab(pose, tab);
          }
        }
      } else if (t === 'tubefinset') {
        const len = num(child, 'length', KERNEL_DEFAULTS.tubefinset.length);
        const start = axialStart(child, len, pStart, pLen);
        const R = surfaceAt(start);
        const rt = tubeFinRadius(child, R);
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
              key={key++}
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
              <rect key={key++} x={X} y={yc - half} width={w2} height={2 * half} rx="2" {...extra} />
            ));
            wires.push(centerline());
            continue;
          }
          const cut = near ? undefined : `url(#${tubeClip})`;
          if ((R + rt) * Math.abs(p) + rt > R) {
            const into = near ? overlay : shapes;
            into.push(
              <rect
                key={key++}
                x={X}
                y={yc - half}
                clipPath={cut}
                width={w2}
                height={2 * half}
                rx="2"
                fill={fillOf(child, token(figureToken(child.type)))}
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
      } else if (t === 'fairing') {
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
              key={key++}
              points={`${X},${y0} ${X + 0.3 * len * ctx.scale},${yh} ${X + 0.7 * len * ctx.scale},${yh} ${Xe},${y0}`}
              {...partLine(child, fillOf(child, token(figureToken(child.type))))}
              {...grab}
            />
          ) : fshape === 'halfround' ? (
            <path
              key={key++}
              d={`M ${X} ${y0} L ${X} ${yh + 0.35 * (y0 - yh)} Q ${X} ${yh} ${X + Math.min(8, len * ctx.scale * 0.25)} ${yh} L ${Xe - Math.min(8, len * ctx.scale * 0.25)} ${yh} Q ${Xe} ${yh} ${Xe} ${yh + 0.35 * (y0 - yh)} L ${Xe} ${y0} Z`}
              {...partLine(child, fillOf(child, token(figureToken(child.type))))}
              {...grab}
            />
          ) : (
            <rect
              key={key++}
              x={X}
              y={yh}
              width={Math.max(2, len * ctx.scale)}
              height={Math.max(2, hgt * ctx.scale)}
              {...partLine(child, fillOf(child, token(figureToken(child.type))))}
              {...grab}
            />
          ),
        );
      } else if (t === 'launchlug' || t === 'railbutton') {
        // A rail button is 0-long in the kernel (RailButton.getInstanceBoundingBox), so it is centered.
        const btn = t === 'railbutton' ? railButtonSize(child) : null;
        const len = btn ? btn.diameter : num(child, 'length', KERNEL_DEFAULTS.launchlug.length);
        const reach = btn ? btn.reach : 2 * num(child, 'outerRadius', KERNEL_DEFAULTS.launchlug.outerRadius);
        const station = axialStart(child, btn ? 0 : len, pStart, pLen);
        const start = btn ? station - len / 2 : station;
        const c = Math.cos(num(child, 'angleOffset', Math.PI) + turn);
        const R = surfaceAt(station);
        const yInner = baseY - R * c * ctx.scale;
        const yOuter = baseY - (R + reach) * c * ctx.scale;
        const yTop = Math.min(yInner, yOuter);
        const h = Math.max(1, Math.abs(yOuter - yInner));
        noteHover(child, ctx.x0 + start * ctx.scale, yTop, ctx.x0 + (start + len) * ctx.scale, yTop + h);
        shapes.push(
          <rect
            key={key++}
            x={ctx.x0 + start * ctx.scale}
            y={yTop}
            width={Math.max(2, len * ctx.scale)}
            height={h}
            {...partLine(child, fillOf(child, token(figureToken(child.type))))}
            {...grab}
          />,
        );
      } else {
        const TYPE_STYLE: Partial<Record<string, { tag: string }>> = {
          parachute: { tag: 'chute' },
          streamer: { tag: 'strmr' },
          shockcord: { tag: 'cord' },
          masscomponent: { tag: 'mass' },
          centeringring: { tag: 'CR' },
          bulkhead: { tag: 'BH' },
          engineblock: { tag: 'EB' },
          tubecoupler: { tag: 'TC' },
          innertube: { tag: 'IT' },
        };
        const style = TYPE_STYLE[child.type];
        // Not `internalExtent` for discs: its 85% cap would draw a coupler too small.
        const disc = DISC_TYPES.has(child.type) ? discDims(child, tubeRadii(parent), parent.children ?? []) : null;
        const { length: len, radius: r } = disc
          ? { length: disc.length, radius: disc.outerR }
          : child.type === 'innertube'
            ? innerTubeExtent(child)
            : internalExtent(child, pRadius);
        const start = axialStart(child, len, pStart, pLen);
        const offsets = placementOffsets(child, r).map((off) => turnedOffset(off, turn));
        const motor = child.type === 'innertube' && child.id ? motors?.[child.id] : undefined;
        for (const off of offsets) {
          const inkColor = isSel(child) ? 'var(--accent)' : fillOf(child, token(figureToken(child.type)));
          noteHover(
            child,
            ctx.x0 + start * ctx.scale,
            baseY - (off.y + r) * ctx.scale,
            ctx.x0 + (start + len) * ctx.scale,
            baseY - (off.y - r) * ctx.scale,
          );
          overlay.push(
            <rect
              key={key++}
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
          if (gs >= 8) {
            const g = gs / 2;
            const glyphProps = {
              stroke: fillOf(child, token(figureToken(child.type))),
              fill: 'none',
              strokeWidth: 1.2,
              style: { pointerEvents: 'none' as const },
            };
            if (child.type === 'parachute') {
              overlay.push(
                <g key={key++} {...glyphProps}>
                  <path d={`M ${gcx - g} ${gcy} A ${g} ${g} 0 0 1 ${gcx + g} ${gcy}`} />
                  <path
                    d={`M ${gcx - g} ${gcy} L ${gcx} ${gcy + g} L ${gcx + g} ${gcy} M ${gcx - g * 0.45} ${gcy - g * 0.65} L ${gcx} ${gcy + g} M ${gcx + g * 0.45} ${gcy - g * 0.65} L ${gcx} ${gcy + g}`}
                  />
                </g>,
              );
            } else if (child.type === 'masscomponent') {
              overlay.push(
                <g key={key++} {...glyphProps}>
                  <rect
                    x={gcx - g * 0.7}
                    y={gcy - g * 0.35}
                    width={g * 1.4}
                    height={g * 1.05}
                    fill={fillOf(child, token(figureToken(child.type)))}
                    fillOpacity="0.35"
                  />
                  <path
                    d={`M ${gcx - g * 0.35} ${gcy - g * 0.35} A ${g * 0.4} ${g * 0.5} 0 0 1 ${gcx + g * 0.35} ${gcy - g * 0.35}`}
                  />
                </g>,
              );
            } else if (child.type === 'centeringring') {
              overlay.push(
                <g key={key++} {...glyphProps}>
                  <line
                    x1={gcx}
                    y1={gcy - bh / 2 + 1.5}
                    x2={gcx}
                    y2={gcy - bh * 0.16}
                    strokeWidth={Math.max(2, bw * 0.5)}
                  />
                  <line
                    x1={gcx}
                    y1={gcy + bh * 0.16}
                    x2={gcx}
                    y2={gcy + bh / 2 - 1.5}
                    strokeWidth={Math.max(2, bw * 0.5)}
                  />
                </g>,
              );
            } else if (child.type === 'shockcord') {
              const seg = gs / 4;
              overlay.push(
                <path
                  key={key++}
                  {...glyphProps}
                  d={`M ${gcx - g} ${gcy} ${[1, 2, 3, 4].map((i) => `L ${gcx - g + i * seg * 2 - seg} ${gcy + (i % 2 ? -1 : 1) * g * 0.45} L ${gcx - g + i * seg * 2} ${gcy}`).join(' ')}`}
                />,
              );
            }
          }
          const hasGlyph = gs >= 8 && ['parachute', 'masscomponent', 'centeringring', 'shockcord'].includes(child.type);
          const tagRoom = len * ctx.scale > 26 && 2 * r * ctx.scale > 11;
          if (style && !hasGlyph && tagRoom) {
            const tx = ctx.x0 + (start + len / 2) * ctx.scale;
            const ty = baseY - off.y * ctx.scale;
            overlay.push(
              <text
                key={key++}
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="8.5"
                fill={fillOf(child, token(figureToken(child.type)))}
                style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.04em' }}
              >
                {cfg.typeTag?.(child.type) ?? style.tag}
              </text>,
            );
          }
          if (motor) {
            overlay.push(
              ...motorShapes(motor, motorSeatStart(child, start, len, motor.length), baseY - off.y * ctx.scale),
            );
          }
          renderChildren(child, start, len, r, baseY - off.y * ctx.scale, turn);
        }
      }
    }
  };

  // Not the shared gray: a snug shoulder sits within a pixel of the tube's outline.
  const SHOULDER_INK = token('sch-shoulder');

  // In the overlay: an aft shoulder sits inside the next tube, drawn later.
  const shoulderRect = (
    owner: ComponentNode,
    startX: number,
    shoulder: Shoulder,
    endRadiusSi: number,
    baseY: number,
  ) => {
    if (!hasShoulder(shoulder)) return;
    const lenSi = shoulder.length;
    const rSi = Math.min(shoulder.radius, endRadiusSi);
    if (rSi <= 0) return;
    overlay.push(
      <rect
        key={key++}
        x={ctx.x0 + startX * scale}
        y={baseY - rSi * scale}
        width={Math.max(1.5, lenSi * scale)}
        height={2 * rSi * scale}
        fill="rgba(127,127,127,0.001)"
        stroke={isSel(owner) ? 'var(--accent)' : fillOf(owner, SHOULDER_INK)}
        strokeWidth={selWidth(owner)}
        strokeDasharray={dashOf(owner, '3 2')}
        style={{ pointerEvents: 'none' }}
      >
        <title>{nameOf(owner)}</title>
      </rect>,
    );
  };

  const profileShape = (
    n: ComponentNode,
    cx: number,
    len: number,
    fore: number,
    aft: number,
    r: number,
    baseY: number,
  ) => {
    noteHover(n, ctx.x0 + cx * scale, baseY - r * scale, ctx.x0 + (cx + len) * scale, baseY + r * scale);
    shapes.push(
      <path
        key={key++}
        d={profilePath(ctx, n, cx, len, fore, aft, baseY)}
        {...partLine(n, fillOf(n, token(figureToken(n.type))))}
        {...clickable(n)}
      />,
    );
  };

  const renderChain = (nodes: ComponentNode[], xStart: number, baseY: number, turn: number) => {
    let cx = xStart;
    for (const n of nodes) {
      const len = partLength(n);
      if (n.type === 'nosecone') {
        const r = noseConeAftRadius(n);
        const flipped = n['flipped'] === true;
        const ends = profileEnds(n);
        profileShape(n, cx, len, ends.fore, ends.aft, r, baseY);
        const sh = shouldersOf(n);
        if (flipped) shoulderRect(n, cx - sh.fore.length, sh.fore, ends.fore, baseY);
        else shoulderRect(n, cx + len, sh.aft, ends.aft, baseY);
        renderChildren(n, cx, len, r, baseY, turn);
        cx += len;
      } else if (n.type === 'bodytube') {
        const r = bodyTubeRadius(n);
        // A zero-size phantom tube (a T-tail) draws no rect, but its children still draw.
        const degenerate = r < 1e-6 || len < 1e-6;
        if (!degenerate) {
          noteHover(n, ctx.x0 + cx * scale, baseY - r * scale, ctx.x0 + (cx + len) * scale, baseY + r * scale);
          shapes.push(
            <rect
              key={key++}
              x={ctx.x0 + cx * scale}
              y={baseY - r * scale}
              width={len * scale}
              height={2 * r * scale}
              {...partLine(n, fillOf(n, token(figureToken(n.type))))}
              {...clickable(n)}
            />,
          );
        }
        const tubeMotor = n.id ? motors?.[n.id] : undefined;
        if (tubeMotor) {
          shapes.push(...motorShapes(tubeMotor, motorSeatStart(n, cx, len, tubeMotor.length), baseY));
        }
        renderChildren(n, cx, len, r, baseY, turn);
        cx += len;
      } else if (n.type === 'transition') {
        const { fore: rf, aft: ra } = profileEnds(n);
        profileShape(n, cx, len, rf, ra, Math.max(rf, ra), baseY);
        const sh = shouldersOf(n);
        shoulderRect(n, cx - sh.fore.length, sh.fore, rf, baseY);
        shoulderRect(n, cx + len, sh.aft, ra, baseY);
        renderChildren(n, cx, len, Math.max(rf, ra), baseY, turn);
        cx += len;
      }
    }
  };

  renderChain(chain, 0, ctx.cy, roll);

  return { shapes, overlay, wires, clipDefs, extents };
}
