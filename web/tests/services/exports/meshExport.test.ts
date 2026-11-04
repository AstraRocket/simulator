// @vitest-environment jsdom
// GLTFExporter's binary path uses FileReader/Blob, so this suite needs a DOM.
import { describe, it, expect } from 'vitest';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { solidForNode } from '../../../src/services/exports/solidMesh';
import { solidToObj, solidToStl, solidToGlb } from '../../../src/services/exports/meshExport';

const nose = solidForNode({
  type: 'nosecone',
  shape: 'ogive',
  length: 0.1,
  aftRadius: 0.013,
  thickness: 0.002,
} as unknown as ComponentNode)!;

describe('component mesh export', () => {
  it('OBJ has vertices and faces', () => {
    const obj = solidToObj(nose);
    expect(obj).toMatch(/^v /m);
    expect(obj).toMatch(/^f /m);
  });

  it('OBJ is scaled to millimeters, as the STL is', () => {
    const xs = [...solidToObj(nose).matchAll(/^v (\S+)/gm)].map((m) => Number(m[1]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 1);
  });

  it('STL is a valid binary blob with a matching triangle count', () => {
    const buf = solidToStl(nose);
    const count = new DataView(buf).getUint32(80, true);
    expect(buf.byteLength).toBe(84 + count * 50);
    expect(count).toBeGreaterThan(20);
  });

  it('STL is watertight (no holes) and scaled to millimeters', () => {
    const dv = new DataView(solidToStl(nose));
    const n = dv.getUint32(80, true);
    const edges = new Map<string, number>();
    let minX = Infinity,
      maxX = -Infinity;
    const key = (p: number[]) => p.map((c) => c.toFixed(3)).join(',');
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      const v: number[][] = [];
      for (let k = 0; k < 3; k++) {
        const b = o + k * 12;
        const x = dv.getFloat32(b, true);
        v.push([x, dv.getFloat32(b + 4, true), dv.getFloat32(b + 8, true)]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      for (let e = 0; e < 3; e++) {
        const a = key(v[e]!),
          b = key(v[(e + 1) % 3]!);
        const kk = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(kk, (edges.get(kk) ?? 0) + 1);
      }
    }
    let holes = 0;
    for (const c of edges.values()) if (c === 1) holes++;
    expect(holes).toBe(0);
    expect(maxX - minX).toBeGreaterThan(50);
  });

  it('GLB starts with the glTF magic', async () => {
    const buf = await solidToGlb(nose);
    expect(new DataView(buf).getUint32(0, true)).toBe(0x46546c67); // 'glTF'
  });

  it('GLB is in meters, as glTF requires', async () => {
    const dv = new DataView(await solidToGlb(nose));
    const length = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(dv.buffer, dv.byteOffset + 20, length))) as {
      nodes: { scale?: number[]; matrix?: number[]; mesh?: number; children?: number[] }[];
      meshes: { primitives: { attributes: { POSITION: number } }[] }[];
      accessors: { min: number[]; max: number[] }[];
    };
    // GLTFExporter writes `scale`, or a `matrix` whose first entry is the x scale.
    let scale = 1;
    let node = json.nodes[0]!;
    for (;;) {
      scale *= node.scale?.[0] ?? node.matrix?.[0] ?? 1;
      if (node.mesh !== undefined) break;
      node = json.nodes[node.children![0]!]!;
    }
    const pos = json.accessors[json.meshes[node.mesh]!.primitives[0]!.attributes.POSITION]!;
    expect((pos.max[0]! - pos.min[0]!) * scale).toBeCloseTo(0.1, 3);
  });
});
