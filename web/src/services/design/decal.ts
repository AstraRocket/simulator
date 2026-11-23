import { isRecord } from '../app/numbers';

/** Desktop `Decal.EdgeMode`. The 3D view wraps only `REPEAT`; the rest clamp to the image edge. */
export const EDGE_MODES = ['REPEAT', 'MIRROR', 'CLAMP', 'STICKER'] as const;
export type EdgeMode = (typeof EDGE_MODES)[number];

export type Pair = [number, number];

/** Desktop `Decal`: an image laid on a part, with the transform `AppearanceBuilder` edits. */
export interface PartDecal {
  /** The file's path in the `.ork` archive, as `decals/logo.png`. */
  name: string;
  /** The image's key in the decal store; absent when the file that named it held no such image. */
  hash?: string;
  offset: Pair;
  center: Pair;
  /** Stored as desktop stores it: the editor shows its inverse. */
  scale: Pair;
  /** Radians. */
  rotation: number;
  edgeMode: EdgeMode;
}

/** Desktop `AppearanceBuilder.resetToDefaults`. */
export const DECAL_DEFAULTS: Omit<PartDecal, 'name'> = {
  offset: [0, 0],
  center: [0, 0],
  scale: [1, 1],
  rotation: 0,
  edgeMode: 'REPEAT',
};

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const pairOf = (v: unknown, fallback: Pair): Pair =>
  Array.isArray(v) ? [finite(v[0], fallback[0]), finite(v[1], fallback[1])] : fallback;

export const isEdgeMode = (v: unknown): v is EdgeMode => (EDGE_MODES as readonly unknown[]).includes(v);

export function readDecal(v: unknown): PartDecal | undefined {
  if (!isRecord(v) || typeof v['name'] !== 'string' || !v['name']) return undefined;
  return {
    name: v['name'],
    ...(typeof v['hash'] === 'string' && v['hash'] ? { hash: v['hash'] } : {}),
    offset: pairOf(v['offset'], DECAL_DEFAULTS.offset),
    center: pairOf(v['center'], DECAL_DEFAULTS.center),
    scale: pairOf(v['scale'], DECAL_DEFAULTS.scale),
    rotation: finite(v['rotation'], 0),
    edgeMode: isEdgeMode(v['edgeMode']) ? v['edgeMode'] : 'REPEAT',
  };
}

/** Whether the 3D view repeats the image past its edge (`AppearanceFactory.updateTexture`). */
export const decalRepeats = (d: PartDecal): boolean => d.edgeMode === 'REPEAT';

type M3 = [number, number, number, number, number, number];

// Affine 2D, row-major [a, b, c, d, e, f]: x' = a x + b y + c, y' = d x + e y + f.
const mul = (p: M3, q: M3): M3 => [
  p[0] * q[0] + p[1] * q[3],
  p[0] * q[1] + p[1] * q[4],
  p[0] * q[2] + p[1] * q[5] + p[2],
  p[3] * q[0] + p[4] * q[3],
  p[3] * q[1] + p[4] * q[4],
  p[3] * q[2] + p[4] * q[5] + p[5],
];
const translate = (x: number, y: number): M3 => [1, 0, x, 0, 1, y];
const scale = (x: number, y: number): M3 => [x, 0, 0, 0, y, 0];
const rotate = (a: number): M3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0];

const FLIP: M3 = mul(translate(1, 1), scale(-1, -1));
const HALF_TURN: M3 = mul(mul(translate(0.5, 0.5), rotate(Math.PI)), translate(-0.5, -0.5));

/**
 * Desktop `TextureTransform.getTransformMatrix`, row-major 3x3 with the last row `0 0 1`. A fin set's image is
 * not scaled from the top, so it gets a half turn.
 */
export function decalUvMatrix(d: PartDecal, fromTop: boolean): number[] {
  const legacy = [
    translate(-d.center[0], -d.center[1]),
    rotate(d.rotation),
    translate(d.center[0], d.center[1]),
    scale(d.scale[0], d.scale[1]),
    translate(d.offset[0], d.offset[1]),
  ].reduce(mul);
  let m = mul(mul(FLIP, legacy), FLIP);
  if (!fromTop) m = mul(m, HALF_TURN);
  return [...m, 0, 0, 1];
}

/** An uploaded file's archive path, under `decals/` as `DecalRegistry.checkPathConsistency` puts it. */
export const decalPath = (fileName: string): string => `decals/${fileName.split(/[\\/]/).pop()?.trim() || 'decal.png'}`;

/** As `DecalRegistry.makeUniqueName`: `decals/logo (2).png` when `decals/logo.png` is taken. */
export function uniqueDecalPath(wanted: string, taken: ReadonlySet<string>): string {
  if (!taken.has(wanted)) return wanted;
  const m = /^(.*?)(?: \((\d+)\))?(\.\w*)?$/.exec(wanted);
  const base = m?.[1] ?? wanted;
  const ext = m?.[3] ?? '';
  for (let i = 1; ; i++) {
    const name = `${base} (${i})${ext}`;
    if (!taken.has(name)) return name;
  }
}
