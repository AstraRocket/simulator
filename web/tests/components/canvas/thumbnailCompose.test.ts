import { describe, it, expect } from 'vitest';
import { composeThumbnail } from '../../../src/components/canvas/thumbnailCompose';

const N = 64;

/** Layers with `parts` drawn as squares: [x0, y0, size, id, depth, rgb]. */
function layers(parts: [number, number, number, number, number, [number, number, number]][]) {
  const color = new Uint8ClampedArray(N * N * 4);
  const ids = new Uint8ClampedArray(N * N * 4);
  const depth = new Float32Array(N * N);
  for (const [x0, y0, size, id, d, rgb] of parts) {
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        const o = y * N + x;
        color.set([...rgb, 255], o * 4);
        ids.set([0, 0, id, 255], o * 4);
        depth[o] = d;
      }
    }
  }
  return { color, ids, depth };
}

const pixel = (out: Uint8ClampedArray, x: number, y: number) => [...out.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];

describe('composeThumbnail', () => {
  it('is null when nothing was drawn', () => {
    const { color, ids, depth } = layers([]);
    expect(composeThumbnail(color, ids, depth, N)).toBeNull();
  });

  it('puts the part on white at half size, darkened at its silhouette', () => {
    const { color, ids, depth } = layers([[16, 16, 32, 1, 10, [200, 100, 50]]]);
    const out = composeThumbnail(color, ids, depth, N);
    expect(out).toHaveLength(32 * 32 * 4);
    expect(pixel(out!, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(out!, 16, 16)).toEqual([200, 100, 50, 255]);
    // 40% of the part's color, as desktop's OUTLINE_DARKENING of 0.6.
    expect(pixel(out!, 8, 16)).toEqual([80, 40, 20, 255]);
  });

  it('outlines a part where another lies behind it, but not one in front', () => {
    const { color, ids, depth } = layers([
      [8, 8, 48, 1, 40, [200, 0, 0]],
      [24, 24, 16, 2, 5, [0, 200, 0]],
    ]);
    const out = composeThumbnail(color, ids, depth, N);
    // The front square's edge darkens; the back one just outside it does not.
    expect(pixel(out!, 12, 16)).toEqual([0, 80, 0, 255]);
    expect(pixel(out!, 11, 16)).toEqual([200, 0, 0, 255]);
  });

  it('refuses layers that do not match', () => {
    const { color, ids, depth } = layers([]);
    expect(() => composeThumbnail(color, ids, depth.subarray(1), N)).toThrow(RangeError);
  });
});
