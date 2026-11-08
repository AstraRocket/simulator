import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { makeWatertight } from './solidMesh';

// STL and OBJ are unitless and scaled to millimeters; GLB stays in meters, glTF's unit.
export const STL_MIME = 'model/stl';
export const OBJ_MIME = 'model/obj';
export const GLB_MIME = 'model/gltf-binary';

import { M_TO_MM } from '../../prefs/units';
import { UNKNOWN_PART_COLOR } from '../design/partColors';
import { toError } from '../app/errorMessage';

/** `scale` is units per meter. */
function meshGroup(geometry: THREE.BufferGeometry, scale = M_TO_MM): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(makeWatertight(geometry), new THREE.MeshStandardMaterial({ color: UNKNOWN_PART_COLOR })));
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true); // exporters read matrixWorld
  return group;
}

export function solidToStl(geometry: THREE.BufferGeometry): ArrayBuffer {
  const dv = new STLExporter().parse(meshGroup(geometry), { binary: true }) as unknown as DataView;
  return dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength) as ArrayBuffer;
}

export function solidToObj(geometry: THREE.BufferGeometry): string {
  return new OBJExporter().parse(meshGroup(geometry));
}

export function solidToGlb(geometry: THREE.BufferGeometry): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      meshGroup(geometry, 1),
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(toError(err)),
      { binary: true },
    );
  });
}
