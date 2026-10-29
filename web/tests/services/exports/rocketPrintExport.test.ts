// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { downloadRocket3mf, solidFor } from '../../../src/services/exports/rocketPrintExport';
import { makeWatertight } from '../../../src/services/exports/solidMesh';
import * as saveFile from '../../../src/services/files/saveFile';
import type { RocketTree } from '../../../src/engine/openRocketEngine';

const tree = {
  name: 'Bertha',
  components: [
    {
      type: 'stage',
      id: 's',
      children: [{ type: 'bodytube', id: 'b', name: 'Body', length: 0.2, outerRadius: 0.0125, thickness: 0.0005 }],
    },
  ],
} as unknown as RocketTree;

afterEach(() => vi.restoreAllMocks());

/**
 * The whole-rocket print file is named the way every export is: rocket, then
 * what the file is. A bare "Bertha.3mf" says which rocket and not which document.
 */
describe('downloadRocket3mf', () => {
  it('names the single file rocket plus what it is', async () => {
    const spy = vi.spyOn(saveFile, 'saveBlob').mockResolvedValue(undefined as never);
    await downloadRocket3mf('Bertha', tree);
    expect(spy.mock.calls[0]![1]).toBe('Bertha-print.3mf');
  });

  /**
   * A part name comes from the design, which can be a shared `.ork`. A name
   * with no letter or digit must not become a zip entry as written: `../..`
   * points outside the folder it is extracted into, and `:` or `*` fails the
   * whole archive on Windows.
   */
  it('names a separate file safely when the part name has no letter or digit', async () => {
    const odd = {
      ...tree,
      components: [
        {
          type: 'stage',
          id: 's',
          children: [
            { type: 'bodytube', id: 'b1', name: '../..', length: 0.2, outerRadius: 0.0125, thickness: 0.0005 },
            { type: 'bodytube', id: 'b2', name: ':*', length: 0.2, outerRadius: 0.0125, thickness: 0.0005 },
          ],
        },
      ],
    } as unknown as RocketTree;
    const spy = vi.spyOn(saveFile, 'saveBlob').mockResolvedValue(undefined as never);
    await downloadRocket3mf('Bertha', odd, { separateFiles: true });
    const zip = new Uint8Array(await (spy.mock.calls[0]![0] as Blob).arrayBuffer());
    const names = Object.keys(unzipSync(zip));
    expect(names).toHaveLength(2);
    for (const name of names) expect(name).toMatch(/^[a-z0-9._-]+\.3mf$/i);
    for (const name of names) expect(name).not.toMatch(/^\.\./);
  });
});

/**
 * The printed ring around a cluster has the same holes the DXF cut sheet
 * draws: one per tube, even where touching tubes leave the holes touching.
 */
describe('solidFor on a ring around a cluster', () => {
  it('builds a ring with a hole per tube', () => {
    const cluster = {
      name: 'Cluster',
      components: [
        {
          type: 'stage',
          children: [
            {
              type: 'bodytube',
              id: 'body',
              length: 0.3,
              outerRadius: 0.04,
              thickness: 0.001,
              children: [
                { type: 'centeringring', id: 'cr', length: 0.003 },
                { type: 'innertube', id: 'mount', outerRadius: 0.01, length: 0.07, cluster: '3-ring' },
              ],
            },
          ],
        },
      ],
    } as unknown as RocketTree;
    const ring = cluster.components[0]!.children![0]!.children![0]!;
    const geo = solidFor(cluster, ring)!;
    expect(geo).not.toBeNull();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(0.003, 6);
    expect(box.max.y).toBeCloseTo(0.039, 4);
    // Each tube's hole: a rim of vertices exactly a tube radius round where the
    // kernel puts it, and none inside it.
    const pos = geo.getAttribute('position');
    const d = 0.02 / Math.sqrt(3);
    for (const dir of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3]) {
      const y = d * Math.cos(dir);
      const z = d * Math.sin(dir);
      let rim = 0;
      let inside = 0;
      for (let i = 0; i < pos.count; i++) {
        const gap = Math.hypot(pos.getY(i) - y, pos.getZ(i) - z);
        if (Math.abs(gap - 0.01) < 1e-6) rim++;
        else if (gap < 0.01) inside++;
      }
      expect(rim).toBeGreaterThan(50);
      expect(inside).toBe(0);
    }
    // The solid still exports.
    expect(() => makeWatertight(geo)).not.toThrow();
  });
});
