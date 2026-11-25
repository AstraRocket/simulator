import * as THREE from 'three';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { bodyTubeRadius, countOf, finCant, noseConeAftRadius, num } from '../../tree/nodeProps';
import { axialChain, motorSeatStart, partLength, podPlacement } from '../../tree/position';
import { FIN_DEFAULTS, KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import {
  FREEFORM_FALLBACK,
  bodyRadiusAt,
  finOutlinePoints,
  finPlacement,
  finPointsWithRoot,
  finRootChord,
  finSpan,
} from '../../tree/finPlanform';
import { assemblyBoundingRadius, isAssembly, ringInstanceOffsets } from '../../tree/assembly.js';
import { lineInstances, placementOffsets } from '../../tree/placement';
import { isPlanarFinSet, tubeFinSeat, tubeFinWall } from '../../tree/tubefins.js';
import { hasShoulder, nodeOuterProfile, profileEnds, shouldersOf } from '../../tree/shapeProfile.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEFAULT_PART_COLORS, type PartPalette } from '../../services/design/partColors';
import { figureLooks, partLooks, type Look } from '../../services/design/appearance';
import { COMPONENT_DEFAULTS } from '../../services/design/componentDefaults';
import { DISC_TYPES } from '../../services/files/componentFormats';
import { resolveDisc, type Hole } from '../../services/design/discGeometry';
import { axialStart, innerTubeExtent, internalExtent, type MotorDims } from '../../tree/schematicGeometry';
import { withKernelEnds } from '../../services/design/autoRadius';
import { railButtonSize } from './railButton';
import { MASS_OBJECT_TYPES } from '../../tree/componentKinds';

/** Rocket axis = +X (nose tip at x=0, aft increasing), matching the engine. */

export interface PieceLooks {
  outside: Look;
  inside: Look;
  edges: Look;
}

export const SURFACE = { outside: 0, inside: 1, edges: 2 } as const;

/** three.js primitives carry their own groups (a box has six), so groups alone do not say so. */
export const isSurfaced = (g: THREE.BufferGeometry): boolean => g.userData['surfaced'] === true;
const markSurfaced = (g: THREE.BufferGeometry): void => {
  g.userData['surfaced'] = true;
};

export interface PieceViews {
  finished: PieceLooks;
  figure: PieceLooks;
}

export type RenderMode = keyof PieceViews;

const nodeLooks = (n: ComponentNode, palette: PartPalette): PieceViews => ({
  finished: partLooks(n, palette),
  figure: figureLooks(n, palette),
});

const motorLooks = (palette: PartPalette): PieceViews => {
  const look = { color: palette.motor, shine: 0, opacity: 1 };
  const looks = { outside: look, inside: look, edges: look };
  return { finished: looks, figure: looks };
};

function surfaced(parts: [THREE.BufferGeometry | null, keyof typeof SURFACE][]): THREE.BufferGeometry {
  const present = parts.filter((p): p is [THREE.BufferGeometry, keyof typeof SURFACE] => p[0] !== null);
  const merged = mergeGeometries(
    present.map(([g]) => g),
    true,
  );
  present.forEach(([, surface], i) => {
    merged.groups[i]!.materialIndex = SURFACE[surface];
  });
  markSurfaced(merged);
  return merged;
}

/**
 * Revolved about +Y from the side that lands on the rocket's +Y once turned onto the axis, so a decal wraps as in
 * desktop's `TubeGenerator`: u runs once around, v from 1 at the fore end `y0` to 0 at `y0 + len` (the reverse for
 * `aftUp`, a coaxial tube's inner wall).
 */
function lathe(pts: THREE.Vector2[], len: number, aftUp = false, y0 = 0): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;
  const g = new THREE.LatheGeometry(pts, 48, -Math.PI / 2);
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const along = len > 0 ? (pos.getY(i) - y0) / len : 0;
    uv.setXY(i, 1 - uv.getX(i), aftUp ? along : 1 - along);
  }
  return g;
}

/** An end ring, as `TubeGenerator.getRingCapUV`: v runs across the wall, toward the outside at the fore end. */
function ringCap(innerR: number, outerR: number, x: number, fore: boolean): THREE.BufferGeometry | null {
  const v = (r: number) => new THREE.Vector2(r, x);
  const g = lathe(fore ? [v(innerR), v(outerR)] : [v(outerR), v(innerR)], 1);
  if (!g) return null;
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  const span = Math.max(outerR - innerR, 1e-6);
  for (let i = 0; i < uv.count; i++) {
    const across = (outerR - Math.hypot(pos.getX(i), pos.getZ(i))) / span;
    uv.setY(i, fore ? 1 - across : across);
  }
  return g;
}

const PACKED_TYPES = MASS_OBJECT_TYPES as ReadonlySet<string>;

/** Lathe revolves around +Y; the radius floor keeps the tip from degenerating. */
function lathePoints(n: ComponentNode, length: number, foreR: number, aftR: number): THREE.Vector2[] {
  const profile = nodeOuterProfile(n, length, foreR, aftR);
  return profile.map(([x, r]) => new THREE.Vector2(Math.max(0.0001, r), x));
}

function annulusGeometry(outerR: number, innerR: number, length: number): THREE.BufferGeometry {
  // A bore at or past the outer radius draws the tube solid (unlike `discSolid`, which drops the part).
  const bore = innerR > 1e-6 && innerR < outerR - 1e-6 ? innerR : 0;
  const v = (r: number, x: number) => new THREE.Vector2(r, x);
  // A coaxial part's inner wall runs its image the other way (`TubeGenerator.reverseInnerWallTextureAxis`).
  const geo = surfaced([
    [ringCap(bore, outerR, 0, true), 'edges'],
    [lathe([v(outerR, 0), v(outerR, length)], length), 'outside'],
    [ringCap(bore, outerR, length, false), 'edges'],
    [bore ? lathe([v(bore, length), v(bore, 0)], length, true) : null, 'inside'],
  ]);
  geo.rotateZ(-Math.PI / 2); // lathe axial (+Y) -> rocket axis (+X)
  return geo;
}

function holedRingGeometry(outerR: number, holes: Hole[], length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape().absarc(0, 0, outerR, 0, 2 * Math.PI, false);
  // Drawn at (−z, y) so the turn below lands each hole at its own (y, z).
  for (const h of holes) shape.holes.push(new THREE.Path().absarc(-h.z, h.y, h.r, 0, 2 * Math.PI, true));
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 24 });
  const pos = g.getAttribute('position');
  const sorted: Record<keyof typeof SURFACE, number[]> = { outside: [], inside: [], edges: [] };
  const onOuter = (i: number) => Math.hypot(pos.getX(i), pos.getY(i)) > outerR - 1e-6;
  // ExtrudeGeometry is unindexed: faces in group 0, walls in group 1.
  for (const group of g.groups) {
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const surface =
        group.materialIndex === 0 ? 'edges' : onOuter(i) && onOuter(i + 1) && onOuter(i + 2) ? 'outside' : 'inside';
      sorted[surface].push(i, i + 1, i + 2);
    }
  }
  const part = (list: number[]): THREE.BufferGeometry | null => {
    if (list.length === 0) return null;
    const piece = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const src = g.getAttribute(name);
      const out = new Float32Array(list.length * src.itemSize);
      list.forEach((v, j) => {
        for (let c = 0; c < src.itemSize; c++) out[j * src.itemSize + c] = src.array[v * src.itemSize + c]!;
      });
      piece.setAttribute(name, new THREE.BufferAttribute(out, src.itemSize));
    }
    return piece;
  };
  const geo = surfaced([
    [part(sorted.edges), 'edges'],
    [part(sorted.outside), 'outside'],
    [part(sorted.inside), 'inside'],
  ]);
  g.dispose();
  geo.rotateY(Math.PI / 2); // (a, b, depth) -> (depth, b, −a): the extrusion runs along the rocket axis
  return geo;
}

/** As `ComponentRenderer.renderTransition`: inside offset by `-thickness`. */
function shellGeometry(outer: THREE.Vector2[], thickness: number, filled: boolean): THREE.BufferGeometry {
  const v = (r: number, x: number) => new THREE.Vector2(r, x);
  const inR = (r: number) => (filled ? 0 : Math.max(0.0001, r - thickness));
  const first = outer[0]!;
  const last = outer[outer.length - 1]!;
  const len = last.y - first.y;
  const ring = (p: THREE.Vector2, fore: boolean) =>
    Math.abs(p.x - inR(p.x)) > 1e-6 ? ringCap(inR(p.x), p.x, p.y, fore) : null;
  const geo = surfaced([
    [ring(first, true), 'edges'],
    [lathe(outer, len, false, first.y), 'outside'],
    [ring(last, false), 'edges'],
    // Unlike a tube's, a profiled wall's inside runs as its outside does.
    [
      filled || thickness <= 0 ? null : lathe(outer.map((p) => v(inR(p.x), p.y)).reverse(), len, false, first.y),
      'inside',
    ],
  ]);
  return geo;
}

/** One copy of a pod set or strap-on. */
export interface AssemblyCopy {
  id: string;
  index: number;
  /** From the copy's own axis to the rocket's. */
  matrix: THREE.Matrix4;
}

export interface Piece {
  key: string;
  id?: string;
  /** What it is a copy of, outermost first; none on the rocket's axis. */
  copies?: AssemblyCopy[];
  geometry: THREE.BufferGeometry;
  looks: PieceViews;
  position?: [number, number, number];
  rotation?: [number, number, number];
  translucent?: boolean;
  innerGlass?: boolean;
}

/** A motor's aft end, whether or not its mount holds one. The exhaust leaves along +X. */
export interface Nozzle {
  mountId: string;
  at: [number, number, number];
  /** The motor's, or the empty mount's bore. */
  radius: number;
}

/** What every part's builder shares during one `buildPieces`; a builder adds its own `Piece`s and grows `maxR`. */
interface PieceBuild {
  tree: RocketTree;
  pieces: Piece[];
  nozzles: Nozzle[];
  motors: MotorDims | undefined;
  palette: PartPalette;
  maxR: number;
  k: number;
  curId: string | undefined;
}

/** `pRadius` is the parent's largest radius, not the surface under a child. */
interface PieceParent {
  parent: ComponentNode;
  pStart: number;
  pLen: number;
  pRadius: number;
  xform: THREE.Matrix4 | undefined;
}

// An off-axis `xform` is baked into the geometry, leaving no position/rotation.
function place(
  b: PieceBuild,
  key: string,
  geometry: THREE.BufferGeometry,
  looks: PieceViews,
  position?: [number, number, number],
  rotation?: [number, number, number],
  xform?: THREE.Matrix4,
  translucent?: boolean | 'glass',
) {
  const flags = {
    translucent: translucent === true || undefined,
    innerGlass: translucent === 'glass' || undefined,
  };
  if (!xform) {
    b.pieces.push({ key, id: b.curId, geometry, looks, position, rotation, ...flags });
    return;
  }
  const g = geometry.clone();
  const m = new THREE.Matrix4().copy(xform);
  if (position) m.multiply(new THREE.Matrix4().makeTranslation(position[0], position[1], position[2]));
  if (rotation)
    m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])));
  g.applyMatrix4(m);
  b.pieces.push({ key, id: b.curId, geometry: g, looks, ...flags });
}

function placeMotor(
  b: PieceBuild,
  motor: { length: number; diameter: number },
  tube: ComponentNode,
  start: number,
  len: number,
  y: number,
  z: number,
  xform?: THREE.Matrix4,
) {
  const mR = motor.diameter / 2;
  const mStart = motorSeatStart(tube, start, len, motor.length);
  place(
    b,
    `motor${b.k++}`,
    new THREE.CylinderGeometry(mR, mR, motor.length, 32),
    motorLooks(b.palette),
    [mStart + motor.length / 2, y, z],
    [0, 0, -Math.PI / 2],
    xform,
  );
}

function addNozzle(
  b: PieceBuild,
  mount: ComponentNode,
  aft: number,
  bore: number,
  off: { y: number; z: number },
  xform?: THREE.Matrix4,
) {
  if (mount.motorMount !== true || mount.id == null) return;
  const at = new THREE.Vector3(aft + num(mount, 'motorOverhang', 0), off.y, off.z);
  if (xform) at.applyMatrix4(xform);
  const motor = b.motors?.[mount.id];
  b.nozzles.push({ mountId: mount.id, at: at.toArray(), radius: motor ? motor.diameter / 2 : bore });
}

function addFins(b: PieceBuild, child: ComponentNode, { parent, pStart, pLen, pRadius, xform }: PieceParent) {
  const count = countOf(child, 'finCount', 3);
  const thickness = num(child, 'thickness', FIN_DEFAULTS.thickness);
  // Body radius under the fin front (`FinSet.getFinFront`), not the widest.
  const { fp, R } = finPlacement(child, parent, pStart, pRadius);
  // A freeform fin's span reads its parent (`FreeformFinSet.getSpan`).
  const height = finSpan(child, fp);
  const chord = finRootChord(child);
  const start = typeof fp === 'number' ? axialStart(child, chord, pStart, pLen) : pStart + fp.front;
  b.maxR = Math.max(b.maxR, R + height);
  // Cant turns about the root midpoint before the axis turn (FinSet.java:1783-1791).
  const cant = finCant(child);
  const mid = start + chord / 2;
  const canted =
    cant === 0
      ? null
      : new THREE.Matrix4()
          .makeTranslation(mid, 0, 0)
          .multiply(new THREE.Matrix4().makeRotationY(cant))
          .multiply(new THREE.Matrix4().makeTranslation(-mid, 0, 0));

  const outline = finPointsWithRoot(child, fp) ?? FREEFORM_FALLBACK;
  // A degenerate planform would throw and take the view down.
  const first = outline[0];
  if (!first || outline.length < 3) return;

  const shape = new THREE.Shape();
  shape.moveTo(first[0], first[1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i]![0], outline[i]![1]);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  // +z face is the left (outside), -z the right, as `FinSetGenerator`; group 0 is both lids, -z half first.
  const [lids, sides] = geo.groups;
  if (lids && sides) {
    const half = lids.count / 2;
    geo.clearGroups();
    geo.addGroup(lids.start, half, SURFACE.inside);
    geo.addGroup(lids.start + half, half, SURFACE.outside);
    geo.addGroup(sides.start, sides.count, SURFACE.edges);
    markSurfaced(geo);
    finUvs(geo, finOutlinePoints(child, fp) ?? outline, lids.start, lids.start + half);
  }

  for (const { angle } of ringInstanceOffsets(count, 0, num(child, 'rotation', 0))) {
    const g = geo.clone();
    g.translate(start, R, 0);
    if (canted) g.applyMatrix4(canted);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(angle));
    if (xform) g.applyMatrix4(xform);
    b.pieces.push({ key: `fin${b.k++}`, id: child.id, geometry: g, looks: nodeLooks(child, b.palette) });
  }
  geo.dispose();
}

/**
 * As desktop's `FinSetGenerator.createShapeMesh`: the image spans the box around the fin points
 * (`FinSet.getInstanceBoundingBox`), without the root curve or the tab. The right side (vertices `mirrorFrom` up to
 * `mirrorTo`) takes `-u`, not `1 - u` (`RocketMeshBuilder.mirrorFinRightTextureCoordinates`).
 */
function finUvs(
  geo: THREE.BufferGeometry,
  outline: readonly (readonly number[])[],
  mirrorFrom: number,
  mirrorTo: number,
) {
  const xs = outline.map((p) => p[0]!);
  const ys = outline.map((p) => p[1]!);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const u = (pos.getX(i) - minX) / spanX;
    uv.setXY(i, i >= mirrorFrom && i < mirrorTo ? -u : u, (pos.getY(i) - minY) / spanY);
  }
}

const offsetXform = (off: { y: number; z: number }, xform?: THREE.Matrix4): THREE.Matrix4 | undefined => {
  if (off.y === 0 && off.z === 0) return xform;
  const m = new THREE.Matrix4().makeTranslation(0, off.y, off.z);
  return xform ? new THREE.Matrix4().copy(xform).multiply(m) : m;
};

const surfaceAt = ({ parent, pStart, pRadius }: PieceParent, x: number): number =>
  bodyRadiusAt(parent, x - pStart) ?? pRadius;

function addTubeFins(b: PieceBuild, child: ComponentNode, at: PieceParent) {
  const count = countOf(child, 'finCount', 6);
  const seat = tubeFinSeat(child, at.pStart, at.pLen, (o) => surfaceAt(at, at.pStart + o));
  const { length: len, start, bodyRadius: R, tubeRadius: rt } = seat;
  // The bore the kernel flies; a set with no wall at all (no body tube to take one from) is drawn solid.
  const wall = tubeFinWall(child, at.parent, rt);
  const bore = Number.isFinite(wall) ? rt - wall : 0;
  b.maxR = Math.max(b.maxR, R + 2 * rt);
  for (const { angle } of ringInstanceOffsets(count, 0, num(child, 'rotation', 0))) {
    const geo = annulusGeometry(rt, bore, len);
    geo.translate(start, R + rt, 0);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(angle));
    if (at.xform) geo.applyMatrix4(at.xform);
    b.pieces.push({ key: `tubefin${b.k++}`, id: child.id, geometry: geo, looks: nodeLooks(child, b.palette) });
  }
}

function addFairing(b: PieceBuild, child: ComponentNode, at: PieceParent) {
  const len = num(child, 'length', KERNEL_DEFAULTS.fairing.length);
  const wid = num(child, 'width', KERNEL_DEFAULTS.fairing.width);
  const hgt = num(child, 'height', KERNEL_DEFAULTS.fairing.height);
  const start = axialStart(child, len, at.pStart, at.pLen);
  const R = surfaceAt(at, start);
  b.maxR = Math.max(b.maxR, R + hgt);
  const geo = new THREE.BoxGeometry(len, hgt, wid);
  place(b, `fairing${b.k++}`, geo, nodeLooks(child, b.palette), [start + len / 2, R + hgt / 2, 0], [0, 0, 0], at.xform);
}

function addLaunchLug(b: PieceBuild, child: ComponentNode, at: PieceParent) {
  const len = num(child, 'length', KERNEL_DEFAULTS.launchlug.length);
  const r = num(child, 'outerRadius', KERNEL_DEFAULTS.launchlug.outerRadius);
  const ang = num(child, 'angleOffset', KERNEL_DEFAULTS.launchlug.angleOffset);
  const start = axialStart(child, len, at.pStart, at.pLen);
  const rad = surfaceAt(at, start) + r;
  const wall = num(child, 'thickness', KERNEL_DEFAULTS.launchlug.thickness);
  place(
    b,
    `lug${b.k++}`,
    annulusGeometry(r, r - wall, len),
    nodeLooks(child, b.palette),
    [start, rad * Math.cos(ang), rad * Math.sin(ang)],
    undefined,
    at.xform,
  );
}

function addRailButton(b: PieceBuild, child: ComponentNode, at: PieceParent) {
  // The kernel treats it as 0-long, so the cylinder is centered on the station.
  const { diameter: dia, reach } = railButtonSize(child);
  const ang = num(child, 'angleOffset', KERNEL_DEFAULTS.railbutton.angleOffset);
  const station = axialStart(child, 0, at.pStart, at.pLen);
  const R = surfaceAt(at, station);
  const rad = R + reach / 2;
  b.maxR = Math.max(b.maxR, R + reach);
  place(
    b,
    `button${b.k++}`,
    new THREE.CylinderGeometry(dia / 2, dia / 2, reach, 16),
    nodeLooks(child, b.palette),
    [station, rad * Math.cos(ang), rad * Math.sin(ang)],
    [ang, 0, 0],
    at.xform,
  );
}

function addInnerTube(b: PieceBuild, child: ComponentNode, { pStart, pLen, xform }: PieceParent) {
  const { length: len, radius: r } = innerTubeExtent(child);
  const start = axialStart(child, len, pStart, pLen);
  const motor = child.id ? b.motors?.[child.id] : undefined;
  for (const off of placementOffsets(child, r)) {
    place(
      b,
      `inner${b.k++}`,
      annulusGeometry(r, r - num(child, 'thickness', COMPONENT_DEFAULTS.innertube.thickness), len),
      nodeLooks(child, b.palette),
      [start, off.y, off.z],
      undefined,
      xform,
      'glass',
    );
    if (motor) placeMotor(b, motor, child, start, len, off.y, off.z, xform);
    addNozzle(b, child, start + len, r, off, xform);
  }
  for (const off of placementOffsets(child, r)) {
    addChildren(b, { parent: child, pStart: start, pLen: len, pRadius: r, xform: offsetXform(off, xform) });
  }
}

function addAssembly(b: PieceBuild, child: ComponentNode, { parent, pStart, pLen, xform }: PieceParent) {
  const pod = podPlacement(child, parent, pStart, pLen);
  b.maxR = Math.max(b.maxR, pod.radius + assemblyBoundingRadius(child));
  pod.copies.forEach((off, index) => {
    const m = new THREE.Matrix4()
      .makeRotationX(off.angle)
      .multiply(new THREE.Matrix4().makeTranslation(0, pod.radius, 0));
    const matrix = xform ? new THREE.Matrix4().copy(xform).multiply(m) : m;
    const before = b.pieces.length;
    addChain(b, child.children ?? [], matrix, pod.start);
    const copy = { id: child.id ?? '', index, matrix };
    for (const p of b.pieces.slice(before)) p.copies = [copy, ...(p.copies ?? [])];
  });
}

function addDisc(b: PieceBuild, child: ComponentNode, { pStart, pLen, xform }: PieceParent) {
  const d = child.id ? resolveDisc(b.tree, child.id) : null;
  const length = d?.length ?? partLength(child);
  const outerR = d?.outerR ?? 0;
  const start = axialStart(child, length, pStart, pLen);
  const off = placementOffsets(child, outerR)[0]!;
  if (d && d.outerR > 0 && d.length > 0) {
    place(
      b,
      `disc${b.k++}`,
      d.holes ? holedRingGeometry(d.outerR, d.holes, d.length) : annulusGeometry(d.outerR, d.innerR, d.length),
      nodeLooks(child, b.palette),
      [start, off.y, off.z],
      undefined,
      xform,
    );
  }
  addChildren(b, { parent: child, pStart: start, pLen: length, pRadius: outerR, xform: offsetXform(off, xform) });
}

function addPacked(b: PieceBuild, child: ComponentNode, { pStart, pLen, pRadius, xform }: PieceParent) {
  const { length, radius } = internalExtent(child, pRadius);
  const start = axialStart(child, length, pStart, pLen);
  const off = placementOffsets(child, radius)[0]!;
  if (radius > 0 && length > 0) {
    place(
      b,
      `packed${b.k++}`,
      new THREE.CylinderGeometry(radius, radius, length, 24),
      nodeLooks(child, b.palette),
      [start + length / 2, off.y, off.z],
      [0, 0, -Math.PI / 2],
      xform,
    );
  }
  addChildren(b, { parent: child, pStart: start, pLen: length, pRadius: radius, xform: offsetXform(off, xform) });
}

function addChildren(b: PieceBuild, at: PieceParent) {
  for (const child of (at.parent.children ?? []).flatMap(lineInstances)) {
    b.curId = child.id;
    if (isPlanarFinSet(child.type)) addFins(b, child, at);
    else if (child.type === 'tubefinset') addTubeFins(b, child, at);
    else if (child.type === 'fairing') addFairing(b, child, at);
    else if (child.type === 'launchlug') addLaunchLug(b, child, at);
    else if (child.type === 'railbutton') addRailButton(b, child, at);
    else if (child.type === 'innertube') addInnerTube(b, child, at);
    else if (isAssembly(child.type)) addAssembly(b, child, at);
    else if (DISC_TYPES.has(child.type)) addDisc(b, child, at);
    else if (PACKED_TYPES.has(child.type)) addPacked(b, child, at);
  }
}

function placeLathe(
  b: PieceBuild,
  name: string,
  pts: THREE.Vector2[],
  n: ComponentNode,
  at: number,
  xform: THREE.Matrix4 | undefined,
) {
  place(
    b,
    name,
    shellGeometry(
      pts,
      num(n, 'thickness', COMPONENT_DEFAULTS[n.type === 'nosecone' ? 'nosecone' : 'transition'].thickness),
      n['filled'] === true,
    ),
    nodeLooks(n, b.palette),
    [at, 0, 0],
    [0, 0, -Math.PI / 2],
    xform,
    true,
  );
}

/**
 * Each shoulder is its own tube with its own wall, and a capped one is closed by a disc of that wall at
 * its free end, where the kernel weighs the cap. As desktop's `TransitionExporter.addShoulder`, a filled
 * part's shoulder is solid.
 */
function addShoulders(
  b: PieceBuild,
  n: ComponentNode,
  x: number,
  len: number,
  ends: { fore: number; aft: number },
  xform: THREE.Matrix4 | undefined,
) {
  const sides = shouldersOf(n);
  for (const side of ['fore', 'aft'] as const) {
    const sh = sides[side];
    if (!hasShoulder(sh)) continue;
    // Clamped: a shoulder wider than its part would draw as a flange.
    const r = Math.min(sh.radius, ends[side]);
    const bore = n['filled'] === true ? 0 : Math.max(0, r - sh.thickness);
    const start = side === 'fore' ? x - sh.length : x + len;
    const looks = nodeLooks(n, b.palette);
    place(b, `shoulder${b.k++}`, annulusGeometry(r, bore, sh.length), looks, [start, 0, 0], undefined, xform, true);
    if (sh.capped && bore > 0) {
      const cap = Math.min(sh.thickness, sh.length);
      const at = side === 'fore' ? start : start + sh.length - cap;
      place(b, `cap${b.k++}`, annulusGeometry(bore, 0, cap), looks, [at, 0, 0], undefined, xform, true);
    }
  }
}

function addNoseCone(b: PieceBuild, n: ComponentNode, x: number, len: number, xform: THREE.Matrix4 | undefined) {
  const R = noseConeAftRadius(n);
  const ends = profileEnds(n);
  const pts = lathePoints(n, len, ends.fore, ends.aft);
  placeLathe(b, `nose${b.k++}`, pts, n, x, xform);
  addShoulders(b, n, x, len, ends, xform);
  b.maxR = Math.max(b.maxR, R);
  addChildren(b, { parent: n, pStart: x, pLen: len, pRadius: R, xform });
}

function addBodyTube(b: PieceBuild, n: ComponentNode, x: number, len: number, xform: THREE.Matrix4 | undefined) {
  const R = bodyTubeRadius(n);
  // A filled tube is solid whatever its stored wall (BodyTube.setFilled).
  const bore = n['filled'] === true ? 0 : R - num(n, 'thickness', COMPONENT_DEFAULTS.bodytube.thickness);
  place(b, `body${b.k++}`, annulusGeometry(R, bore, len), nodeLooks(n, b.palette), [x, 0, 0], undefined, xform, true);
  b.maxR = Math.max(b.maxR, R);
  const tubeMotor = n.id ? b.motors?.[n.id] : undefined;
  if (tubeMotor) placeMotor(b, tubeMotor, n, x, len, 0, 0, xform);
  addNozzle(b, n, x + len, R, { y: 0, z: 0 }, xform);
  addChildren(b, { parent: n, pStart: x, pLen: len, pRadius: R, xform });
}

function addTransition(b: PieceBuild, n: ComponentNode, x: number, len: number, xform: THREE.Matrix4 | undefined) {
  const { fore: rf, aft: ra } = profileEnds(n);
  const pts = lathePoints(n, len, rf, ra);
  placeLathe(b, `trans${b.k++}`, pts, n, x, xform);
  addShoulders(b, n, x, len, { fore: rf, aft: ra }, xform);
  b.maxR = Math.max(b.maxR, rf, ra);
  addChildren(b, { parent: n, pStart: x, pLen: len, pRadius: Math.max(rf, ra), xform });
}

// `xform` only turns and lifts, so stations stay in the rocket frame an `absolute` child uses.
function addChain(b: PieceBuild, nodes: ComponentNode[], xform?: THREE.Matrix4, x0 = 0): number {
  let x = x0;
  for (const n of nodes) {
    b.curId = n.id;
    const len = partLength(n);
    if (n.type === 'nosecone') addNoseCone(b, n, x, len, xform);
    else if (n.type === 'bodytube') addBodyTube(b, n, x, len, xform);
    else if (n.type === 'transition') addTransition(b, n, x, len, xform);
    else continue;
    x += len;
  }
  return x;
}

export function buildPieces(
  design: RocketTree,
  motors?: MotorDims,
  palette: PartPalette = DEFAULT_PART_COLORS,
): { pieces: Piece[]; nozzles: Nozzle[]; totalLen: number; maxR: number } {
  const tree = withKernelEnds(design);
  const b: PieceBuild = { tree, pieces: [], nozzles: [], motors, palette, maxR: 0.005, k: 0, curId: undefined };
  const totalLen = addChain(b, axialChain(tree));
  return { pieces: b.pieces, nozzles: b.nozzles, totalLen: Math.max(totalLen, 0.05), maxR: b.maxR };
}

export const markerRadius = (totalLen: number, maxR: number): number => Math.max(totalLen * 0.015, maxR * 0.35);

/** Not `Box3.setFromObject`: that needs current world matrices and includes the CG/CP markers. */
export function piecesBounds(pieces: Piece[]): THREE.Box3 {
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  for (const p of pieces) {
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    if (!p.geometry.boundingBox) continue;
    one.copy(p.geometry.boundingBox);
    if (p.position || p.rotation) {
      const r = p.rotation ?? [0, 0, 0];
      const t = p.position ?? [0, 0, 0];
      one.applyMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2])).setPosition(t[0], t[1], t[2]),
      );
    }
    box.union(one);
  }
  return box;
}
