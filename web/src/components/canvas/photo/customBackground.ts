import * as THREE from 'three';

// A picture of your own behind the rocket in Photo Studio. Desktop has no such background, so it is never saved:
// not in the design, not in the .ork, not in the browser. It lasts until the page is reloaded.

export interface CustomBackground {
  /** The chosen picture's file name, once one is chosen. */
  name: string | null;
  texture: THREE.Texture | null;
  /** Picked as the background type; picking another keeps the picture for coming back to. */
  active: boolean;
}

let current: CustomBackground = { name: null, texture: null, active: false };
const listeners = new Set<() => void>();

const update = (next: CustomBackground) => {
  current = next;
  for (const cb of listeners) cb();
};

export function subscribeCustomBackground(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const customBackground = (): CustomBackground => current;

/** The picture to draw: only while it is the background type. */
export const activeCustomTexture = (c: CustomBackground): THREE.Texture | null => (c.active ? c.texture : null);

/** Back to the saved background. */
export function clearCustomBackground(): void {
  current.texture?.dispose();
  update({ name: null, texture: null, active: false });
}

/** Rejects a file the browser cannot read as an image. */
export async function setCustomBackground(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    current.texture?.dispose();
    update({ name: file.name, texture, active: true });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Crops the picture to fill the view without stretching it, as a cover-fit wallpaper does. */
export function coverFit(t: THREE.Texture, viewAspect: number): void {
  const img = t.image as { width?: number; height?: number } | null;
  const aspect = img?.width && img.height ? img.width / img.height : viewAspect;
  if (aspect > viewAspect) {
    t.repeat.set(viewAspect / aspect, 1);
    t.offset.set((1 - viewAspect / aspect) / 2, 0);
  } else {
    t.repeat.set(1, aspect / viewAspect);
    t.offset.set(0, (1 - aspect / viewAspect) / 2);
  }
}
