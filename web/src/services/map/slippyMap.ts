import i18n from '../../i18n';
import { fmtNum } from '../../i18n/format';
import { degToRad, radToDeg } from '../../prefs/units';
import { roundTo } from '../app/numbers';
import { reduceLonDeg } from './geodesy';

const COORD_PLACES = 4;

export const roundCoord = (deg: number): number => roundTo(deg, COORD_PLACES);

export const TILE_SIZE = 256;

// atan(sinh(pi)).
export const MAX_LAT = 85.051129;

export type TileSourceId = 'satellite' | 'street';

export interface TileSource {
  id: TileSourceId;
  maxZoom: number;
  url(z: number, x: number, y: number, key?: string): string;
  attribution: string;
}

// Not tile.openstreetmap.org: OSM's tile policy bars third-party apps (403s).
// Esri paths are {z}/{y}/{x}; attributions are each service's `copyrightText` verbatim, as the terms require.
// cspell:ignore Intermap METI NGCC
const ESRI = (service: string) => (z: number, x: number, y: number, key?: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/${z}/${y}/${x}` +
  (key ? `?token=${encodeURIComponent(key)}` : '');

export const TILE_SOURCES: Record<TileSourceId, TileSource> = {
  satellite: {
    id: 'satellite',
    maxZoom: 19,
    url: ESRI('World_Imagery'),
    attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
  },
  street: {
    id: 'street',
    maxZoom: 19,
    url: ESRI('World_Street_Map'),
    attribution:
      'Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), ' +
      'Esri Korea, Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community',
  },
};

export const MIN_ZOOM = 1;

export function lonToTileX(lonDeg: number, zoom: number): number {
  return ((lonDeg + 180) / 360) * 2 ** zoom;
}

export function latToTileY(latDeg: number, zoom: number): number {
  const lat = degToRad(Math.max(-MAX_LAT, Math.min(MAX_LAT, latDeg)));
  return ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * 2 ** zoom;
}

export function tileXToLon(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** zoom);
  return radToDeg(Math.atan(Math.sinh(n)));
}

export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

// `dy` is pixels south.
export function panView(v: MapView, dx: number, dy: number): MapView {
  const cx = lonToTileX(v.lon, v.zoom) + dx / TILE_SIZE;
  const cy = Math.max(0, Math.min(2 ** v.zoom, latToTileY(v.lat, v.zoom) + dy / TILE_SIZE));
  return { lat: tileYToLat(cy, v.zoom), lon: reduceLonDeg(tileXToLon(cx, v.zoom)), zoom: v.zoom };
}

export function wrapTileX(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return ((x % n) + n) % n;
}

export function metersPerPixel(latDeg: number, zoom: number): number {
  const EARTH_CIRCUMFERENCE_M = 40075016.686;
  return (EARTH_CIRCUMFERENCE_M * Math.cos(degToRad(latDeg))) / (TILE_SIZE * 2 ** zoom);
}

// A hemisphere letter rather than a sign: a dropped minus is the error the site map exists to catch.
export function formatLat(latDeg: number, places = COORD_PLACES): string {
  return `${fmtNum(Math.abs(latDeg), places)}° ${latHemisphere(latDeg)}`;
}

export function formatLon(lonDeg: number, places = COORD_PLACES): string {
  return `${fmtNum(Math.abs(lonDeg), places)}° ${lonHemisphere(lonDeg)}`;
}

export const latHemisphere = (latDeg: number): string => i18n.t(latDeg < 0 ? 'map.hemisphereS' : 'map.hemisphereN');

export const lonHemisphere = (lonDeg: number): string => i18n.t(lonDeg < 0 ? 'map.hemisphereW' : 'map.hemisphereE');

export function formatCoord(latDeg: number, lonDeg: number, places = COORD_PLACES): string {
  return `${formatLat(latDeg, places)}, ${formatLon(lonDeg, places)}`;
}

export interface TileRef {
  key: string;
  x: number;
  y: number;
  z: number;
  // CSS pixels from the viewport's top-left.
  left: number;
  top: number;
}

// Rows outside [0, 2^zoom) are dropped, not wrapped; columns wrap.
export function visibleTiles(
  centerLat: number,
  centerLon: number,
  zoom: number,
  width: number,
  height: number,
): TileRef[] {
  const n = 2 ** zoom;
  const cx = lonToTileX(centerLon, zoom);
  const cy = latToTileY(centerLat, zoom);
  const originX = cx * TILE_SIZE - width / 2;
  const originY = cy * TILE_SIZE - height / 2;

  const first = { x: Math.floor(originX / TILE_SIZE), y: Math.floor(originY / TILE_SIZE) };
  const last = {
    x: Math.floor((originX + width - 1) / TILE_SIZE),
    y: Math.floor((originY + height - 1) / TILE_SIZE),
  };

  const out: TileRef[] = [];
  for (let ty = first.y; ty <= last.y; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = first.x; tx <= last.x; tx++) {
      const wrapped = wrapTileX(tx, zoom);
      out.push({
        // Unwrapped column: the same tile can show twice and React must not merge them.
        key: `${zoom}/${tx}/${ty}`,
        x: wrapped,
        y: ty,
        z: zoom,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }
  return out;
}

export function project(
  latDeg: number,
  lonDeg: number,
  centerLat: number,
  centerLon: number,
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const n = 2 ** zoom;
  let dx = (lonToTileX(lonDeg, zoom) - lonToTileX(centerLon, zoom)) * TILE_SIZE;
  // The short way around: 179°E seen from 179°W is one degree away, not 358.
  const worldWidth = n * TILE_SIZE;
  if (dx > worldWidth / 2) dx -= worldWidth;
  if (dx < -worldWidth / 2) dx += worldWidth;
  const dy = (latToTileY(latDeg, zoom) - latToTileY(centerLat, zoom)) * TILE_SIZE;
  return { x: width / 2 + dx, y: height / 2 + dy };
}

export function unproject(
  x: number,
  y: number,
  centerLat: number,
  centerLon: number,
  zoom: number,
  width: number,
  height: number,
): { latitudeDeg: number; longitudeDeg: number } {
  const tx = lonToTileX(centerLon, zoom) + (x - width / 2) / TILE_SIZE;
  const ty = latToTileY(centerLat, zoom) + (y - height / 2) / TILE_SIZE;
  return {
    latitudeDeg: tileYToLat(ty, zoom),
    longitudeDeg: reduceLonDeg(tileXToLon(tx, zoom)),
  };
}

export const SITE_ZOOM = 15;

// Nearest zoom in log space, not the next one up (which can need 4x the tiles); the caller scales by the leftover.
export function zoomForMetersPerPixel(latDeg: number, target: number, maxZoom: number): number {
  if (!(target > 0)) return maxZoom;
  const z = Math.round(Math.log2(metersPerPixel(latDeg, 0) / target));
  return Math.max(MIN_ZOOM, Math.min(maxZoom, z));
}

/** Degrees with the hemisphere letter: a dropped minus is the slip the letter catches. */
export const latLonUnit = (key: 'latitudeDeg' | 'longitudeDeg', value: number | null | undefined): string =>
  value == null ? '°' : `° ${key === 'latitudeDeg' ? latHemisphere(value) : lonHemisphere(value)}`;
