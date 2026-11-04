import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { anyOuterRadius, bodyTubeRadius, countOf, finCant, num } from '../../tree/nodeProps';
import { FIN_DEFAULTS, KERNEL_DEFAULTS } from '../../tree/kernelDefaults.js';
import { railButtonSize } from './railButton';
import {
  bodyRadiusAt,
  finBodyPoint,
  finMount,
  finOutlinePoints,
  finPointsWithRoot,
  finRootChord,
  finSpan,
  mountRadius,
  type FinPose,
} from '../../tree/finPlanform.js';
import { placementOffsets, turnedOffset } from '../../tree/placement';
import { isPlanarFinSet, tubeFinRadius } from '../../tree/tubefins.js';
import {
  assemblyChainLength,
  assemblyParentRadius,
  isAssembly,
  resolveAssemblyRadius,
  ringInstanceOffsets,
} from '../../tree/assembly.js';
import { isChainType } from '../../tree/componentKinds.js';
import { axialStart, partLength } from '../../tree/position.js';
import {
  colorOf,
  figureToken,
  innerTubeExtent,
  internalExtent,
  MAX_ZOOM,
  WHEEL_ZOOM_FACTOR,
  ZOOM_IDENTITY,
  zoomStep,
  type MotorDims,
} from '../../tree/schematicGeometry';
import { ZoomButtons } from './ZoomButtons';
import { useWheelZoom } from './useWheelZoom';
import { zoomSurfaceProps } from './keyPan';
import { discDims, tubeRadii } from '../../services/design/discGeometry';
import { DISC_TYPES } from '../../services/files/componentFormats';
import { withKernelEnds } from '../../services/design/autoRadius';
import { partLabel } from '../../i18n/format';
import { radToDeg } from '../../prefs/units';
import { token } from '../common/colorTokens';
import { dashOf } from '../../services/design/figureStyle';

// Looking down +X; +y right, +z up, the kernel's cross-section frame.

// Hoisted so the hook's options keep one identity.
const WHEEL_ZOOM = { factor: WHEEL_ZOOM_FACTOR, max: MAX_ZOOM };

type Shape =
  | {
      kind: 'circle';
      key: string;
      y: number;
      z: number;
      r: number;
      fill: string;
      stroke: string;
      dash?: string;
      width?: number;
      title?: string;
    }
  | {
      kind: 'fin';
      key: string;
      y: number;
      z: number;
      angle: number;
      from: number;
      to: number;
      thick: number;
      fill: string;
      stroke: string;
      dash?: string;
      title?: string;
    }
  | {
      /** Already in this view's frame, `[y, z]` per point. */
      kind: 'poly';
      key: string;
      y: number;
      z: number;
      points: [number, number][];
      fill: string;
      stroke: string;
      dash?: string;
      title?: string;
    };

const keyOnly = ((key: string) => key) as unknown as TFunction;

export function rocketSpanM(components: ComponentNode[]): number {
  return 2 * buildAftScene(components, undefined, keyOnly).reach;
}

/** Module scope, not a closure inside the memo: the compiler lint reads a self-calling closure as a missing dependency. */
export function buildAftScene(
  components: ComponentNode[],
  motors: MotorDims | undefined,
  t: TFunction,
): { hulls: Shape[]; inner: Shape[]; outer: Shape[]; extent: number; reach: number } {
  const hulls: Shape[] = [];
  const inner: Shape[] = [];
  const outer: Shape[] = [];
  // The frame floors at 2 cm; the measure itself does not.
  let farthest = 0;

  const reach = (y: number, z: number, r: number) => {
    farthest = Math.max(farthest, Math.hypot(y, z) + r);
  };
  const nameOf = (n: ComponentNode) => partLabel(t, n);
  let copy = '';
  const keyOf = (n: ComponentNode, i: number) => `${n.id ?? n.type}:${i}${copy}`;
  const motorShape = (n: ComponentNode, i: number, y: number, z: number, diameter: number): Shape => ({
    kind: 'circle',
    key: `${n.id ?? n.type}:motor:${i}${copy}`,
    y,
    z,
    r: diameter / 2,
    fill: token('sch-motor'),
    stroke: token('sch-motor-edge'),
    title: t('part.motor'),
  });

  // `turn` is the summed angle of the enclosing pod/booster instances (FlightConfiguration.java:470-485).
  function walkChain(nodes: ComponentNode[], cy: number, cz: number, x0: number, turn: number): number {
    let x = x0;
    for (const n of nodes) {
      if (n.type === 'stage') {
        x = walkChain(n.children ?? [], cy, cz, x, turn);
        continue;
      }
      const len = isChainType(n.type) ? partLength(n) : 0;
      const start = x;
      x += len;
      const r = n.type === 'bodytube' ? bodyTubeRadius(n) : anyOuterRadius(n);
      if (r <= 0) continue;
      hulls.push({
        kind: 'circle',
        key: keyOf(n, 0),
        y: cy,
        z: cz,
        r,
        fill: colorOf(n, token(figureToken(n.type))),
        stroke: token('sch-line'),
        dash: dashOf(n),
        title: nameOf(n),
      });
      reach(cy, cz, r);
      if (n.type === 'bodytube' && n['motorMount'] === true) {
        const motor = n.id ? motors?.[n.id] : undefined;
        if (motor) inner.push(motorShape(n, 0, cy, cz, motor.diameter));
      }
      walkChildren(n, r, cy, cz, start, len, turn);
    }
    return x;
  }

  // Kernel frame, turned by `turn`, then +π/2 into this view's "up = 0°" frame.
  const toAftFrame = (raw: { y: number; z: number }, turn: number) => {
    const off = turnedOffset(raw, turn);
    return { y: -off.z, z: off.y };
  };

  const partInk = (child: ComponentNode) => ({
    fill: colorOf(child, token(figureToken(child.type))),
    stroke: token('sch-line'),
    dash: dashOf(child),
    title: nameOf(child),
  });

  const dashedCircle = (child: ComponentNode, i: number, y: number, z: number, r: number, dash: string) =>
    inner.push({
      kind: 'circle',
      key: keyOf(child, i),
      y,
      z,
      r,
      fill: 'none',
      stroke: colorOf(child, token(figureToken(child.type))),
      dash: dashOf(child, dash),
      title: nameOf(child),
    });

  /** `pRadius` (the parent's largest radius) sizes internal parts; outside parts stand on `surfaceUnder`. */
  function walkChildren(
    parent: ComponentNode,
    pRadius: number,
    cy: number,
    cz: number,
    pStart: number,
    pLen: number,
    turn: number,
  ) {
    const surfaceUnder = (child: ComponentNode, len: number): number =>
      bodyRadiusAt(parent, axialStart(child, len, pStart, pLen) - pStart) ?? pRadius;
    for (const child of parent.children ?? []) {
      const type = child.type;
      if (isAssembly(type)) {
        const podRadius = resolveAssemblyRadius(child, assemblyParentRadius(parent));
        const podStart = axialStart(child, assemblyChainLength(child), pStart, pLen);
        const count = countOf(child, 'instanceCount', 2);
        // +π/2 so 0° is straight up, as for the fins and the 3D view.
        ringInstanceOffsets(count, podRadius, Math.PI / 2 + num(child, 'angleOffset', 0) + turn).forEach((off, i) => {
          const outerCopy = copy;
          copy = `${outerCopy}/${child.id ?? child.type}#${i}`;
          walkChain(child.children ?? [], cy + off.y, cz + off.z, podStart, off.angle - Math.PI / 2);
          copy = outerCopy;
        });
      } else if (isPlanarFinSet(type)) {
        const count = countOf(child, 'finCount', 3);
        // On the body radius under its own front (`FinSet.getBodyRadius`), not the parent's widest.
        const mount = finMount(child, parent, pStart);
        const fp = mount ?? pRadius;
        const R = mountRadius(fp) ?? pRadius;
        const span = finSpan(child, fp);
        const thick = num(child, 'thickness', FIN_DEFAULTS.thickness);
        const cant = finCant(child);
        // First fin straight up (desktop rear-view convention).
        const ring = ringInstanceOffsets(count, 0, Math.PI / 2 + num(child, 'rotation', 0) + turn);
        const fill = colorOf(child, token(figureToken(child.type)));
        const title = `${nameOf(child)} ×${count}`;
        const outline = cant === 0 ? null : finOutlinePoints(child, fp);
        const closed = cant === 0 ? null : finPointsWithRoot(child, fp);
        for (const [i, { angle }] of ring.entries()) {
          if (!outline || !closed) {
            outer.push({
              kind: 'fin',
              key: keyOf(child, i),
              y: cy,
              z: cz,
              angle,
              from: R,
              to: R + span,
              thick,
              fill,
              stroke: token('sch-line'),
              dash: dashOf(child),
              title,
            });
            continue;
          }
          // A canted fin is not edge on from behind: draw its face and trailing-edge strip (desktop's back view).
          const pose: FinPose = {
            front: 0,
            radius: R,
            chord: finRootChord(child),
            cant,
            angle: angle - Math.PI / 2,
          };
          const side = Math.sign(cant) * (thick / 2);
          const at = (x: number, y: number, z: number): [number, number] => {
            const [, by, bz] = finBodyPoint(x, y, z, pose);
            const off = toAftFrame({ y: by, z: bz }, 0);
            return [cy + off.y, cz + off.z];
          };
          let top = outline.length - 1;
          while (top > 0 && !(outline[top - 1]![1] < outline[top]![1])) top--;
          const tail = outline.slice(top);
          const polys: [number, number][][] = [
            closed.map(([x, y]) => at(x, y, side)),
            [...[...tail].reverse().map(([x, y]) => at(x, y, -side)), ...tail.map(([x, y]) => at(x, y, side))],
          ];
          polys.forEach((points, j) => {
            outer.push({
              kind: 'poly',
              key: `${keyOf(child, i)}:${j}`,
              y: cy,
              z: cz,
              points,
              fill,
              stroke: token('sch-line'),
              dash: dashOf(child),
              title,
            });
            for (const [y, z] of points) reach(y, z, 0);
          });
        }
        reach(cy, cz, R + span);
      } else if (type === 'tubefinset') {
        const count = countOf(child, 'finCount', 6);
        const R = surfaceUnder(child, num(child, 'length', KERNEL_DEFAULTS.tubefinset.length));
        const rt = tubeFinRadius(child, R);
        const ring = ringInstanceOffsets(count, R + rt, Math.PI / 2 + num(child, 'rotation', 0) + turn);
        for (const [i, off] of ring.entries()) {
          outer.push({
            kind: 'circle',
            key: keyOf(child, i),
            y: cy + off.y,
            z: cz + off.z,
            r: rt,
            fill: 'none',
            stroke: token('sch-line'),
            dash: dashOf(child),
            title: `${nameOf(child)} ×${count}`,
          });
        }
        reach(cy, cz, R + 2 * rt);
      } else if (type === 'fairing') {
        const wid = num(child, 'width', KERNEL_DEFAULTS.fairing.width);
        const hgt = num(child, 'height', KERNEL_DEFAULTS.fairing.height);
        const R = surfaceUnder(child, num(child, 'length', KERNEL_DEFAULTS.fairing.length));
        outer.push({
          kind: 'fin',
          key: keyOf(child, 0),
          y: cy,
          z: cz,
          angle: Math.PI / 2,
          from: R,
          to: R + hgt,
          thick: wid,
          ...partInk(child),
        });
        reach(cy, cz, R + hgt);
      } else if (type === 'railbutton') {
        // Length 0: RailButton never sets RocketComponent.length. Kernel default angle is 180°.
        const { diameter, reach: out } = railButtonSize(child);
        const R = surfaceUnder(child, 0);
        outer.push({
          kind: 'fin',
          key: keyOf(child, 0),
          y: cy,
          z: cz,
          angle: Math.PI / 2 + num(child, 'angleOffset', Math.PI) + turn,
          from: R,
          to: R + out,
          thick: diameter,
          ...partInk(child),
        });
        reach(cy, cz, R + out);
      } else if (type === 'launchlug') {
        const r = num(child, 'outerRadius', KERNEL_DEFAULTS.launchlug.outerRadius);
        // Kernel default angle is 180°.
        const ang = Math.PI / 2 + num(child, 'angleOffset', Math.PI) + turn;
        const R = surfaceUnder(child, num(child, 'length', KERNEL_DEFAULTS.launchlug.length));
        const rad = R + r;
        outer.push({
          kind: 'circle',
          key: keyOf(child, 0),
          y: cy + rad * Math.cos(ang),
          z: cz + rad * Math.sin(ang),
          r,
          ...partInk(child),
        });
        reach(cy, cz, R + 2 * r);
      } else if (type === 'innertube') {
        const { length: tubeLen, radius: r } = innerTubeExtent(child);
        const offs = placementOffsets(child, r);
        const motor = child.id ? motors?.[child.id] : undefined;
        offs.forEach((raw, i) => {
          const off = toAftFrame(raw, turn);
          dashedCircle(child, i, cy + off.y, cz + off.z, r, '3 2');
          if (motor) inner.push(motorShape(child, i, cy + off.y, cz + off.z, motor.diameter));
          reach(cy + off.y, cz + off.z, r);
        });
        const tubeStart = axialStart(child, tubeLen, pStart, pLen);
        offs.forEach((raw, i) => {
          const off = toAftFrame(raw, turn);
          walkCopy(child, r, cy + off.y, cz + off.z, tubeStart, tubeLen, i, turn);
        });
      } else if (DISC_TYPES.has(type)) {
        const disc = discDims(child, tubeRadii(parent), parent.children ?? []);
        const len = disc?.length ?? partLength(child);
        const outerR = disc?.outerR ?? 0;
        const off = toAftFrame(placementOffsets(child, outerR)[0]!, turn);
        if (disc) {
          const rings = disc.innerR > 0 ? [disc.outerR, disc.innerR] : [disc.outerR];
          rings.forEach((r, i) => dashedCircle(child, i, cy + off.y, cz + off.z, r, '2 3'));
        }
        walkCopy(child, outerR, cy + off.y, cz + off.z, axialStart(child, len, pStart, pLen), len, 0, turn);
      } else if (child.children?.length) {
        const { length: len, radius } = internalExtent(child, pRadius);
        const off = toAftFrame(placementOffsets(child, radius)[0]!, turn);
        walkCopy(child, radius, cy + off.y, cz + off.z, axialStart(child, len, pStart, pLen), len, 0, turn);
      }
    }
  }

  function walkCopy(
    parent: ComponentNode,
    pRadius: number,
    cy: number,
    cz: number,
    pStart: number,
    pLen: number,
    i: number,
    turn: number,
  ) {
    const outerCopy = copy;
    copy = `${outerCopy}/${parent.id ?? parent.type}#${i}`;
    walkChildren(parent, pRadius, cy, cz, pStart, pLen, turn);
    copy = outerCopy;
  }

  walkChain(withKernelEnds({ name: '', components }).components, 0, 0, 0, 0);

  // Big circles first so nested ones stay visible.
  hulls.sort((a, b) => (b.kind === 'circle' ? b.r : 0) - (a.kind === 'circle' ? a.r : 0));
  return { hulls, inner, outer, extent: Math.max(0.02, farthest), reach: farthest };
}

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
  roll = 0,
  onRoll,
}: {
  tree: RocketTree;
  motors?: MotorDims;
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
    () => buildAftScene(tree.components, motors, t),
    [tree.components, motors, t],
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
    const pts = [
      [s.y + s.from * cos + ny * h, s.z + s.from * sin + nz * h],
      [s.y + s.to * cos + ny * h, s.z + s.to * sin + nz * h],
      [s.y + s.to * cos - ny * h, s.z + s.to * sin - nz * h],
      [s.y + s.from * cos - ny * h, s.z + s.from * sin - nz * h],
    ];
    return (
      <polygon key={s.key} points={pts.map(([y, z]) => `${toSvg(y!)},${-toSvg(z!)}`).join(' ')} {...ink(s)}>
        {s.title ? <title>{s.title}</title> : null}
      </polygon>
    );
  };

  const toView = (clientX: number, clientY: number) =>
    clientToViewBox(svgRef.current, svgRef.current!.getBoundingClientRect(), E, clientX, clientY);
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
