import * as THREE from 'three';
import type { Look, LookDecal } from '../../services/design/appearance';
import { isSurfaced, type Piece } from './rocketPieces';
import { surfacesOf } from './lookSurfaces';
import { decalImage, decalMaterialProps, decalTexture } from './decalTexture';

// The finished rocket as plain three.js, for the images drawn away from the live view: a saved `.ork`'s preview and
// thumbnail, and Photo Studio.

const REFLECTIVITY = 0.2;

/**
 * Each decal look's texture, decoded up front, as sRGB for a lit render and as its stored bytes for an unencoded
 * layer. One this browser no longer holds is drawn as bare paint.
 */
export type DecalTextures = Map<LookDecal, { lit: THREE.Texture; raw: THREE.Texture }>;

export async function decalsFor(pieces: readonly Piece[], made: THREE.Texture[]): Promise<DecalTextures> {
  const out: DecalTextures = new Map();
  for (const p of pieces) {
    for (const [, look] of surfacesOf(p, 'finished')) {
      const d = look.decal;
      if (!d?.decal.hash || out.has(d)) continue;
      const img = await decalImage(d.decal.hash);
      if (!img) continue;
      const lit = decalTexture(img, d);
      const raw = decalTexture(img, d);
      raw.colorSpace = THREE.NoColorSpace;
      made.push(lit, raw);
      out.set(d, { lit, raw });
    }
  }
  return out;
}

/** The material with the look's decal laid over it. */
export function withDecal<M extends THREE.Material & { map: THREE.Texture | null }>(
  m: M,
  look: Look,
  decals: DecalTextures,
  space: 'lit' | 'raw',
): M {
  const props = decalMaterialProps(look.decal, look.decal ? (decals.get(look.decal)?.[space] ?? null) : null);
  if (!props.map) return m;
  m.map = props.map;
  m.onBeforeCompile = props.onBeforeCompile;
  m.defines = { ...m.defines, ...props.defines };
  return m;
}

/** As `LookMaterial` draws a surface: shine is the specular level, the shininess and the reflection. */
export function finishedMaterial(
  look: Look,
  envMap: THREE.Texture | null,
  decals: DecalTextures,
): THREE.MeshPhongMaterial {
  return withDecal(
    new THREE.MeshPhongMaterial({
      color: look.color,
      specular: new THREE.Color(look.shine, look.shine, look.shine),
      shininess: 100 * look.shine,
      envMap,
      combine: THREE.AddOperation,
      reflectivity: REFLECTIVITY * look.shine,
      transparent: look.opacity < 1,
      opacity: look.opacity,
      depthWrite: look.opacity >= 1,
    }),
    look,
    decals,
    'lit',
  );
}

/** The pieces as meshes under `parent`, `material` giving each surface's material; returns what to dispose. */
export function addPieces(
  parent: THREE.Object3D,
  pieces: readonly Piece[],
  material: (p: Piece, index: number, look: Look) => THREE.Material,
): THREE.Material[] {
  const made: THREE.Material[] = [];
  pieces.forEach((p, i) => {
    const mats = surfacesOf(p, 'finished').map(([, look]) => material(p, i, look));
    made.push(...mats);
    const mesh = new THREE.Mesh(p.geometry, isSurfaced(p.geometry) ? mats : mats[0]);
    if (p.position) mesh.position.set(...p.position);
    if (p.rotation) mesh.rotation.set(...p.rotation);
    parent.add(mesh);
  });
  return made;
}
