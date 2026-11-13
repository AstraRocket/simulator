import type { GroundPoint } from '../flight/groundTrack';
import { degToRad, radToDeg } from '../../prefs/units';

// The WorldCoordinate constant; differs from ISA_EARTH_RADIUS_M on purpose.
export const KERNEL_EARTH_RADIUS_M = 6371000;

// `ExtendedISAModel`'s reference Earth radius.
export const ISA_EARTH_RADIUS_M = 6356766;

export const geometricFromGeopotential = (z: number): number => (ISA_EARTH_RADIUS_M * z) / (ISA_EARTH_RADIUS_M - z);

// Port of the kernel's SPHERICAL GeodeticComputationStrategy.addCoordinate.
export function offsetToLatLon(latDeg: number, lonDeg: number, p: GroundPoint): { lat: number; lon: number } {
  const d = Math.hypot(p.east, p.north);
  const site = worldCoordinate(latDeg, lonDeg);
  if (d === 0) return site;
  const bearing = Math.atan2(p.east, p.north);
  const lat0 = degToRad(site.lat);
  const lon0 = degToRad(site.lon);
  const sinLat = Math.sin(lat0);
  const cosLat = Math.cos(lat0);
  const sinDR = Math.sin(d / KERNEL_EARTH_RADIUS_M);
  const cosDR = Math.cos(d / KERNEL_EARTH_RADIUS_M);
  const lat = Math.asin(sinLat * cosDR + cosLat * sinDR * Math.cos(bearing));
  const lon = lon0 + Math.atan2(Math.sin(bearing) * sinDR * cosLat, cosDR - sinLat * Math.sin(lat));
  return worldCoordinate(radToDeg(lat), radToDeg(lon));
}

// Java's Math.rint: ties go to even, where Math.round sends them up.
function rint(x: number): number {
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

// As the WorldCoordinate constructor stores them.
function worldCoordinate(latDeg: number, lonDeg: number): { lat: number; lon: number } {
  return { lat: Math.min(90, Math.max(-90, latDeg)), lon: reduceLonDeg(lonDeg) };
}

// As MathUtil.reducePi does.
export function reduceLonDeg(lonDeg: number): number {
  return lonDeg - rint(lonDeg / 360) * 360;
}

export const isLatLon = (latDeg: number, lonDeg: number): boolean =>
  Number.isFinite(latDeg) && Number.isFinite(lonDeg) && Math.abs(latDeg) <= 90 && Math.abs(lonDeg) <= 180;
