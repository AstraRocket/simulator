import type { ComponentNode } from '../../engine/openRocketEngine';
import { bodyRadiusAt } from '../../tree/finPlanform';
import { hasShoulder, profileEnds, shouldersOf, type Shoulder } from '../../tree/shapeProfile';
import { bodyTubeRadius, countOf, noseConeAftRadius, num } from '../../tree/nodeProps';
import { lineInstances } from '../../tree/placement';
import { motorSeatStart, partLength } from '../../tree/position.js';
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
import { axialStart, figureToken, profilePath } from '../../tree/schematicGeometry';
import { createPainter, fillOf, type HoverExtents, type SchematicShapesCfg } from './schematicPainter';
import { fairingShape, finSetShapes, internalShapes, lugShape, tubeFinShapes } from './schematicParts';

export function SchematicDefs({ clipDefs }: { clipDefs: React.ReactNode }) {
  return (
    <defs>
      <pattern id="bulkhead-hatch" patternUnits="userSpaceOnUse" width="5" height="5">
        <path d="M0 5 L5 0" stroke={token('sch-hatch')} strokeWidth="0.9" />
      </pattern>
      {clipDefs}
    </defs>
  );
}

export function buildSchematicShapes(cfg: SchematicShapesCfg): {
  shapes: React.ReactNode[];
  overlay: React.ReactNode[];
  wires: React.ReactNode[];
  clipDefs: React.ReactNode[];
  extents: HoverExtents;
} {
  const { scale, roll, motors } = cfg;
  const chain = chainWithKernelEnds(cfg.chain);
  const p = createPainter(cfg);
  const { ctx, shapes, overlay, wires, clipDefs, extents, nextKey, nameOf, isSel, clickable, selWidth, partLine } = p;
  const { noteHover, motorShapes } = p;

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
    const at = { parent, pStart, pLen, pRadius, baseY, turn, surfaceAt };
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
      if (t === 'freeformfinset' || t === 'trapezoidfinset' || t === 'ellipticalfinset') finSetShapes(p, at, child);
      else if (t === 'tubefinset') tubeFinShapes(p, at, child);
      else if (t === 'fairing') fairingShape(p, at, child);
      else if (t === 'launchlug' || t === 'railbutton') lugShape(p, at, child);
      else internalShapes(p, at, child, renderChildren);
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
        key={nextKey()}
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
        key={nextKey()}
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
              key={nextKey()}
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
