import { fetchElevations, type FetchOpts } from '../weather/openMeteo';
import { offsetToLatLon, reduceLonDeg } from '../map/geodesy';

export interface TerrainGrid {
  south: number;
  west: number;
  north: number;
  east: number;
  n: number;
  // Meters above sea level, row by row from the south, west to east in each.
  heights: number[];
}

export const TERRAIN_POINTS = 15;

// Across the date line the east edge is carried past 180 so longitudes run east without a break.
export function terrainBounds(latDeg: number, lonDeg: number, halfWidthM: number) {
  const ne = offsetToLatLon(latDeg, lonDeg, { east: halfWidthM, north: halfWidthM });
  const sw = offsetToLatLon(latDeg, lonDeg, { east: -halfWidthM, north: -halfWidthM });
  return { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon < sw.lon ? ne.lon + 360 : ne.lon };
}

export function terrainPoints(b: ReturnType<typeof terrainBounds>, n = TERRAIN_POINTS) {
  const out: { latitudeDeg: number; longitudeDeg: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      out.push({
        latitudeDeg: b.south + ((b.north - b.south) * i) / (n - 1),
        longitudeDeg: reduceLonDeg(b.west + ((b.east - b.west) * j) / (n - 1)),
      });
    }
  }
  return out;
}

export function groundAt(grid: TerrainGrid): (latDeg: number, lonDeg: number) => number {
  const { south, west, north, east, n, heights } = grid;
  const at = (i: number, j: number) => heights[i * n + j]!;
  // The grid's east edge may lie past 180, so move by whole turns to the nearest.
  const mid = (west + east) / 2;
  return (lat, lonDeg) => {
    const lon = mid + reduceLonDeg(lonDeg - mid);
    const fi = Math.min(n - 1, Math.max(0, ((lat - south) / (north - south)) * (n - 1)));
    const fj = Math.min(n - 1, Math.max(0, ((lon - west) / (east - west)) * (n - 1)));
    const i0 = Math.min(n - 2, Math.floor(fi));
    const j0 = Math.min(n - 2, Math.floor(fj));
    const ti = fi - i0;
    const tj = fj - j0;
    const south0 = at(i0, j0) * (1 - tj) + at(i0, j0 + 1) * tj;
    const north0 = at(i0 + 1, j0) * (1 - tj) + at(i0 + 1, j0 + 1) * tj;
    return south0 * (1 - ti) + north0 * ti;
  };
}

export async function fetchTerrain(
  latDeg: number,
  lonDeg: number,
  halfWidthM: number,
  apiKey: string | undefined,
  o: FetchOpts = {},
): Promise<TerrainGrid> {
  const b = terrainBounds(latDeg, lonDeg, halfWidthM);
  const heights = await fetchElevations(terrainPoints(b), apiKey, o);
  return { ...b, n: TERRAIN_POINTS, heights };
}
