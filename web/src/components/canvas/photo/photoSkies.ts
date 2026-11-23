// cspell:ignore posx negx posy negy posz negz -- the Meadow sky's file names
import * as THREE from 'three';
import type { SkyId } from '../../../services/design/photoSettings';

const BASE = `${import.meta.env.BASE_URL}sky/`;

// Desktop `PhotoPanel`'s faces, in three's cube order: +X, -X, +Y, -Y, +Z, -Z.
const CUBES: Partial<Record<SkyId, string[]>> = {
  Mountains: ['box/East', 'box/West', 'box/Up', 'box/Down', 'box/North', 'box/South'],
  Meadow: ['Meadow/posx', 'Meadow/negx', 'Meadow/posy', 'Meadow/negy', 'Meadow/posz', 'Meadow/negz'],
  Miramar: [
    'miramar/miramar_ft',
    'miramar/miramar_bk',
    'miramar/miramar_up',
    'miramar/miramar_dn',
    'miramar/miramar_rt',
    'miramar/miramar_lf',
  ],
};

/** `Texture.AtlasLayout.HORIZONTAL_CROSS`: each face's column and row in a 4 x 3 grid, in cube order. */
const CROSS: [number, number][] = [
  [2, 1],
  [0, 1],
  [1, 0],
  [1, 2],
  [1, 1],
  [3, 1],
];

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });

async function crossCube(url: string): Promise<THREE.CubeTexture> {
  const atlas = await loadImage(url);
  const n = atlas.width / 4;
  const faces = CROSS.map(([col, row]) => {
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    c.getContext('2d')?.drawImage(atlas, col * n, row * n, n, n, 0, 0, n, n);
    return c;
  });
  return new THREE.CubeTexture(faces);
}

async function load(id: SkyId): Promise<THREE.Texture> {
  let t: THREE.Texture;
  const cube = CUBES[id];
  if (cube) t = new THREE.CubeTexture(await Promise.all(cube.map((f) => loadImage(`${BASE}${f}.jpg`))));
  // A horizontal-cross atlas, cut into its six faces.
  else if (id === 'Storm') t = await crossCube(`${BASE}cross1.jpg`);
  else {
    t = new THREE.Texture(await loadImage(`${BASE}${id === 'Lake' ? 'lake' : 'space'}.jpg`));
    // `HDRIBackground`: a panorama all round. Orbit's `ImageBackground` is a flat picture behind the rocket.
    if (id === 'Lake') t.mapping = THREE.EquirectangularReflectionMapping;
  }
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const skies = new Map<SkyId, Promise<THREE.Texture>>();

/** Loaded once per sky and kept; a failure is retried on the next ask. */
export function photoSky(id: SkyId): Promise<THREE.Texture> {
  let p = skies.get(id);
  if (!p) {
    p = load(id);
    skies.set(id, p);
    p.catch(() => skies.delete(id));
  }
  return p;
}

/** Whether the sky wraps all round, and so can be reflected; Orbit is a flat picture. */
export const skyWraps = (t: THREE.Texture): boolean =>
  t instanceof THREE.CubeTexture || t.mapping === THREE.EquirectangularReflectionMapping;
