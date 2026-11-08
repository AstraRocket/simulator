import { KeyedError } from '../../i18n/keyedError';

export interface ExportSize {
  width: number;
  height: number;
}

// An oversized render target fails silently at framebuffer setup, so clamp to MAX_TEXTURE_SIZE.
export function clampExportSize(widthPx: number, aspect: number, maxTextureSize: number): ExportSize {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let width = Math.max(1, Math.round(Number.isFinite(widthPx) ? widthPx : 1));
  let height = Math.max(1, Math.round(width / a));
  // A missing or zero limit (stubbed renderer, lost context) means no clamp, not a 1 px export.
  const max = Number.isFinite(maxTextureSize) && maxTextureSize >= 1 ? Math.floor(maxTextureSize) : Infinity;
  const over = Math.max(width, height) / max;
  if (over > 1) {
    width = Math.max(1, Math.floor(width / over));
    height = Math.max(1, Math.floor(height / over));
  }
  return { width, height };
}

// readPixels returns rows bottom-up; ImageData wants top-down.
export function flipRows(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const rowBytes = width * 4;
  const expected = rowBytes * height;
  if (pixels.length !== expected) {
    throw new RangeError(`flipRows: expected ${expected} bytes for ${width}x${height}, got ${pixels.length}`);
  }
  const out = new Uint8ClampedArray(expected);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * rowBytes;
    out.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
  }
  return out;
}

// A canvas past the browser's size limit (Safari near 16.7 Mpx) has no 2D context or throws.
export function canvas2d(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) throw new KeyedError('errors.export.imageTooLarge');
  return { canvas, ctx };
}

export function pixelsToCanvas(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const { canvas, ctx } = canvas2d(width, height);
  const image = ctx.createImageData(width, height);
  image.data.set(flipRows(pixels, width, height));
  ctx.putImageData(image, 0, 0);
  return canvas;
}
