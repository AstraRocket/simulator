import * as THREE from 'three';

const PX = 128;

/**
 * Text drawn into a texture, for a label in the 3D scene: three.js draws no text, and a font file fetched for it
 * would not load offline. `aspect` is its width over its height. Null with no canvas to draw on (a test).
 */
export function textTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = `700 ${PX}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + PX / 4;
  canvas.width = width;
  canvas.height = Math.ceil(PX * 1.3);
  // Resizing the canvas resets its state.
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: width / canvas.height };
}
