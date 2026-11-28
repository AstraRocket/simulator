import { TILE_SIZE, metersPerPixel, visibleTiles, zoomForMetersPerPixel, type TileRef } from './slippyMap';

// Mapzen's Terrarium tiles on AWS Open Data: no key, CORS open, on the imagery's z/x/y grid.
export const TERRAIN_MAX_ZOOM = 15;

export const terrainTileUrl = (z: number, x: number, y: number): string =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// cspell:ignore Terrarium Mapzen GMTED
export const TERRAIN_ATTRIBUTION = 'Elevation: Mapzen Terrain Tiles on AWS (SRTM, USGS 3DEP, GMTED and others)';

// Grid points a side: 96 cells, finer than the source over any flight's ground.
export const TERRAIN_SAMPLES = 97;

// Pixels across the ground the tiles are picked for: a few tiles, never hundreds.
const TERRAIN_SIDE_PX = 512;

/** Meters above sea level from one Terrarium pixel. */
export const terrariumMeters = (r: number, g: number, b: number): number => r * 256 + g + b / 256 - 32768;

export interface TerrainLayout {
  zoom: number;
  mpp: number;
  sidePx: number;
  refs: (TileRef & { url: string })[];
}

export function terrainLayout(latitudeDeg: number, longitudeDeg: number, halfWidthM: number): TerrainLayout {
  const sideM = halfWidthM * 2;
  const zoom = zoomForMetersPerPixel(latitudeDeg, sideM / TERRAIN_SIDE_PX, TERRAIN_MAX_ZOOM);
  const mpp = metersPerPixel(latitudeDeg, zoom);
  const sidePx = sideM / mpp;
  return {
    zoom,
    mpp,
    sidePx,
    refs: visibleTiles(latitudeDeg, longitudeDeg, zoom, sidePx, sidePx).map((tile) => ({
      ...tile,
      url: terrainTileUrl(tile.z, tile.x, tile.y),
    })),
  };
}

/** Heights from one decoded tile, TILE_SIZE squared, row by row from the top. */
export function decodeTerrarium(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let i = 0; i < out.length; i++) out[i] = terrariumMeters(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
  return out;
}

/** A square of ground centered on the pad, heights in meters above the pad. */
export interface TerrainField {
  halfWidthM: number;
  n: number;
  // Row by row from the south, west to east in each.
  heights: Float32Array;
}

/** Null when a tile the square needs is missing. */
export function sampleTerrain(
  layout: TerrainLayout,
  tiles: ReadonlyMap<string, Float32Array>,
  halfWidthM: number,
  n = TERRAIN_SAMPLES,
): TerrainField | null {
  const half = layout.sidePx / 2;
  const at = (px: number, py: number): number | null => {
    const ref = layout.refs.find(
      (r) => px >= r.left && px < r.left + TILE_SIZE && py >= r.top && py < r.top + TILE_SIZE,
    );
    const tile = ref && tiles.get(ref.key);
    if (!ref || !tile) return null;
    const x = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(px - ref.left)));
    const y = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(py - ref.top)));
    return tile[y * TILE_SIZE + x]!;
  };
  // A pixel inside the square: `visibleTiles` covers up to its last whole pixel, not its far edge.
  const inside = (p: number) => Math.min(Math.max(0, layout.sidePx - 1), Math.max(0, p));
  const toPx = (east: number, north: number) => ({
    px: inside(half + east / layout.mpp),
    py: inside(half - north / layout.mpp),
  });
  const pad = at(half, half);
  if (pad == null) return null;
  const heights = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const north = -halfWidthM + (2 * halfWidthM * i) / (n - 1);
    for (let j = 0; j < n; j++) {
      const east = -halfWidthM + (2 * halfWidthM * j) / (n - 1);
      const { px, py } = toPx(east, north);
      const h = at(px, py);
      if (h == null) return null;
      heights[i * n + j] = h - pad;
    }
  }
  return { halfWidthM, n, heights };
}

/** Heights times `scale`, for drawing the ground taller than it is. */
export const scaleTerrain = (field: TerrainField, scale: number): TerrainField =>
  scale === 1 ? field : { ...field, heights: field.heights.map((h) => h * scale) };

/** Meters above the pad at a point east and north of it, bilinear, held at the edge past it. */
export function terrainHeightAt(field: TerrainField, east: number, north: number): number {
  const { halfWidthM: w, n, heights } = field;
  const fj = Math.min(n - 1, Math.max(0, ((east + w) / (2 * w)) * (n - 1)));
  const fi = Math.min(n - 1, Math.max(0, ((north + w) / (2 * w)) * (n - 1)));
  const i0 = Math.min(n - 2, Math.floor(fi));
  const j0 = Math.min(n - 2, Math.floor(fj));
  const ti = fi - i0;
  const tj = fj - j0;
  const h = (i: number, j: number) => heights[i * n + j]!;
  const south = h(i0, j0) * (1 - tj) + h(i0, j0 + 1) * tj;
  const north0 = h(i0 + 1, j0) * (1 - tj) + h(i0 + 1, j0 + 1) * tj;
  return south * (1 - ti) + north0 * ti;
}
