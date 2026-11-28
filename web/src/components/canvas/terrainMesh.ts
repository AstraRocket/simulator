import * as THREE from 'three';
import { terrainHeightAt, type TerrainField } from '../../services/map/terrainTiles';

// Cells a side of one map tile draped over the ground.
export const TILE_SEGMENTS = 32;

// The scene's key light, in the plane's frame (east, north, up): it shines from the south-east, high.
const LIGHT = new THREE.Vector3(14, -16, 26).normalize();
const DARKEST = 0.45;

/**
 * A square laid as GROUND_ROTATION lays a quad (local +x east, +y north, +z up), its points raised to the ground.
 * `size` and the center are in scene units from the pad. Its vertex colors shade the slopes: level ground keeps
 * the map's own colors, as the flat map shows them, and a slope turned from the light darkens.
 */
export function terrainPlane(
  field: TerrainField,
  size: number,
  segments: number,
  centerEast: number,
  centerNorth: number,
  unitsPerMeter: number,
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const at = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < at.count; i++) {
    const east = (centerEast + at.getX(i)) / unitsPerMeter;
    const north = (centerNorth + at.getY(i)) / unitsPerMeter;
    at.setZ(i, terrainHeightAt(field, east, north) * unitsPerMeter);
  }
  at.needsUpdate = true;
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const shade = new Float32Array(at.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < at.count; i++) {
    n.fromBufferAttribute(normals, i);
    const s = THREE.MathUtils.clamp(n.dot(LIGHT) / LIGHT.z, DARKEST, 1);
    shade.set([s, s, s], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  return geometry;
}
