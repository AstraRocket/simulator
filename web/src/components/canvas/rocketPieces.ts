import * as THREE from 'three';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { bodyTubeRadius, countOf, finCant, noseConeAftRadius, num, numOpt } from '../../tree/nodeProps';
import { axialChain, motorSeatStart, partLength } from '../../tree/position';
import { FIN_DEFAULTS, KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import {
  FREEFORM_FALLBACK,
  bodyRadiusAt,
  finMount,
  finPointsWithRoot,
  finRootChord,
  finSpan,
  mountRadius,
  type FinParent,
} from '../../tree/finPlanform';
import {
  assemblyBoundingRadius,
  assemblyChainLength,
  assemblyParentRadius,
  isAssembly,
  resolveAssemblyRadius,
  ringInstanceOffsets,
} from '../../tree/assembly.js';
import { lineInstances, placementOffsets } from '../../tree/placement';
import { isPlanarFinSet, tubeFinRadius } from '../../tree/tubefins.js';
import {
  hasShoulder,
  nodeShape,
  outerProfile,
  profileEnds,
  shouldersOf,
  type Shoulder,
} from '../../tree/shapeProfile.js';
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

const lathe = (pts: THREE.Vector2[]): THREE.BufferGeometry | null =>
  pts.length < 2 ? null : new THREE.LatheGeometry(pts, 48);

const PACKED_TYPES = MASS_OBJECT_TYPES as ReadonlySet<string>;

const present = (s: Shoulder): Shoulder | undefined => (hasShoulder(s) ? s : undefined);

/** Lathe revolves around +Y; the radius floor keeps the tip from degenerating. */
function lathePoints(
  shape: string,
  param: number | undefined,
  length: number,
  foreR: number,
  aftR: number,
  clipped?: boolean,
  fore?: Shoulder,
  aft?: Shoulder,
): THREE.Vector2[] {
  const profile = outerProfile(shape, param, length, foreR, aftR, undefined, undefined, clipped);
  // Clamped: a shoulder wider than its part would draw as a flange.
  if (fore) {
    const r = Math.min(fore.radius, foreR);
    profile.unshift([-fore.length, r], [0, r]);
  }
  if (aft) {
    const r = Math.min(aft.radius, aftR);
    profile.push([length, r], [length + aft.length, r]);
  }
  return profile.map(([x, r]) => new THREE.Vector2(Math.max(0.0001, r), x));
}

function annulusGeometry(outerR: number, innerR: number, length: number): THREE.BufferGeometry {
  // A bore at or past the outer radius draws the tube solid (unlike `discSolid`, which drops the part).
  const bore = innerR > 1e-6 && innerR < outerR - 1e-6 ? innerR : 0;
  const v = (r: number, x: number) => new THREE.Vector2(r, x);
  const geo = surfaced([
    [lathe([v(bore, 0), v(outerR, 0)]), 'edges'],
    [lathe([v(outerR, 0), v(outerR, length)]), 'outside'],
    [lathe([v(outerR, length), v(bore, length)]), 'edges'],
    [bore ? lathe([v(bore, length), v(bore, 0)]) : null, 'inside'],
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
  const ring = (from: THREE.Vector2, to: THREE.Vector2) => (Math.abs(from.x - to.x) > 1e-6 ? lathe([from, to]) : null);
  const geo = surfaced([
    [ring(v(inR(first.x), first.y), first), 'edges'],
    [lathe(outer), 'outside'],
    [ring(last, v(inR(last.x), last.y)), 'edges'],
    [filled || thickness <= 0 ? null : lathe(outer.map((p) => v(inR(p.x), p.y)).reverse()), 'inside'],
  ]);
  return geo;
}

export interface Piece {
  key: string;
  id?: string;
  geometry: THREE.BufferGeometry;
  looks: PieceViews;
  position?: [number, number, number];
  rotation?: [number, number, number];
  translucent?: boolean;
  innerGlass?: boolean;
}

export function buildPieces(
  design: RocketTree,
  motors?: MotorDims,
  palette: PartPalette = DEFAULT_PART_COLORS,
): { pieces: Piece[]; totalLen: number; maxR: number } {
  const tree = withKernelEnds(design);
  const pieces: Piece[] = [];
  let maxR = 0.005;
  let k = 0;
  let curId: string | undefined;

  // An off-axis `xform` is baked into the geometry, leaving no position/rotation.
  const place = (
    key: string,
    geometry: THREE.BufferGeometry,
    looks: PieceViews,
    position?: [number, number, number],
    rotation?: [number, number, number],
    xform?: THREE.Matrix4,
    translucent?: boolean | 'glass',
  ) => {
    const flags = {
      translucent: translucent === true || undefined,
      innerGlass: translucent === 'glass' || undefined,
    };
    if (!xform) {
      pieces.push({ key, id: curId, geometry, looks, position, rotation, ...flags });
      return;
    }
    const g = geometry.clone();
    const m = new THREE.Matrix4().copy(xform);
    if (position) m.multiply(new THREE.Matrix4().makeTranslation(position[0], position[1], position[2]));
    if (rotation)
      m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])));
    g.applyMatrix4(m);
    pieces.push({ key, id: curId, geometry: g, looks, ...flags });
  };

  const placeMotor = (
    motor: { length: number; diameter: number },
    tube: ComponentNode,
    start: number,
    len: number,
    y: number,
    z: number,
    xform?: THREE.Matrix4,
  ) => {
    const mR = motor.diameter / 2;
    const mStart = motorSeatStart(tube, start, len, motor.length);
    place(
      `motor${k++}`,
      new THREE.CylinderGeometry(mR, mR, motor.length, 32),
      motorLooks(palette),
      [mStart + motor.length / 2, y, z],
      [0, 0, -Math.PI / 2],
      xform,
    );
  };

  const addFins = (
    child: ComponentNode,
    parent: ComponentNode,
    pStart: number,
    pLen: number,
    pRadius: number,
    xform?: THREE.Matrix4,
  ) => {
    const count = countOf(child, 'finCount', 3);
    const thickness = num(child, 'thickness', FIN_DEFAULTS.thickness);
    // Body radius under the fin front (`FinSet.getFinFront`), not the widest.
    const fp: FinParent = finMount(child, parent, pStart) ?? pRadius;
    const R = mountRadius(fp) ?? pRadius;
    // A freeform fin's span reads its parent (`FreeformFinSet.getSpan`).
    const height = finSpan(child, fp);
    const chord = finRootChord(child);
    const start = typeof fp === 'number' ? axialStart(child, chord, pStart, pLen) : pStart + fp.front;
    maxR = Math.max(maxR, R + height);
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
    // -z face is outside, +z inside (`FinRenderer.renderFinSet`); group 0 is both lids, -z half first.
    const [lids, sides] = geo.groups;
    if (lids && sides) {
      const half = lids.count / 2;
      geo.clearGroups();
      geo.addGroup(lids.start, half, SURFACE.outside);
      geo.addGroup(lids.start + half, half, SURFACE.inside);
      geo.addGroup(sides.start, sides.count, SURFACE.edges);
      markSurfaced(geo);
    }

    for (const { angle } of ringInstanceOffsets(count, 0, num(child, 'rotation', 0))) {
      const g = geo.clone();
      g.translate(start, R, 0);
      if (canted) g.applyMatrix4(canted);
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(angle));
      if (xform) g.applyMatrix4(xform);
      pieces.push({ key: `fin${k++}`, id: child.id, geometry: g, looks: nodeLooks(child, palette) });
    }
    geo.dispose();
  };

  const offsetXform = (off: { y: number; z: number }, xform?: THREE.Matrix4): THREE.Matrix4 | undefined => {
    if (off.y === 0 && off.z === 0) return xform;
    const m = new THREE.Matrix4().makeTranslation(0, off.y, off.z);
    return xform ? new THREE.Matrix4().copy(xform).multiply(m) : m;
  };

  /** `pRadius` is the parent's largest radius, not the surface under a child. */
  const addChildren = (parent: ComponentNode, pStart: number, pLen: number, pRadius: number, xform?: THREE.Matrix4) => {
    const surfaceAt = (x: number): number => bodyRadiusAt(parent, x - pStart) ?? pRadius;
    for (const child of (parent.children ?? []).flatMap(lineInstances)) {
      curId = child.id;
      if (isPlanarFinSet(child.type)) {
        addFins(child, parent, pStart, pLen, pRadius, xform);
      } else if (child.type === 'tubefinset') {
        const count = countOf(child, 'finCount', 6);
        const len = num(child, 'length', KERNEL_DEFAULTS.tubefinset.length);
        const start = axialStart(child, len, pStart, pLen);
        const R = surfaceAt(start);
        const rt = tubeFinRadius(child, R);
        const wall = Math.min(num(child, 'thickness', 0.0005), rt * 0.45);
        maxR = Math.max(maxR, R + 2 * rt);
        for (const { angle } of ringInstanceOffsets(count, 0, num(child, 'rotation', 0))) {
          const geo = annulusGeometry(rt, Math.max(rt - wall, rt * 0.55), len);
          geo.translate(start, R + rt, 0);
          geo.applyMatrix4(new THREE.Matrix4().makeRotationX(angle));
          if (xform) geo.applyMatrix4(xform);
          pieces.push({ key: `tubefin${k++}`, id: child.id, geometry: geo, looks: nodeLooks(child, palette) });
        }
      } else if (child.type === 'fairing') {
        const len = num(child, 'length', KERNEL_DEFAULTS.fairing.length);
        const wid = num(child, 'width', KERNEL_DEFAULTS.fairing.width);
        const hgt = num(child, 'height', KERNEL_DEFAULTS.fairing.height);
        const start = axialStart(child, len, pStart, pLen);
        const R = surfaceAt(start);
        maxR = Math.max(maxR, R + hgt);
        const geo = new THREE.BoxGeometry(len, hgt, wid);
        place(`fairing${k++}`, geo, nodeLooks(child, palette), [start + len / 2, R + hgt / 2, 0], [0, 0, 0], xform);
      } else if (child.type === 'launchlug') {
        const len = num(child, 'length', KERNEL_DEFAULTS.launchlug.length);
        const r = num(child, 'outerRadius', KERNEL_DEFAULTS.launchlug.outerRadius);
        const ang = num(child, 'angleOffset', Math.PI);
        const start = axialStart(child, len, pStart, pLen);
        const rad = surfaceAt(start) + r;
        const wall = num(child, 'thickness', KERNEL_DEFAULTS.launchlug.thickness);
        place(
          `lug${k++}`,
          annulusGeometry(r, r - wall, len),
          nodeLooks(child, palette),
          [start, rad * Math.cos(ang), rad * Math.sin(ang)],
          undefined,
          xform,
        );
      } else if (child.type === 'railbutton') {
        // The kernel treats it as 0-long, so the cylinder is centered on the station.
        const { diameter: dia, reach } = railButtonSize(child);
        const ang = num(child, 'angleOffset', Math.PI);
        const station = axialStart(child, 0, pStart, pLen);
        const R = surfaceAt(station);
        const rad = R + reach / 2;
        maxR = Math.max(maxR, R + reach);
        place(
          `button${k++}`,
          new THREE.CylinderGeometry(dia / 2, dia / 2, reach, 16),
          nodeLooks(child, palette),
          [station, rad * Math.cos(ang), rad * Math.sin(ang)],
          [ang, 0, 0],
          xform,
        );
      } else if (child.type === 'innertube') {
        const { length: len, radius: r } = innerTubeExtent(child);
        const start = axialStart(child, len, pStart, pLen);
        const motor = child.id ? motors?.[child.id] : undefined;
        for (const off of placementOffsets(child, r)) {
          place(
            `inner${k++}`,
            annulusGeometry(r, r - num(child, 'thickness', COMPONENT_DEFAULTS.innertube.thickness), len),
            nodeLooks(child, palette),
            [start, off.y, off.z],
            undefined,
            xform,
            'glass',
          );
          if (motor) placeMotor(motor, child, start, len, off.y, off.z, xform);
        }
        for (const off of placementOffsets(child, r)) addChildren(child, start, len, r, offsetXform(off, xform));
      } else if (isAssembly(child.type)) {
        const podChain = child.children ?? [];
        const podLen = assemblyChainLength(child);
        const podRadius = resolveAssemblyRadius(child, assemblyParentRadius(parent));
        const podStart = axialStart(child, podLen, pStart, pLen);
        const count = countOf(child, 'instanceCount', 2);
        const angleOffset = num(child, 'angleOffset', 0);
        maxR = Math.max(maxR, podRadius + assemblyBoundingRadius(child));
        for (const off of ringInstanceOffsets(count, podRadius, angleOffset)) {
          const m = new THREE.Matrix4()
            .makeRotationX(off.angle)
            .multiply(new THREE.Matrix4().makeTranslation(0, podRadius, 0));
          addChain(podChain, xform ? new THREE.Matrix4().copy(xform).multiply(m) : m, podStart);
        }
      } else if (DISC_TYPES.has(child.type)) {
        const d = child.id ? resolveDisc(tree, child.id) : null;
        const length = d?.length ?? partLength(child);
        const outerR = d?.outerR ?? 0;
        const start = axialStart(child, length, pStart, pLen);
        const [off] = placementOffsets(child, outerR);
        if (d && d.outerR > 0 && d.length > 0) {
          place(
            `disc${k++}`,
            d.holes ? holedRingGeometry(d.outerR, d.holes, d.length) : annulusGeometry(d.outerR, d.innerR, d.length),
            nodeLooks(child, palette),
            [start, off!.y, off!.z],
            undefined,
            xform,
          );
        }
        addChildren(child, start, length, outerR, offsetXform(off!, xform));
      } else if (PACKED_TYPES.has(child.type)) {
        const { length, radius } = internalExtent(child, pRadius);
        const start = axialStart(child, length, pStart, pLen);
        const [off] = placementOffsets(child, radius);
        if (radius > 0 && length > 0) {
          place(
            `packed${k++}`,
            new THREE.CylinderGeometry(radius, radius, length, 24),
            nodeLooks(child, palette),
            [start + length / 2, off!.y, off!.z],
            [0, 0, -Math.PI / 2],
            xform,
          );
        }
        addChildren(child, start, length, radius, offsetXform(off!, xform));
      }
    }
  };

  // `xform` only turns and lifts, so stations stay in the rocket frame an `absolute` child uses.
  const addChain = (nodes: ComponentNode[], xform?: THREE.Matrix4, x0 = 0): number => {
    const placeLathe = (name: string, pts: THREE.Vector2[], n: ComponentNode, at: number) =>
      place(
        name,
        shellGeometry(
          pts,
          num(n, 'thickness', COMPONENT_DEFAULTS[n.type === 'nosecone' ? 'nosecone' : 'transition'].thickness),
          n['filled'] === true,
        ),
        nodeLooks(n, palette),
        [at, 0, 0],
        [0, 0, -Math.PI / 2],
        xform,
        true,
      );
    let x = x0;
    for (const n of nodes) {
      curId = n.id;
      const len = partLength(n);
      if (n.type === 'nosecone') {
        const R = noseConeAftRadius(n);
        const shapeName = nodeShape(n);
        const ends = profileEnds(n);
        const shoulders = shouldersOf(n);
        const pts = lathePoints(
          shapeName,
          numOpt(n, 'shapeParameter'),
          len,
          ends.fore,
          ends.aft,
          undefined,
          present(shoulders.fore),
          present(shoulders.aft),
        );
        placeLathe(`nose${k++}`, pts, n, x);
        maxR = Math.max(maxR, R);
        addChildren(n, x, len, R, xform);
        x += len;
      } else if (n.type === 'bodytube') {
        const R = bodyTubeRadius(n);
        // A filled tube is solid whatever its stored wall (BodyTube.setFilled).
        const bore = n['filled'] === true ? 0 : R - num(n, 'thickness', COMPONENT_DEFAULTS.bodytube.thickness);
        place(`body${k++}`, annulusGeometry(R, bore, len), nodeLooks(n, palette), [x, 0, 0], undefined, xform, true);
        maxR = Math.max(maxR, R);
        const tubeMotor = n.id ? motors?.[n.id] : undefined;
        if (tubeMotor) placeMotor(tubeMotor, n, x, len, 0, 0, xform);
        addChildren(n, x, len, R, xform);
        x += len;
      } else if (n.type === 'transition') {
        const { fore: rf, aft: ra } = profileEnds(n);
        const shapeName = nodeShape(n);
        const pts = lathePoints(
          shapeName,
          numOpt(n, 'shapeParameter'),
          len,
          rf,
          ra,
          typeof n['clipped'] === 'boolean' ? n['clipped'] : undefined,
          present(shouldersOf(n).fore),
          present(shouldersOf(n).aft),
        );
        placeLathe(`trans${k++}`, pts, n, x);
        maxR = Math.max(maxR, rf, ra);
        addChildren(n, x, len, Math.max(rf, ra), xform);
        x += len;
      }
    }
    return x;
  };

  const chain = axialChain(tree);
  const totalLen = addChain(chain);

  return { pieces, totalLen: Math.max(totalLen, 0.05), maxR };
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
