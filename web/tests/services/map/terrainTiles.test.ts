import { describe, it, expect } from 'vitest';
import {
  decodeTerrarium,
  sampleTerrain,
  terrainHeightAt,
  terrainLayout,
  terrariumMeters,
  type TerrainField,
} from '../../../src/services/map/terrainTiles';
import { TILE_SIZE } from '../../../src/services/map/slippyMap';

describe('terrariumMeters', () => {
  it('decodes sea level and a known height', () => {
    expect(terrariumMeters(128, 0, 0)).toBe(0);
    // 1000 m: 33768 = 131 * 256 + 232.
    expect(terrariumMeters(131, 232, 0)).toBe(1000);
    expect(terrariumMeters(131, 232, 128)).toBe(1000.5);
  });

  it('reads each pixel from its RGBA quad', () => {
    const rgba = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
    rgba.set([131, 232, 0, 255], 4);
    const out = decodeTerrarium(rgba);
    expect(out[0]).toBe(-32768);
    expect(out[1]).toBe(1000);
  });
});

// Every tile the same tilt: up 1 m a pixel to the east, so heights rise east of the pad.
function tiltedTiles(layout: ReturnType<typeof terrainLayout>) {
  const tiles = new Map<string, Float32Array>();
  for (const ref of layout.refs) {
    const h = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) h[y * TILE_SIZE + x] = 500 + ref.left + x;
    tiles.set(ref.key, h);
  }
  return tiles;
}

describe('sampleTerrain', () => {
  const layout = terrainLayout(40, -105, 2000);

  it('asks for a few tiles, not hundreds', () => {
    expect(layout.refs.length).toBeGreaterThan(0);
    expect(layout.refs.length).toBeLessThanOrEqual(9);
  });

  it('measures from the pad, and keeps east as east', () => {
    const field = sampleTerrain(layout, tiltedTiles(layout), 2000, 21);
    expect(field).not.toBeNull();
    if (!field) return;
    expect(terrainHeightAt(field, 0, 0)).toBeCloseTo(0, 6);
    expect(terrainHeightAt(field, 1000, 0)).toBeGreaterThan(0);
    expect(terrainHeightAt(field, -1000, 0)).toBeLessThan(0);
    // Level north and south: the tilt is east only.
    expect(Math.abs(terrainHeightAt(field, 0, 1000))).toBeLessThan(2);
  });

  it('finds a tile for every point, wherever the square falls on the tile grid', () => {
    for (const lat of [-33.9, 0.1, 35.35, 40, 61.2])
      for (const lon of [-117.8, -105, 2.3, 151.2])
        for (const w of [50, 137, 600, 1234, 2000, 7500]) {
          const l = terrainLayout(lat, lon, w);
          expect(sampleTerrain(l, tiltedTiles(l), w, 21), `${lat}, ${lon}, ${w}`).not.toBeNull();
        }
  });

  // The far edges can fall in the last pixel before a tile boundary, which the tile picker leaves out.
  it('finds a tile for the far edges at every fine step of the site', () => {
    const flat = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let k = 0; k < 4000; k++) {
      const lon = -105 + k * 1e-6 * 7;
      const lat = 40 + k * 1e-6 * 3;
      const l = terrainLayout(lat, lon, 137);
      const tiles = new Map(l.refs.map((r) => [r.key, flat]));
      expect(sampleTerrain(l, tiles, 137, 3), `${lat}, ${lon}`).not.toBeNull();
    }
  });

  it('gives null with a tile missing', () => {
    const tiles = tiltedTiles(layout);
    tiles.delete(layout.refs[0]!.key);
    expect(sampleTerrain(layout, tiles, 2000, 21)).toBeNull();
  });
});

describe('terrainHeightAt', () => {
  // 3 by 3 over ±100 m: 0 in the west column, 10 in the middle, 20 in the east.
  const field: TerrainField = { halfWidthM: 100, n: 3, heights: new Float32Array([0, 10, 20, 0, 10, 20, 0, 10, 20]) };

  it('interpolates between samples', () => {
    expect(terrainHeightAt(field, 50, 0)).toBeCloseTo(15);
    expect(terrainHeightAt(field, -50, 30)).toBeCloseTo(5);
  });

  it('holds the edge past the square', () => {
    expect(terrainHeightAt(field, 500, 0)).toBeCloseTo(20);
    expect(terrainHeightAt(field, -500, -500)).toBeCloseTo(0);
  });
});
