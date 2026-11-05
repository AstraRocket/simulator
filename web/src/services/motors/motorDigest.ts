import { md5Hex } from './md5';

// OpenRocket's `MotorDigest`: epsilon nudges on both sides of the scaling match the kernel's rounding.
export interface DigestCurve {
  times: readonly number[];
  /** kg */
  masses: readonly number[];
  /** m from the motor's front */
  cgs: readonly number[];
  thrusts: readonly number[];
}

const EPSILON = 0.00000000001;

/** `MotorDigest.DataType`: order and multiplier. */
const DIGEST_TYPES = {
  TIME_ARRAY: [0, 1000],
  MASS_SPECIFIC: [1, 10000],
  MASS_PER_TIME: [2, 10000],
  CG_PER_TIME: [4, 1000],
  FORCE_PER_TIME: [5, 1000],
} as const;
type DigestType = (typeof DIGEST_TYPES)[keyof typeof DIGEST_TYPES];

const next = (v: number) => v + Math.sign(v) * EPSILON;

/** Java's `(int) Math.round(v)`: half up, then truncated to 32 bits. */
const javaRoundInt = (v: number) => Math.floor(v + 0.5) | 0;

function digestBlocks(blocks: readonly (readonly [DigestType, readonly number[]])[]): string {
  const ints: number[] = [];
  for (const [[order, multiplier], values] of blocks) {
    ints.push(order, values.length);
    for (const v of values) ints.push(javaRoundInt(next(next(v) * multiplier)));
  }
  const bytes = new Uint8Array(ints.length * 4);
  const view = new DataView(bytes.buffer);
  ints.forEach((v, i) => view.setInt32(i * 4, v, false));
  return md5Hex(bytes);
}

export function motorDigest(curve: DigestCurve): string {
  return digestBlocks([
    [DIGEST_TYPES.TIME_ARRAY, curve.times],
    [DIGEST_TYPES.MASS_PER_TIME, curve.masses],
    [DIGEST_TYPES.CG_PER_TIME, curve.cgs],
    [DIGEST_TYPES.FORCE_PER_TIME, curve.thrusts],
  ]);
}
