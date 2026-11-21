// cspell:ignore supersampled supersamples SUPERSAMPLING -- desktop's names
// Desktop `RocketThumbnail` (swing figure3d/thumbnail): the `thumbnail.png` a saved `.ork` carries for
// Explorer and Finder icons. Outlined parts on white keep the rocket readable at icon size.

/** Width and height of the thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 1024;
/** The render is this many times larger along each axis, and averaged down. */
export const SUPERSAMPLING = 2;
/** Fraction of the image left empty on each side. */
export const THUMBNAIL_MARGIN = 0.06;

const BACKGROUND = 255;
const OUTLINE_WIDTH = 1 / 170; // of the image size
const OUTLINE_DARKENING = 0.6;
/** Pixels with at least this alpha belong to the rocket. */
const OPAQUE_ALPHA = 128;

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * The thumbnail's RGBA pixels from three layers of an `n`×`n` render, top row first: `color` the unlit rocket with
 * straight alpha on transparent, `ids` the same view with each part opaque in a color of its own, `depth` each
 * pixel's distance from the camera in pixels. Null when nothing was drawn.
 */
export function composeThumbnail(
  color: Uint8ClampedArray,
  ids: Uint8ClampedArray,
  depth: Float32Array,
  n: number,
): Uint8ClampedArray | null {
  if (color.length !== n * n * 4 || ids.length !== n * n * 4 || depth.length !== n * n || n % SUPERSAMPLING !== 0) {
    throw new RangeError('composeThumbnail: the layers must be square, of the same size and supersampled');
  }
  const isRocket = (o: number) => ids[o * 4 + 3]! >= OPAQUE_ALPHA;
  const idAt = (o: number) => (ids[o * 4]! << 16) | (ids[o * 4 + 1]! << 8) | ids[o * 4 + 2]!;

  let empty = true;
  for (let o = 0; o < n * n && empty; o++) if (isRocket(o)) empty = false;
  if (empty) return null;

  const colors = Uint8ClampedArray.from(color);
  drawOutlines(colors, isRocket, idAt, depth, n);
  return downsample(colors, n);
}

/**
 * Darken each part's pixels near the rocket's silhouette and near other parts behind it. Where two parts meet at
 * about the same depth, only one of them gets the line.
 */
function drawOutlines(
  colors: Uint8ClampedArray,
  isRocket: (o: number) => boolean,
  idAt: (o: number) => number,
  depth: Float32Array,
  n: number,
): void {
  const width = Math.max(2, Math.round(n * OUTLINE_WIDTH));
  const distances = [Math.floor(width / 2), width];
  // Depth change a smooth surface can have over the outline width.
  const tolerance = 3 * width;
  const outline = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const o = y * n + x;
      if (!isRocket(o)) continue;
      const id = idAt(o);
      search: for (let d = 0; d < DX.length; d++) {
        for (const distance of distances) {
          const qx = x + DX[d]! * distance;
          const qy = y + DY[d]! * distance;
          if (qx < 0 || qy < 0 || qx >= n || qy >= n) {
            outline[o] = 1;
            break search;
          }
          const q = qy * n + qx;
          if (!isRocket(q)) {
            outline[o] = 1;
            break search;
          }
          const other = idAt(q);
          if (other === id) continue;
          const behind = depth[q]! - depth[o]!;
          if (behind > tolerance || (Math.abs(behind) <= tolerance && other > id)) {
            outline[o] = 1;
            break search;
          }
        }
      }
    }
  }
  const f = 1 - OUTLINE_DARKENING;
  for (let o = 0; o < outline.length; o++) {
    if (!outline[o]) continue;
    // The line is opaque, also where the part is translucent.
    for (let c = 0; c < 3; c++) colors[o * 4 + c] = Math.round(colors[o * 4 + c]! * f);
    colors[o * 4 + 3] = 255;
  }
}

/** Put the render on white and average each block of supersamples into one pixel. */
function downsample(colors: Uint8ClampedArray, n: number): Uint8ClampedArray {
  const size = n / SUPERSAMPLING;
  const samples = SUPERSAMPLING * SUPERSAMPLING;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLING; sy++) {
        for (let sx = 0; sx < SUPERSAMPLING; sx++) {
          const i = ((y * SUPERSAMPLING + sy) * n + x * SUPERSAMPLING + sx) * 4;
          const alpha = colors[i + 3]!;
          // Integer division, as desktop's `over`.
          for (let c = 0; c < 3; c++)
            sum[c]! += Math.trunc((colors[i + c]! * alpha + BACKGROUND * (255 - alpha)) / 255);
        }
      }
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = Math.trunc(sum[c]! / samples);
      out[o + 3] = 255;
    }
  }
  return out;
}
