import * as THREE from 'three';
import { piecesBounds, type Piece } from './rocketPieces';

/** `isEmpty()` alone passes a NaN box (NaN comparisons are false), giving a blank export. */
export function isFittableBox(box: THREE.Box3): boolean {
  return (
    !box.isEmpty() &&
    [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every((v) => Number.isFinite(v))
  );
}

const FIT_MARGIN = 1.06;
const MIN_FIT_DIST = 1e-3;

/** `direction` is camera to subject; `aspect` is the export aspect, not the on-screen one. */
export function fitCameraToBox(
  box: THREE.Box3,
  direction: THREE.Vector3,
  fovDeg: number,
  aspect: number,
  margin: number = FIT_MARGIN,
  up: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const target = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);

  const back = new THREE.Vector3().copy(direction).negate();
  if (!Number.isFinite(back.lengthSq()) || back.lengthSq() === 0) back.set(0, 0, 1);
  back.normalize();
  const upv = new THREE.Vector3().copy(up);
  if (!Number.isFinite(upv.lengthSq()) || upv.lengthSq() === 0) upv.set(0, 1, 0);
  // View parallel to `up`: mirror Matrix4.lookAt's 1e-4 nudge of z exactly, or the fit basis turns 90°.
  const right = new THREE.Vector3().crossVectors(upv, back);
  if (right.lengthSq() === 0) {
    if (Math.abs(upv.z) === 1) back.x += 1e-4;
    else back.z += 1e-4;
    back.normalize();
    right.crossVectors(upv, back);
  }
  right.normalize();
  const trueUp = new THREE.Vector3().crossVectors(back, right).normalize();

  const extent = (a: THREE.Vector3) => Math.abs(half.x * a.x) + Math.abs(half.y * a.y) + Math.abs(half.z * a.z);

  const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360);
  const m = Number.isFinite(margin) && margin > 0 ? margin : 1;
  // Fit per corner: summing the separate maxima under-fills stubby subjects.
  const rel = new THREE.Vector3();
  let raw = 0;
  for (let i = 0; i < 8; i++) {
    // Via `half`, not min/max: an empty Box3 has ±Infinity extremes but zero size.
    rel.set(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z);
    const u = rel.dot(right),
      v = rel.dot(trueUp),
      w = rel.dot(back);
    raw = Math.max(raw, Math.max((m * Math.abs(u)) / (tanHalfFov * aspect), (m * Math.abs(v)) / tanHalfFov) + w);
  }
  const dist = Number.isFinite(raw) && raw > 0 ? raw : Math.max(extent(back), MIN_FIT_DIST);

  return { position: new THREE.Vector3().copy(target).addScaledVector(back, dist), target };
}

export function exportCamera(box: THREE.Box3, src: THREE.PerspectiveCamera, aspect: number): THREE.PerspectiveCamera {
  const { position, target } = fitCameraToBox(
    box,
    src.getWorldDirection(new THREE.Vector3()),
    src.fov,
    aspect,
    FIT_MARGIN,
    src.up,
  );
  const cam = new THREE.PerspectiveCamera(src.fov, aspect);
  cam.up.copy(src.up);
  cam.position.copy(position);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  // A small rocket's fit lands inside the live 0.1 m near plane.
  const view = box.clone().applyMatrix4(cam.matrixWorldInverse);
  cam.near = Math.max(1e-4, -view.max.z * 0.9);
  cam.far = Math.max(cam.near * 16, -view.min.z * 1.1);
  cam.updateProjectionMatrix();
  return cam;
}

export function exportView(live: THREE.Camera, pieces: Piece[], fit: boolean, aspect: number): THREE.Camera {
  const src = live as THREE.PerspectiveCamera;
  const box = fit && src.isPerspectiveCamera ? piecesBounds(pieces) : null;
  return box && isFittableBox(box) ? exportCamera(box, src, aspect) : live;
}
