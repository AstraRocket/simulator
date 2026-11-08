/** Ported from OpenRocket `CustomFinImporter`; one pixel is one millimeter, upstream's fixed scale. */

export type Pixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

export type FinPoint = [number, number];

/** `CustomFinImporter.validateImage`'s luma cut; dark is fin. */
const LUMA_CUT = 200;

/** Meters. */
const FLATNESS = 0.0008;

const M_PER_PIXEL = 0.001;

export class FinImageError extends Error {
  constructor(public readonly reason: 'notTouchingBottom' | 'noOutline') {
    super(reason);
    this.name = 'FinImageError';
  }
}

type Facing = 'up' | 'down' | 'left' | 'right';

/** Out-of-range reads as 255 (background); `?? 0` would invent fin pixels from truncated data. */
function darkMask(img: Pixels): Uint8Array {
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    const luma = 0.299 * (img.data[p] ?? 255) + 0.587 * (img.data[p + 1] ?? 255) + 0.114 * (img.data[p + 2] ?? 255);
    mask[i] = luma > LUMA_CUT ? 0 : 1;
  }
  return mask;
}

function traceOutline(img: Pixels, mask: Uint8Array, startX: number): FinPoint[] {
  const { width, height } = img;
  const isFin = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;

  const left: Record<Facing, [number, number]> = { down: [1, 0], up: [-1, 0], left: [0, 1], right: [0, -1] };
  const right: Record<Facing, [number, number]> = { down: [-1, 0], up: [1, 0], left: [0, -1], right: [0, 1] };
  const ahead: Record<Facing, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
  const turnLeft: Record<Facing, Facing> = { up: 'left', right: 'up', down: 'right', left: 'down' };
  const turnRight: Record<Facing, Facing> = { up: 'right', right: 'down', down: 'left', left: 'up' };
  const about: Record<Facing, Facing> = { up: 'down', down: 'up', right: 'left', left: 'right' };

  const points: FinPoint[] = [[0, 0]];
  let facing: Facing = 'up';
  let x = startX;
  let y = height - 1;
  let offBottom = false;
  const limit = 8 * width * height;

  for (let step = 0; step < limit; step++) {
    if (isFin(x + left[facing][0], y + left[facing][1])) facing = turnLeft[facing];
    else if (isFin(x + ahead[facing][0], y + ahead[facing][1])) {
      // Straight on.
    } else if (isFin(x + right[facing][0], y + right[facing][1])) facing = turnRight[facing];
    else facing = about[facing];

    const [dx, dy] = ahead[facing];
    x = Math.min(width - 1, Math.max(0, x + dx));
    y = Math.min(height - 1, Math.max(0, y + dy));

    if (y < height - 1) offBottom = true;
    if (isFin(x, y)) points.push([(x - startX) * M_PER_PIXEL, (height - y - 1) * M_PER_PIXEL]);
    if (offBottom && y >= height - 1) break;
  }
  return points;
}

function closestOnSegment(a: FinPoint, b: FinPoint, p: FinPoint): FinPoint {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const numerator = (p[0] - a[0]) * dx + (p[1] - a[1]) * dy;
  if (numerator <= 0) return a;
  const denom = dx * dx + dy * dy;
  if (numerator >= denom) return b;
  const t = numerator / denom;
  return [a[0] + dx * t, a[1] + dy * t];
}

function distanceFromLine(a: FinPoint, b: FinPoint, p: FinPoint): number {
  const c = closestOnSegment(a, b, p);
  return Math.hypot(p[0] - c[0], p[1] - c[1]);
}

/** `CustomFinImporter.optimizePoints`. */
function simplify(input: FinPoint[]): FinPoint[] {
  let points = input;
  for (;;) {
    const before = points.length;
    const out: FinPoint[] = [];
    let i = 0;
    while (i < points.length) {
      out.push(points[i]!);
      if (i === points.length - 1) break;
      let best = i + 1;
      for (let j = points.length - 1; j > i + 1; j--) {
        let flat = true;
        for (let k = i + 1; k < j; k++) {
          if (distanceFromLine(points[i]!, points[j]!, points[k]!) > FLATNESS) {
            flat = false;
            break;
          }
        }
        if (flat) {
          best = j;
          break;
        }
      }
      i = best;
    }
    points = out;
    if (points.length === before) return points;
  }
}

/** Pixels; `simplify` is cubic on the main thread. */
const MAX_TRACE_EDGE = 1200;

export function traceSize(width: number, height: number): { width: number; height: number } {
  const factor = Math.ceil(Math.max(width, height) / MAX_TRACE_EDGE);
  if (factor <= 1) return { width, height };
  return { width: Math.max(2, Math.floor(width / factor)), height: Math.max(2, Math.floor(height / factor)) };
}

/** Nearest-neighbor (averaging invents mid-gray edge pixels); endpoint-inclusive so the bottom row is kept. */
function reduced(img: Pixels): { img: Pixels; sx: number; sy: number } {
  const { width, height } = traceSize(img.width, img.height);
  if (width === img.width && height === img.height) return { img, sx: 1, sy: 1 };
  const sx = (img.width - 1) / (width - 1);
  const sy = (img.height - 1) / (height - 1);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = Math.round(y * sy);
    for (let x = 0; x < width; x++) {
      const src = (srcY * img.width + Math.round(x * sx)) * 4;
      const dst = (y * width + x) * 4;
      data[dst] = img.data[src] ?? 255;
      data[dst + 1] = img.data[src + 1] ?? 255;
      data[dst + 2] = img.data[src + 2] ?? 255;
      data[dst + 3] = img.data[src + 3] ?? 255;
    }
  }
  return { img: { width, height, data }, sx, sy };
}

/** In meters, root on `y = 0`. */
export function finPointsFromImage(source: Pixels): FinPoint[] {
  if (!(source.width > 0 && source.height > 0)) throw new FinImageError('notTouchingBottom');
  const { img, sx, sy } = reduced(source);
  const mask = darkMask(img);
  let startX = -1;
  const bottom = (img.height - 1) * img.width;
  for (let x = 0; x < img.width; x++) {
    if (mask[bottom + x] === 1) {
      startX = x;
      break;
    }
  }
  if (startX < 0) throw new FinImageError('notTouchingBottom');
  const traced = simplify(traceOutline(img, mask, startX));
  if (traced.length < 3) throw new FinImageError('noOutline');
  return sx === 1 && sy === 1 ? traced : traced.map(([x, y]) => [x * sx, y * sy] as FinPoint);
}

/** The trailing separator and CRLF endings match upstream's output. */
export function finPointsCsv(points: readonly FinPoint[], unitSymbol: string, toUi: (m: number) => number): string {
  const rows = [`X / ${unitSymbol}, Y / ${unitSymbol}, `];
  for (const [x, y] of points) rows.push(`${toUi(x)}, ${toUi(y)}, `);
  return rows.join('\r\n') + '\r\n';
}
