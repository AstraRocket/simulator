/** Port of Transition.Shape.getRadius() and Transition.getRadius(); a nose cone is never clipped. */
import type { ComponentNode, NoseShape } from '../engine/openRocketEngine';
import { KERNEL_SHAPES } from './kernelDefaults';
import { bodyTubeRadius, noseConeAftRadius, num, numOpt, transitionRadii } from './nodeProps';
import { partLength } from './position';

const MINFEATURE = 0.001;
const CLIP_PRECISION = 0.0001;
// 60 halvings take any finite double interval below CLIP_PRECISION.
const CLIP_MAX_HALVINGS = 60;

const safeSqrt = (v: number): number => Math.sqrt(Math.max(0, v));
const pow2 = (x: number): number => x * x;
const pow3 = (x: number): number => x * x * x;

/** Transition.Shape.defaultParameter(). */
export function shapeParamDefault(shape: string): number {
  switch (shape) {
    case 'ogive':
    case 'parabolic':
      return 1.0;
    case 'power':
      return 0.5;
    default:
      return 0.0;
  }
}

export function shapeUsesParameter(shape: string): boolean {
  return shape === 'ogive' || shape === 'power' || shape === 'parabolic' || shape === 'haack';
}

/** Haack tops out at LV-Haack, 1/3. */
export function shapeParamMax(shape: string): number {
  return shape === 'haack' ? 1 / 3 : 1;
}

export function shapeIsClippable(shape: string): boolean {
  return shape === 'ellipsoid' || shape === 'power' || shape === 'haack';
}

/** Resets parameter and clip as `Transition.setShapeType` does: a kept value flies a different profile. */
export function shapeChange(type: string, shape: string): Partial<ComponentNode> {
  const patch: Partial<ComponentNode> = { shape, shapeParameter: shapeParamDefault(shape) };
  if (type === 'transition') patch['clipped'] = shapeIsClippable(shape) ? true : undefined;
  return patch;
}

/** Re-choosing the current shape keeps parameter and clip, as `setShapeType` returns early. */
export function shapeSelect(node: ComponentNode, shape: string): Partial<ComponentNode> {
  return shape === nodeShape(node) ? { shape } : shapeChange(node.type, shape);
}

/** Shape.getRadius(x, radius, length, param); x from the virtual tip. */
export function shapeRadius(shape: string, x: number, radius: number, length: number, param: number): number {
  if (!(length > 0) || !(radius > 0)) return 0;
  switch (shape) {
    case 'conical':
      return (radius * x) / length;
    case 'ellipsoid': {
      const xs = (x * radius) / length;
      return safeSqrt(2 * radius * xs - xs * xs);
    }
    case 'power': {
      if (param <= 0.00001) {
        return x <= 0.00001 ? 0 : radius;
      }
      return radius * Math.pow(x / length, param);
    }
    case 'parabolic':
      return radius * (((2 * x) / length - param * pow2(x / length)) / (2 - param));
    case 'haack': {
      const theta = Math.acos(1 - (2 * x) / length);
      if (param === 0) {
        return radius * safeSqrt((theta - Math.sin(2 * theta) / 2) / Math.PI);
      }
      return radius * safeSqrt((theta - Math.sin(2 * theta) / 2 + param * pow3(Math.sin(theta))) / Math.PI);
    }
    case 'ogive':
    default: {
      // Impossible to calculate ogive for length < radius, scale instead.
      if (length < radius) {
        x = (x * radius) / length;
        length = radius;
      }
      if (param < MINFEATURE) {
        return shapeRadius('conical', x, radius, length, param);
      }
      const R = safeSqrt(
        ((pow2(length) + pow2(radius)) * (pow2((2 - param) * length) + pow2(param * radius))) /
          (4 * pow2(param * radius)),
      );
      const L = length / param;
      const y0 = safeSqrt(R * R - L * L);
      return safeSqrt(R * R - (L - x) * (L - x)) - y0;
    }
  }
}

/** Transition.calculateClip(). Assumes r1 < r2. */
function calculateClip(shape: string, param: number, length: number, r1: number, r2: number): number {
  let min = 0;
  let max = length;
  // Unlike the Java: NaN from a file would make the bisection never exit.
  if (r1 === 0 || !Number.isFinite(length) || length <= 0 || !Number.isFinite(r1) || !Number.isFinite(r2)) return 0;
  let n = 0;
  while (shapeRadius(shape, max, r2, max + length, param) - r1 < 0) {
    min = max;
    max *= 2;
    n++;
    if (n > 10) break;
  }
  // The cap only matters when the doubling above overflowed to Infinity.
  for (let i = 0; i < CLIP_MAX_HALVINGS; i++) {
    const clip = (min + max) / 2;
    if (max - min < CLIP_PRECISION) return clip;
    const val = shapeRadius(shape, clip, r2, clip + length, param);
    if (val - r1 > 0) {
      max = clip;
    } else {
      min = clip;
    }
  }
  return Number.isFinite(max) ? (min + max) / 2 : min;
}

function sampleXs(length: number, steps: number, extra?: readonly number[]): number[] {
  const s = Math.max(1, Math.floor(steps));
  const xs: number[] = [];
  for (let i = 0; i <= s; i++) xs.push((i / s) * length);
  if (!extra || extra.length === 0) return xs;
  for (const e of extra) {
    if (!Number.isFinite(e) || e < 0 || e > length) continue;
    // Near-duplicates replace the ladder sample: the caller's x is a cut plane.
    const j = xs.findIndex((v) => Math.abs(v - e) <= 1e-9);
    if (j >= 0) xs[j] = e;
    else xs.push(e);
  }
  xs.sort((a, b) => a - b);
  return xs;
}

/** Absent `clipped` means clipped, as Transition.isClipped(). */
export function outerProfile(
  shape: string,
  param: number | undefined,
  length: number,
  foreR: number,
  aftR: number,
  steps = 32,
  extraX?: readonly number[],
  clipped?: boolean,
): [number, number][] {
  const p = Math.min(Math.max(param ?? shapeParamDefault(shape), 0), shapeParamMax(shape));
  const pts: [number, number][] = [];
  const xs = sampleXs(length, steps, extraX);

  if (foreR === aftR || length <= 0) {
    for (const x of xs) pts.push([x, foreR]);
    return pts;
  }

  // Transition.getRadius() measures x from the small end (r1 < r2), flipped back afterward.
  const flipped = foreR > aftR;
  const r1 = flipped ? aftR : foreR;
  const r2 = flipped ? foreR : aftR;
  const clip = r1 > 0 && shapeIsClippable(shape) && (clipped ?? true);
  const clipLength = clip ? calculateClip(shape, p, length, r1, r2) : 0;

  const radiusAt = (x: number): number => {
    if (x <= 0) return r1;
    if (x >= length) return r2;
    if (clip) return shapeRadius(shape, clipLength + x, r2, clipLength + length, p);
    return r1 + shapeRadius(shape, x, r2 - r1, length, p);
  };

  for (const x of xs) {
    pts.push([x, radiusAt(flipped ? length - x : x)]);
  }
  return pts;
}

/** In `Transition.Shape` order. */
const SHAPE_ORDER: Record<NoseShape, true> = {
  conical: true,
  ogive: true,
  ellipsoid: true,
  power: true,
  parabolic: true,
  haack: true,
};
export const PROFILE_SHAPES: readonly NoseShape[] = Object.keys(SHAPE_ORDER) as NoseShape[];

export const shapeOptions = (type: keyof typeof KERNEL_SHAPES): string[] => {
  const first = KERNEL_SHAPES[type];
  return [first, ...PROFILE_SHAPES.filter((s) => s !== first)];
};

export function nodeShape(node: ComponentNode): string {
  const shape = node['shape'];
  if (typeof shape === 'string') return shape;
  return node.type === 'nosecone' ? KERNEL_SHAPES.nosecone : KERNEL_SHAPES.transition;
}

/** A nose cone or transition's own outer profile: its shape, shape parameter and `clipped` setting. */
export function nodeOuterProfile(
  node: ComponentNode,
  length: number,
  foreR: number,
  aftR: number,
  steps?: number,
  extraX?: readonly number[],
): [number, number][] {
  const clipped = typeof node['clipped'] === 'boolean' ? node['clipped'] : undefined;
  return outerProfile(nodeShape(node), numOpt(node, 'shapeParameter'), length, foreR, aftR, steps, extraX, clipped);
}

/** A flipped nose cone has its base fore (`NoseCone.setFlipped`). */
export function profileEnds(node: ComponentNode): { fore: number; aft: number } {
  if (node.type === 'nosecone') {
    const base = noseConeAftRadius(node);
    return node['flipped'] === true ? { fore: base, aft: 0 } : { fore: 0, aft: base };
  }
  return transitionRadii(node);
}

export interface Shoulder {
  radius: number;
  length: number;
  thickness: number;
  capped: boolean;
}

export const hasShoulder = (s: Shoulder): boolean => s.radius > 1e-6 && s.length > 1e-6;

/** A nose cone's shoulder sits at its base: fore once flipped. */
export function shouldersOf(node: ComponentNode): { fore: Shoulder; aft: Shoulder } {
  const read = (prefix: string): Shoulder => ({
    radius: num(node, `${prefix}Radius`, 0),
    length: num(node, `${prefix}Length`, 0),
    thickness: num(node, `${prefix}Thickness`, 0),
    capped: node[`${prefix}Capped`] === true,
  });
  const none: Shoulder = { radius: 0, length: 0, thickness: 0, capped: false };
  if (node.type === 'nosecone') {
    const base = read('shoulder');
    return node['flipped'] === true ? { fore: base, aft: none } : { fore: none, aft: base };
  }
  return { fore: read('foreShoulder'), aft: read('aftShoulder') };
}

/** `SymmetricComponent.getRadius(x)`, station clamped into the part. */
export function stationRadius(node: ComponentNode, x: number): number {
  const length = partLength(node);
  switch (node.type) {
    case 'nosecone':
    case 'transition': {
      const { fore: foreR, aft: aftR } = profileEnds(node);
      // As `Transition.getRadius`: with no length the aft end wins at x = 0.
      if (!(length > 0)) return x < 0 ? foreR : aftR;
      const at = Math.max(0, Math.min(length, x));
      const pts = nodeOuterProfile(node, length, foreR, aftR, 1, [at]);
      return pts.find(([px]) => Math.abs(px - at) < 1e-9)?.[1] ?? aftR;
    }
    case 'bodytube':
      return bodyTubeRadius(node);
    default:
      return num(node, 'outerRadius');
  }
}
