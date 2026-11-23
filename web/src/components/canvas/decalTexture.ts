// cspell:ignore glsl -- shader source
import * as THREE from 'three';
import { useEffect, useMemo, useState } from 'react';
import type { LookDecal } from '../../services/design/appearance';
import { decalRepeats, decalUvMatrix } from '../../services/design/decal';
import { getDecalImage, onDecalImage } from '../../services/storage/decalStore';

// One decoded image per stored image, however many parts and surfaces wear it.
const images = new Map<string, Promise<HTMLImageElement | null>>();

async function decode(hash: string): Promise<HTMLImageElement | null> {
  const stored = await getDecalImage(hash);
  if (!stored || typeof Image === 'undefined') return null;
  const url = URL.createObjectURL(new Blob([stored.bytes as BlobPart], { type: stored.mime }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function decalImage(hash: string): Promise<HTMLImageElement | null> {
  let p = images.get(hash);
  if (!p) {
    p = decode(hash);
    images.set(hash, p);
    // A miss is retried when the image arrives (an upload, or a file opened in this tab).
    void p.then((img) => {
      if (!img && images.get(hash) === p) images.delete(hash);
    });
  }
  return p;
}

/**
 * The image as desktop draws it: flipped on load as `Texture` loads with stb_image (three's `flipY`), wrapped only
 * when it repeats, and placed by `TextureTransform`.
 */
export function decalTexture(img: HTMLImageElement, look: LookDecal): THREE.Texture {
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  const wrap = decalRepeats(look.decal) ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapS = wrap;
  t.wrapT = wrap;
  t.anisotropy = 4;
  t.matrixAutoUpdate = false;
  const m = decalUvMatrix(look.decal, look.fromTop);
  t.matrix.set(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7]!, m[8]!);
  t.needsUpdate = true;
  return t;
}

/** Null until the image is decoded, and while this browser has no copy of it. */
export function useDecalTexture(look: LookDecal | undefined): THREE.Texture | null {
  const hash = look?.decal.hash;
  const [img, setImg] = useState<{ hash: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!hash) return;
    let live = true;
    const load = () =>
      void decalImage(hash).then((loaded) => {
        if (live && loaded) setImg({ hash, img: loaded });
      });
    load();
    const off = onDecalImage((h) => {
      if (h === hash) load();
    });
    return () => {
      live = false;
      off();
    };
  }, [hash]);
  const shown = img && img.hash === hash ? img.img : null;
  // Keyed on the values, not the look object, which every rebuild makes anew.
  const key = look ? JSON.stringify(look) : '';
  const texture = useMemo(
    () => (shown && key ? decalTexture(shown, JSON.parse(key) as LookDecal) : null),
    [shown, key],
  );
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

/**
 * Lays the image over the paint as desktop's `fragment.glsl` does, rather than tinting it: by its own alpha, and
 * unless the opacity fades the decal too, opaque where the image is over see-through paint.
 */
function blendDecal(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    /* glsl */ `
#ifdef USE_MAP
  vec4 decalTexel = texture2D( map, vMapUv );
  float decalA = clamp( pow( decalTexel.a, 0.82 ), 0.0, 1.0 );
  #ifdef DECAL_OPACITY_FADES
    diffuseColor.rgb = mix( diffuseColor.rgb, decalTexel.rgb, decalA );
  #else
    float paintA = diffuseColor.a * ( 1.0 - decalA );
    float blendA = decalA + paintA;
    if ( blendA > 1e-5 ) diffuseColor.rgb = ( decalTexel.rgb * decalA + diffuseColor.rgb * paintA ) / blendA;
    diffuseColor.a = blendA;
  #endif
#endif
`,
  );
}

/** The material settings a surface with a decal takes; `defines` keeps the two blends' programs apart. */
export function decalMaterialProps(look: LookDecal | undefined, texture: THREE.Texture | null) {
  if (!look || !texture) return { map: null };
  return {
    map: texture,
    onBeforeCompile: blendDecal,
    defines: look.opacityAffectsTexture ? { DECAL_OPACITY_FADES: '' } : {},
  };
}
