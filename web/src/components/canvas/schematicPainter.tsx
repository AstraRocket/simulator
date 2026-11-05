import type { ComponentNode } from '../../engine/openRocketEngine';
import { profileEnds } from '../../tree/shapeProfile';
import { countOf, num } from '../../tree/nodeProps';
import { DISPLAY_NAME } from '../../tree/schema.js';
import { ringInstanceOffsets } from '../../tree/assembly.js';
import { token } from '../common/colorTokens';
import { dashOf } from '../../services/design/figureStyle';
import { colorOf, profilePath, unionBox, type Ctx, type HoverBox } from '../../tree/schematicGeometry';

export const fillOf = colorOf;

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

/**
 * What every part drawer shares: the output lists, keys, clip paths and the selection and hover wiring.
 *
 * Long only because it holds many small helpers over one config. It has no branching to separate,
 * and splitting it would only pass that config around.
 */
// eslint-disable-next-line max-lines-per-function -- small helpers over one config; see the comment above
export function createPainter(cfg: SchematicShapesCfg) {
  const { ctx, roll, uid, motors, selectedId, onSelect, setHoverId } = cfg;
  const nameOf = (n: ComponentNode): string =>
    cfg.partName?.(n) ?? ((typeof n.name === 'string' && n.name.trim()) || DISPLAY_NAME[n.type]);

  const isSel = (n: ComponentNode) => !!selectedId && n.id === selectedId;
  const clickable = (n: ComponentNode) => ({
    ...(n.id
      ? {
          onPointerEnter: () => setHoverId(n.id ?? null),
          onPointerLeave: () => setHoverId((cur) => (cur === n.id ? null : cur)),
        }
      : {}),
    ...(onSelect && n.id
      ? {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            if (n.id) onSelect(n.id);
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
  const nextKey = () => key++;

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
        key={nextKey()}
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
          key={nextKey()}
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

  return {
    ctx,
    motors,
    typeTag: cfg.typeTag,
    wire,
    shapes,
    overlay,
    wires,
    clipDefs,
    extents,
    nextKey,
    nameOf,
    isSel,
    clickable,
    selStroke,
    selWidth,
    partLine,
    wallClip,
    finFactors,
    pushWire,
    noteHover,
    noteHoverFins,
    motorShapes,
  };
}

export type Painter = ReturnType<typeof createPainter>;
