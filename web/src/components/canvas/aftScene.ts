import type { TFunction } from 'i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
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
import { colorOf, figureToken, innerTubeExtent, internalExtent, type MotorDims } from '../../tree/schematicGeometry';
import { discDims, tubeRadii } from '../../services/design/discGeometry';
import { DISC_TYPES } from '../../services/files/componentFormats';
import { withKernelEnds } from '../../services/design/autoRadius';
import { partLabel } from '../../i18n/format';
import { token } from '../common/colorTokens';
import { dashOf } from '../../services/design/figureStyle';

// Looking down +X; +y right, +z up, the kernel's cross-section frame.

export type Shape =
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

/** What every part's drawer shares during one `buildAftScene`. */
interface AftBuild {
  hulls: Shape[];
  inner: Shape[];
  outer: Shape[];
  motors: MotorDims | undefined;
  t: TFunction;
  /** The frame floors at 2 cm; the measure itself does not. */
  farthest: number;
  /** Key suffix naming the enclosing instances, so each copy's shapes stay unique. */
  copy: string;
  hiddenIds: ReadonlySet<string> | undefined;
}

const isHidden = (b: AftBuild, n: ComponentNode): boolean => !!n.id && !!b.hiddenIds?.has(n.id);

/**
 * `pRadius` (the parent's largest radius) sizes internal parts; outside parts stand on `surfaceUnder`.
 * `turn` is the summed angle of the enclosing pod/booster instances (FlightConfiguration.java:470-485).
 */
interface AftParent {
  parent: ComponentNode;
  pRadius: number;
  cy: number;
  cz: number;
  pStart: number;
  pLen: number;
  turn: number;
}

const reach = (b: AftBuild, y: number, z: number, r: number) => {
  b.farthest = Math.max(b.farthest, Math.hypot(y, z) + r);
};
const nameOf = (b: AftBuild, n: ComponentNode) => partLabel(b.t, n);
const keyOf = (b: AftBuild, n: ComponentNode, i: number) => `${n.id ?? n.type}:${i}${b.copy}`;
const motorShape = (b: AftBuild, n: ComponentNode, i: number, y: number, z: number, diameter: number): Shape => ({
  kind: 'circle',
  key: `${n.id ?? n.type}:motor:${i}${b.copy}`,
  y,
  z,
  r: diameter / 2,
  fill: token('sch-motor'),
  stroke: token('sch-motor-edge'),
  title: b.t('part.motor'),
});

// Kernel frame, turned by `turn`, then +π/2 into this view's "up = 0°" frame.
const toAftFrame = (raw: { y: number; z: number }, turn: number) => {
  const off = turnedOffset(raw, turn);
  return { y: -off.z, z: off.y };
};

const partInk = (b: AftBuild, child: ComponentNode) => ({
  fill: colorOf(child, token(figureToken(child.type))),
  stroke: token('sch-line'),
  dash: dashOf(child),
  title: nameOf(b, child),
});

const dashedCircle = (b: AftBuild, child: ComponentNode, i: number, y: number, z: number, r: number, dash: string) =>
  b.inner.push({
    kind: 'circle',
    key: keyOf(b, child, i),
    y,
    z,
    r,
    fill: 'none',
    stroke: colorOf(child, token(figureToken(child.type))),
    dash: dashOf(child, dash),
    title: nameOf(b, child),
  });

const surfaceUnder = ({ parent, pRadius, pStart, pLen }: AftParent, child: ComponentNode, len: number): number =>
  bodyRadiusAt(parent, axialStart(child, len, pStart, pLen) - pStart) ?? pRadius;

function drawAssembly(b: AftBuild, child: ComponentNode, { parent, cy, cz, pStart, pLen, turn }: AftParent) {
  const podRadius = resolveAssemblyRadius(child, assemblyParentRadius(parent));
  const podStart = axialStart(child, assemblyChainLength(child), pStart, pLen);
  const count = countOf(child, 'instanceCount', 2);
  // +π/2 so 0° is straight up, as for the fins and the 3D view.
  ringInstanceOffsets(count, podRadius, Math.PI / 2 + num(child, 'angleOffset', 0) + turn).forEach((off, i) => {
    const outerCopy = b.copy;
    b.copy = `${outerCopy}/${child.id ?? child.type}#${i}`;
    walkChain(b, child.children ?? [], cy + off.y, cz + off.z, podStart, off.angle - Math.PI / 2);
    b.copy = outerCopy;
  });
}

function drawPlanarFins(b: AftBuild, child: ComponentNode, { parent, pRadius, cy, cz, pStart, turn }: AftParent) {
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
  const title = `${nameOf(b, child)} ×${count}`;
  const outline = cant === 0 ? null : finOutlinePoints(child, fp);
  const closed = cant === 0 ? null : finPointsWithRoot(child, fp);
  for (const [i, { angle }] of ring.entries()) {
    if (!outline || !closed) {
      b.outer.push({
        kind: 'fin',
        key: keyOf(b, child, i),
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
      b.outer.push({
        kind: 'poly',
        key: `${keyOf(b, child, i)}:${j}`,
        y: cy,
        z: cz,
        points,
        fill,
        stroke: token('sch-line'),
        dash: dashOf(child),
        title,
      });
      for (const [y, z] of points) reach(b, y, z, 0);
    });
  }
  reach(b, cy, cz, R + span);
}

function drawTubeFins(b: AftBuild, child: ComponentNode, at: AftParent) {
  const { cy, cz, turn } = at;
  const count = countOf(child, 'finCount', 6);
  const R = surfaceUnder(at, child, num(child, 'length', KERNEL_DEFAULTS.tubefinset.length));
  const rt = tubeFinRadius(child, R);
  const ring = ringInstanceOffsets(count, R + rt, Math.PI / 2 + num(child, 'rotation', 0) + turn);
  for (const [i, off] of ring.entries()) {
    b.outer.push({
      kind: 'circle',
      key: keyOf(b, child, i),
      y: cy + off.y,
      z: cz + off.z,
      r: rt,
      fill: 'none',
      stroke: token('sch-line'),
      dash: dashOf(child),
      title: `${nameOf(b, child)} ×${count}`,
    });
  }
  reach(b, cy, cz, R + 2 * rt);
}

function drawFairing(b: AftBuild, child: ComponentNode, at: AftParent) {
  const { cy, cz } = at;
  const wid = num(child, 'width', KERNEL_DEFAULTS.fairing.width);
  const hgt = num(child, 'height', KERNEL_DEFAULTS.fairing.height);
  const R = surfaceUnder(at, child, num(child, 'length', KERNEL_DEFAULTS.fairing.length));
  b.outer.push({
    kind: 'fin',
    key: keyOf(b, child, 0),
    y: cy,
    z: cz,
    angle: Math.PI / 2,
    from: R,
    to: R + hgt,
    thick: wid,
    ...partInk(b, child),
  });
  reach(b, cy, cz, R + hgt);
}

function drawRailButton(b: AftBuild, child: ComponentNode, at: AftParent) {
  const { cy, cz, turn } = at;
  // Length 0: RailButton never sets RocketComponent.length. Kernel default angle is 180°.
  const { diameter, reach: out } = railButtonSize(child);
  const R = surfaceUnder(at, child, 0);
  b.outer.push({
    kind: 'fin',
    key: keyOf(b, child, 0),
    y: cy,
    z: cz,
    angle: Math.PI / 2 + num(child, 'angleOffset', Math.PI) + turn,
    from: R,
    to: R + out,
    thick: diameter,
    ...partInk(b, child),
  });
  reach(b, cy, cz, R + out);
}

function drawLaunchLug(b: AftBuild, child: ComponentNode, at: AftParent) {
  const { cy, cz, turn } = at;
  const r = num(child, 'outerRadius', KERNEL_DEFAULTS.launchlug.outerRadius);
  // Kernel default angle is 180°.
  const ang = Math.PI / 2 + num(child, 'angleOffset', Math.PI) + turn;
  const R = surfaceUnder(at, child, num(child, 'length', KERNEL_DEFAULTS.launchlug.length));
  const rad = R + r;
  b.outer.push({
    kind: 'circle',
    key: keyOf(b, child, 0),
    y: cy + rad * Math.cos(ang),
    z: cz + rad * Math.sin(ang),
    r,
    ...partInk(b, child),
  });
  reach(b, cy, cz, R + 2 * r);
}

function drawInnerTube(b: AftBuild, child: ComponentNode, { cy, cz, pStart, pLen, turn }: AftParent) {
  const { length: tubeLen, radius: r } = innerTubeExtent(child);
  const offs = placementOffsets(child, r);
  const motor = child.id ? b.motors?.[child.id] : undefined;
  offs.forEach((raw, i) => {
    const off = toAftFrame(raw, turn);
    dashedCircle(b, child, i, cy + off.y, cz + off.z, r, '3 2');
    if (motor) b.inner.push(motorShape(b, child, i, cy + off.y, cz + off.z, motor.diameter));
    reach(b, cy + off.y, cz + off.z, r);
  });
  const tubeStart = axialStart(child, tubeLen, pStart, pLen);
  offs.forEach((raw, i) => {
    const off = toAftFrame(raw, turn);
    walkCopy(
      b,
      { parent: child, pRadius: r, cy: cy + off.y, cz: cz + off.z, pStart: tubeStart, pLen: tubeLen, turn },
      i,
    );
  });
}

function drawDisc(b: AftBuild, child: ComponentNode, { parent, cy, cz, pStart, pLen, turn }: AftParent) {
  const disc = discDims(child, tubeRadii(parent), parent.children ?? []);
  const len = disc?.length ?? partLength(child);
  const outerR = disc?.outerR ?? 0;
  const off = toAftFrame(placementOffsets(child, outerR)[0]!, turn);
  if (disc) {
    const rings = disc.innerR > 0 ? [disc.outerR, disc.innerR] : [disc.outerR];
    rings.forEach((r, i) => dashedCircle(b, child, i, cy + off.y, cz + off.z, r, '2 3'));
  }
  const start = axialStart(child, len, pStart, pLen);
  walkCopy(b, { parent: child, pRadius: outerR, cy: cy + off.y, cz: cz + off.z, pStart: start, pLen: len, turn }, 0);
}

/** Draws nothing itself: only its children can show from behind. */
function walkInternal(b: AftBuild, child: ComponentNode, { pRadius, cy, cz, pStart, pLen, turn }: AftParent) {
  const { length: len, radius } = internalExtent(child, pRadius);
  const off = toAftFrame(placementOffsets(child, radius)[0]!, turn);
  const start = axialStart(child, len, pStart, pLen);
  walkCopy(b, { parent: child, pRadius: radius, cy: cy + off.y, cz: cz + off.z, pStart: start, pLen: len, turn }, 0);
}

function walkChildren(b: AftBuild, at: AftParent) {
  for (const child of at.parent.children ?? []) {
    if (isHidden(b, child)) continue;
    const type = child.type;
    if (isAssembly(type)) drawAssembly(b, child, at);
    else if (isPlanarFinSet(type)) drawPlanarFins(b, child, at);
    else if (type === 'tubefinset') drawTubeFins(b, child, at);
    else if (type === 'fairing') drawFairing(b, child, at);
    else if (type === 'railbutton') drawRailButton(b, child, at);
    else if (type === 'launchlug') drawLaunchLug(b, child, at);
    else if (type === 'innertube') drawInnerTube(b, child, at);
    else if (DISC_TYPES.has(type)) drawDisc(b, child, at);
    else if (child.children?.length) walkInternal(b, child, at);
  }
}

function walkCopy(b: AftBuild, at: AftParent, i: number) {
  const outerCopy = b.copy;
  b.copy = `${outerCopy}/${at.parent.id ?? at.parent.type}#${i}`;
  walkChildren(b, at);
  b.copy = outerCopy;
}

function walkChain(b: AftBuild, nodes: ComponentNode[], cy: number, cz: number, x0: number, turn: number): number {
  let x = x0;
  for (const n of nodes) {
    if (n.type === 'stage') {
      x = walkChain(b, n.children ?? [], cy, cz, x, turn);
      continue;
    }
    const len = isChainType(n.type) ? partLength(n) : 0;
    const start = x;
    x += len;
    if (isHidden(b, n)) continue;
    const r = n.type === 'bodytube' ? bodyTubeRadius(n) : anyOuterRadius(n);
    if (r <= 0) continue;
    b.hulls.push({
      kind: 'circle',
      key: keyOf(b, n, 0),
      y: cy,
      z: cz,
      r,
      fill: colorOf(n, token(figureToken(n.type))),
      stroke: token('sch-line'),
      dash: dashOf(n),
      title: nameOf(b, n),
    });
    reach(b, cy, cz, r);
    if (n.type === 'bodytube' && n['motorMount'] === true) {
      const motor = n.id ? b.motors?.[n.id] : undefined;
      if (motor) b.inner.push(motorShape(b, n, 0, cy, cz, motor.diameter));
    }
    walkChildren(b, { parent: n, pRadius: r, cy, cz, pStart: start, pLen: len, turn });
  }
  return x;
}

export function buildAftScene(
  components: ComponentNode[],
  motors: MotorDims | undefined,
  t: TFunction,
  hiddenIds?: ReadonlySet<string>,
): { hulls: Shape[]; inner: Shape[]; outer: Shape[]; extent: number; reach: number } {
  const b: AftBuild = { hulls: [], inner: [], outer: [], motors, t, farthest: 0, copy: '', hiddenIds };
  walkChain(b, withKernelEnds({ name: '', components }).components, 0, 0, 0, 0);

  // Big circles first so nested ones stay visible.
  b.hulls.sort((p, q) => (q.kind === 'circle' ? q.r : 0) - (p.kind === 'circle' ? p.r : 0));
  return { hulls: b.hulls, inner: b.inner, outer: b.outer, extent: Math.max(0.02, b.farthest), reach: b.farthest };
}

const keyOnly = ((key: string) => key) as unknown as TFunction;

export function rocketSpanM(components: ComponentNode[]): number {
  return 2 * buildAftScene(components, undefined, keyOnly).reach;
}
