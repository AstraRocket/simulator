import * as THREE from 'three';

type MeshIssueKind =
  | 'empty'
  | 'non-finite'
  | 'degenerate-triangle'
  | 'repeated-vertex'
  | 'non-manifold-edge'
  | 'inconsistent-winding'
  | 'inside-out';

export interface MeshIssue {
  kind: MeshIssueKind;
  detail: string;
  count?: number;
}

export const edgeKey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

export function directedEdges(idx: THREE.BufferAttribute): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i),
      b = idx.getX(i + 1),
      c = idx.getX(i + 2);
    edges.push([a, b], [b, c], [c, a]);
  }
  return edges;
}

export function undirectedEdgeCounts(idx: THREE.BufferAttribute): Map<string, number> {
  const count = new Map<string, number>();
  for (const [u, v] of directedEdges(idx)) {
    const k = edgeKey(u, v);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return count;
}

type Positions = THREE.BufferGeometry['attributes'][string];

function countNonFinite(pos: Positions): number {
  let nonFinite = 0;
  for (let i = 0; i < pos.count; i++) {
    if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) nonFinite++;
  }
  return nonFinite;
}

const scratchAb = new THREE.Vector3();
const scratchAc = new THREE.Vector3();

export function triangleArea(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  return scratchAb.subVectors(b, a).cross(scratchAc.subVectors(c, a)).length() * 0.5;
}

/** One pass over the triangles, gathering what the checks in `validateSolid` need. */
function surveyTriangles(pos: Positions, idx: THREE.BufferAttribute, areaTol: number) {
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const ab = new THREE.Vector3();

  let degenerate = 0;
  let repeated = 0;
  let volume6 = 0;
  const directed = new Map<string, number>();
  const undirected = new Map<string, number>();

  for (let i = 0; i < idx.count - 2; i += 3) {
    const ia = idx.getX(i),
      ib = idx.getX(i + 1),
      ic = idx.getX(i + 2);

    if (ia === ib || ib === ic || ic === ia) {
      repeated++;
      continue;
    }

    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    if (!(triangleArea(a, b, c) > areaTol)) degenerate++;
    volume6 += a.dot(ab.copy(b).cross(c));

    for (const [u, v] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ] as const) {
      directed.set(`${u}>${v}`, (directed.get(`${u}>${v}`) ?? 0) + 1);
      const k = edgeKey(u, v);
      undirected.set(k, (undirected.get(k) ?? 0) + 1);
    }
  }

  return { degenerate, repeated, volume6, directed, undirected };
}

function countEdgeUse(undirected: Map<string, number>): { open: number; overused: number } {
  let open = 0;
  let overused = 0;
  for (const n of undirected.values()) {
    if (n < 2) open++;
    else if (n > 2) overused++;
  }
  return { open, overused };
}

function nonManifoldIssue(open: number, overused: number): MeshIssue {
  const parts: string[] = [];
  if (open) parts.push(`${open} open`);
  if (overused) parts.push(`${overused} shared by more than two faces`);
  return {
    kind: 'non-manifold-edge',
    detail: `edges not shared by exactly two faces (${parts.join(', ')})`,
    count: open + overused,
  };
}

/** `areaTol` (m^2) should come from {@link meshTolerances}: a fixed cut erases a tiny model. */
export function validateSolid(geo: THREE.BufferGeometry, areaTol = 0): MeshIssue[] {
  const issues: MeshIssue[] = [];
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex();

  if (!pos || pos.count === 0 || !idx || idx.count === 0) {
    return [{ kind: 'empty', detail: 'the solid has no triangles' }];
  }
  if (idx.count % 3 !== 0) {
    issues.push({ kind: 'empty', detail: `index length ${idx.count} is not a whole number of triangles` });
  }

  const nonFinite = countNonFinite(pos);
  if (nonFinite) {
    issues.push({
      kind: 'non-finite',
      detail: `${nonFinite} vertex position(s) are NaN or Infinity`,
      count: nonFinite,
    });
  }

  const { degenerate, repeated, volume6, directed, undirected } = surveyTriangles(pos, idx, areaTol);

  if (repeated) {
    issues.push({
      kind: 'repeated-vertex',
      detail: `${repeated} triangle(s) use the same vertex twice`,
      count: repeated,
    });
  }
  if (degenerate) {
    issues.push({
      kind: 'degenerate-triangle',
      detail: `${degenerate} triangle(s) have effectively zero area`,
      count: degenerate,
    });
  }

  const { open, overused } = countEdgeUse(undirected);
  if (open || overused) issues.push(nonManifoldIssue(open, overused));

  let flipped = 0;
  for (const n of directed.values()) if (n > 1) flipped++;
  if (flipped) {
    issues.push({
      kind: 'inconsistent-winding',
      detail: `${flipped} edge(s) are traversed the same way by two faces, so the surface is not consistently oriented`,
      count: flipped,
    });
  }

  // Only on a closed, consistent mesh: signed volume is meaningless on an open shell.
  if (!open && !overused && !flipped && !repeated && !nonFinite && idx.count >= 3 && volume6 < 0) {
    issues.push({
      kind: 'inside-out',
      detail: `the surface is closed and consistently wound but faces INWARD (signed volume ${(volume6 / 6).toExponential(2)})`,
    });
  }

  return issues;
}

export function meshTolerances(geo: THREE.BufferGeometry): { weld: number; area: number } {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const diag = box ? box.min.distanceTo(box.max) : 1;
  const scale = Number.isFinite(diag) && diag > 0 ? Math.min(1, diag) : 1;
  const weld = 1e-6 * scale;
  return { weld, area: weld * weld };
}
