import * as THREE from 'three';
import {
  TILE_SIZE,
  TILE_SOURCES,
  metersPerPixel,
  visibleTiles,
  zoomForMetersPerPixel,
  type TileSourceId,
} from '../../services/map/slippyMap';
import type { GroundQuad } from './FlightGroundMap';

const GROUND_TEX_PX = 512;

// Pixel y grows south while `north` grows north; a sign error still looks like a plausible map.
export function groundMapLayout(
  latitudeDeg: number,
  longitudeDeg: number,
  radiusM: number,
  unitsPerMeter: number,
  source: TileSourceId,
  key?: string,
): { quad: number; refs: GroundQuad[] } {
  const tiles = TILE_SOURCES[source];
  const sideM = radiusM * 2;
  const zoom = zoomForMetersPerPixel(latitudeDeg, sideM / GROUND_TEX_PX, tiles.maxZoom);
  const mpp = metersPerPixel(latitudeDeg, zoom);
  const sidePx = sideM / mpp;
  const half = sidePx / 2;
  return {
    quad: TILE_SIZE * mpp * unitsPerMeter,
    refs: visibleTiles(latitudeDeg, longitudeDeg, zoom, sidePx, sidePx).map((tile) => ({
      ...tile,
      url: tiles.url(tile.z, tile.x, tile.y, key),
      east: (tile.left + TILE_SIZE / 2 - half) * mpp * unitsPerMeter,
      north: (half - (tile.top + TILE_SIZE / 2)) * mpp * unitsPerMeter,
    })),
  };
}

// Lays a quad flat: its +y becomes -z (north).
export const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

// flipY must stay true: off, the map mirrors north for south and still looks plausible.
export function configureTileTexture(tex: THREE.Texture): void {
  tex.flipY = true;
}
