import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { noseConeAftRadius, num, numOpt } from '../../tree/nodeProps';
import { finCutContour, finRootChord, finSpan, mountRadius, type FinParent } from '../../tree/finPlanform';
import { freeformPoints, partLength } from '../../tree/position';
import { hasShoulder, nodeOuterProfile, profileEnds, shouldersOf } from '../../tree/shapeProfile';
import { tubeFinRadius } from '../../tree/tubefins';
import { FIN_DEFAULTS, KERNEL_DEFAULTS, kernelDefault } from '../../tree/kernelDefaults';
import {
  directedEdges,
  edgeKey,
  meshTolerances,
  triangleArea,
  undirectedEdgeCounts,
  validateSolid,
} from './meshValidate';
import { KeyedError } from '../../i18n/keyedError';

// In meters. Not the 3D view's geometry: its open shells and 0.1 mm tip floor leave non-manifold seams.
const SEGMENTS = 96;

export function countBoundaryEdges(geo: THREE.BufferGeometry): number {
  const g = geo.index ? geo : mergeVertices(geo);
  const idx = g.getIndex();
  if (!idx) return 0;
  let boundary = 0;
  for (const c of undirectedEdgeCounts(idx).values()) if (c !== 2) boundary++;
  return boundary;
}

export function makeWatertight(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = mergeVertices(geo.index ? geo : mergeVertices(geo), meshTolerances(geo).weld);
  const idx = g.getIndex();
  const posAttr = g.getAttribute('position');
  if (!idx || !posAttr) return g;

  const undirected = undirectedEdgeCounts(idx);
  const dirList = directedEdges(idx);
  // A multimap: where two boundary loops meet, a vertex starts more than one boundary edge.
  const outgoing = new Map<number, number[]>();
  const push = (u: number, v: number) => {
    const arr = outgoing.get(u);
    if (arr) arr.push(v);
    else outgoing.set(u, [v]);
  };
  let boundaryEdges = 0;
  for (const [u, v] of dirList) {
    if (undirected.get(edgeKey(u, v)) === 1) {
      push(u, v);
      boundaryEdges++;
    }
  }
  if (boundaryEdges === 0) return g;

  const positions: number[] = Array.from(posAttr.array as ArrayLike<number>);
  const indices: number[] = Array.from({ length: idx.count }, (_, i) => idx.getX(i));
  const vec = (i: number) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

  const capLoop = (loop: number[]): boolean => {
    const pts = loop.map(vec);
    // Newell normal: correct for a loop that is neither planar nor convex.
    const n = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!,
        q = pts[(i + 1) % pts.length]!;
      n.x += (p.y - q.y) * (p.z + q.z);
      n.y += (p.z - q.z) * (p.x + q.x);
      n.z += (p.x - q.x) * (p.y + q.y);
    }
    if (n.lengthSq() === 0) return false;
    n.normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
    u.crossVectors(u, n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const flat = pts.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
    const fanned = THREE.ShapeUtils.triangulateShape(flat, []);
    if (!fanned.length) return false;
    const e1 = new THREE.Vector3(),
      e2 = new THREE.Vector3(),
      tn = new THREE.Vector3();
    for (const t of fanned) {
      const i0 = loop[t[0]!]!,
        i1 = loop[t[1]!]!,
        i2 = loop[t[2]!]!;
      // Every cap triangle faces -n; checked per triangle since the ear clipper's orientation varies.
      tn.crossVectors(e1.subVectors(vec(i1), vec(i0)), e2.subVectors(vec(i2), vec(i0)));
      if (tn.dot(n) > 0) indices.push(i0, i2, i1);
      else indices.push(i0, i1, i2);
    }
    return true;
  };

  const step = (u: number): number | undefined => outgoing.get(u)?.pop();

  for (const start of outgoing.keys()) {
    while ((outgoing.get(start)?.length ?? 0) > 0) {
      const loop: number[] = [start];
      // `step` pops, so a failed walk must put its edges back.
      const eaten: Array<[number, number]> = [];
      const take = (u: number): number | undefined => {
        const v = step(u);
        if (v !== undefined) eaten.push([u, v]);
        return v;
      };
      let cur = take(start);
      let closed = false;
      let guard = 0;
      while (cur !== undefined && guard++ <= boundaryEdges) {
        if (cur === start) {
          closed = true;
          break;
        }
        loop.push(cur);
        cur = take(cur);
      }
      if (!closed || loop.length < 3) {
        for (const [u, v] of eaten) push(u, v);
        // Stop retrying from this vertex or the same dead end loops forever.
        break;
      }

      // Ear-clip, not a fan from the vertex mean, which can fall outside a non-convex loop.
      capLoop(loop);
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setIndex(indices);
  out.computeVertexNormals();
  const left = countBoundaryEdges(out);
  if (left > 0) {
    throw new KeyedError('errors.export.openSolid', { edges: left });
  }
  return out;
}

function segmentsCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const cross = (ox: number, oy: number, px: number, py: number) => ox * py - oy * px;
  const d1 = cross(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]);
  const d2 = cross(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]);
  const d3 = cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]);
  const d4 = cross(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  // Touching counts too, or a figure-8 outline extrudes into a non-manifold pinch.
  const within = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.min(p[0], r[0]) <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] &&
    q[1] <= Math.max(p[1], r[1]);
  if (d1 === 0 && within(c, a, d)) return true;
  if (d2 === 0 && within(c, b, d)) return true;
  if (d3 === 0 && within(a, c, b)) return true;
  if (d4 === 0 && within(a, d, b)) return true;
  return false;
}

export function isSimplePolygon(pts: [number, number][]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  // Checked explicitly: the collinear cases below depend on exact floating-point zeros.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pts[i]![0] === pts[j]![0] && pts[i]![1] === pts[j]![1]) return false;
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent: shares an endpoint
      if (segmentsCross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

// A lathe's radius-0 pole welds into zero-area triangles that read as non-manifold.
function dropDegenerate(geo: THREE.BufferGeometry, areaTol = 1e-12): THREE.BufferGeometry {
  const idx = geo.getIndex();
  const pos = geo.getAttribute('position');
  if (!idx) return geo;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const keep: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const ia = idx.getX(i),
      ib = idx.getX(i + 1),
      ic = idx.getX(i + 2);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    if (triangleArea(a, b, c) > areaTol) keep.push(ia, ib, ic);
  }
  geo.setIndex(keep);
  return geo;
}

// mergeVertices compares all attributes; a lathe's seam carries different uv/normal at one position.
function weldSolid(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const tol = meshTolerances(geo);
  return dropDegenerate(mergeVertices(geo, tol.weld), tol.area);
}

/** `surface` is [axial (0..len), radius]. */
function revolveSolidX(surface: [number, number][], axialOffset: number): THREE.BufferGeometry {
  const n = surface.length;
  if (n === 0) return new THREE.BufferGeometry();
  const pts: THREE.Vector2[] = [];
  if (surface[0]![1] > 1e-9) pts.push(new THREE.Vector2(0, surface[0]![0])); // fore cap to axis
  for (const [ax, r] of surface) pts.push(new THREE.Vector2(Math.max(0, r), ax));
  if (surface[n - 1]![1] > 1e-9) pts.push(new THREE.Vector2(0, surface[n - 1]![0])); // aft cap to axis
  const geo = weldSolid(new THREE.LatheGeometry(pts, SEGMENTS));
  geo.rotateZ(-Math.PI / 2); // lathe axial (Y) -> world X
  geo.translate(axialOffset, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

export function discSolid(outerR: number, innerR: number, length: number): THREE.BufferGeometry | null {
  if (!(length > 1e-6)) return null;
  const len = length;
  // An inverted ring (ID >= OD) would otherwise export as a solid disc blocking the motor tube.
  if (!(outerR > 1e-6)) return null;
  if (innerR > 1e-6 && innerR >= outerR - 1e-6) return null;
  const hasBore = innerR > 1e-6 && innerR < outerR - 1e-6;
  const pts = hasBore
    ? [
        new THREE.Vector2(innerR, 0),
        new THREE.Vector2(outerR, 0),
        new THREE.Vector2(outerR, len),
        new THREE.Vector2(innerR, len),
        new THREE.Vector2(innerR, 0), // close the ring's cross-section
      ]
    : [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(outerR, 0),
        new THREE.Vector2(outerR, len),
        new THREE.Vector2(0, len),
      ];
  const geo = weldSolid(new THREE.LatheGeometry(pts, SEGMENTS));
  geo.rotateZ(-Math.PI / 2); // lathe axial (Y) -> world X
  geo.computeVertexNormals();
  return geo;
}

// Deliberately not validated: a default-spacing cluster has touching holes, as the motors need.
export function ringSolid(
  outerR: number,
  holes: { y: number; z: number; r: number }[],
  length: number,
): THREE.BufferGeometry | null {
  if (!(length > 1e-6) || !(outerR > 1e-6)) return null;
  const shape = new THREE.Shape().absarc(0, 0, outerR, 0, 2 * Math.PI, false);
  // Drawn at (−z, y) so the turn below lands each hole at its own (y, z).
  for (const h of holes) shape.holes.push(new THREE.Path().absarc(-h.z, h.y, h.r, 0, 2 * Math.PI, true));
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: SEGMENTS });
  g.rotateY(Math.PI / 2); // (a, b, depth) -> (depth, b, −a): the extrusion runs along world X
  const geo = weldSolid(g);
  geo.computeVertexNormals();
  return geo;
}

function oneFinSolid(child: ComponentNode, parent: FinParent): THREE.BufferGeometry | null {
  // A freeform outline with no root has none; other sets fly the bridge default.
  const root = child.type === 'freeformfinset' ? finRootChord(child, 0) : finRootChord(child);
  const height = finSpan(child);
  const thickness = num(child, 'thickness', FIN_DEFAULTS.thickness);

  if (!(thickness > 0) || !(root > 0) || !(height > 0)) return null;
  if (child.type === 'freeformfinset' && !isSimplePolygon(freeformPoints(child))) return null;

  // Sampling an elliptical curve here instead would give a sine arch.
  const contour = finCutContour(child, parent);
  if (!contour || contour.length < 3) return null;

  const shape = new THREE.Shape();
  shape.moveTo(contour[0]![0], contour[0]![1]);
  for (let i = 1; i < contour.length; i++) shape.lineTo(contour[i]![0], contour[i]![1]);
  shape.closePath();

  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  const welded = weldSolid(g);
  welded.computeVertexNormals();
  return welded;
}

/** Disc parts go through {@link discSolidForNode} instead. */
export function solidForNode(node: ComponentNode, parent: FinParent = null): THREE.BufferGeometry | null {
  return validated(buildSolid(node, parent));
}

function validated(geo: THREE.BufferGeometry | null): THREE.BufferGeometry | null {
  if (!geo) return null;
  if (validateSolid(geo, meshTolerances(geo).area).length) return null;
  return geo;
}

// A keyless tube fin wall takes the parent's wall in `autoRadius`; only a tree that skipped it borrows this.
const TUBE_FIN_WALL = KERNEL_DEFAULTS.innertube.thickness;

export function discSolidForNode(outerR: number, innerR: number, length: number): THREE.BufferGeometry | null {
  return validated(discSolid(outerR, innerR, length));
}

function buildSolid(node: ComponentNode, parent: FinParent): THREE.BufferGeometry | null {
  const parentRadius = mountRadius(parent);
  const len = partLength(node);
  switch (node.type) {
    case 'nosecone': {
      const R = noseConeAftRadius(node);
      if (!(R > 0) || !(len > 0)) return null;
      const surface = nodeOuterProfile(node, len, 0, R, SEGMENTS);
      // Built tip first even when flipped, so the base shoulder always goes aft.
      const sh = shouldersOf(node);
      const base = node['flipped'] === true ? sh.fore : sh.aft;
      if (hasShoulder(base))
        surface.push([len, Math.min(base.radius, R)], [len + base.length, Math.min(base.radius, R)]);
      return revolveSolidX(surface, 0);
    }
    case 'transition': {
      const { fore: rf, aft: ra } = profileEnds(node);
      if (!(len > 0) || !(Math.max(rf, ra) > 0)) return null;
      let surface = nodeOuterProfile(node, len, rf, ra, SEGMENTS);
      const { fore, aft } = shouldersOf(node);
      if (hasShoulder(fore))
        surface = [[-fore.length, Math.min(fore.radius, rf)], [0, Math.min(fore.radius, rf)], ...surface];
      if (hasShoulder(aft))
        surface = [...surface, [len, Math.min(aft.radius, ra)], [len + aft.length, Math.min(aft.radius, ra)]];
      return revolveSolidX(surface, 0);
    }
    // Coupler, engine block and rings go through resolveDisc, not here.
    case 'bodytube':
    case 'innertube':
    case 'launchlug':
    case 'tubefinset': {
      // A tube fin set auto-sizes from the body radius (TubeFinSet.getOuterRadius).
      const R =
        node.type === 'tubefinset'
          ? (numOpt(node, 'outerRadius') ?? (parentRadius != null ? tubeFinRadius(node, parentRadius) : NaN))
          : // `NaN` where the factory reads no default, so the guard below skips the part.
            num(node, 'outerRadius', kernelDefault(node.type, 'outerRadius') ?? NaN);
      const wall = num(node, 'thickness', kernelDefault(node.type, 'thickness') ?? TUBE_FIN_WALL);
      // A zero radius or length revolves to an empty mesh that still reads as watertight.
      if (!(R > 0) || !(len > 0)) return null;
      // BodyTube.setFilled: flies as a solid rod.
      if (node.type === 'bodytube' && node['filled'] === true) return discSolid(R, 0, len);
      // No bore left: discSolid would silently export a solid rod.
      if (!(wall < R)) return null;
      return discSolid(R, R - wall, len);
    }
    case 'trapezoidfinset':
    case 'ellipticalfinset':
    case 'freeformfinset':
      return oneFinSolid(node, parent);
    default:
      return null;
  }
}
