import { describe, expect, it } from 'vitest';
import {
  DECAL_DEFAULTS,
  decalPath,
  decalRepeats,
  decalUvMatrix,
  readDecal,
  uniqueDecalPath,
  type PartDecal,
} from '../../../src/services/design/decal';

const decal = (extra: Partial<PartDecal> = {}): PartDecal => ({ name: 'decals/a.png', ...DECAL_DEFAULTS, ...extra });

/** Where a surface point (u, v) samples the image. */
const sample = (m: number[], u: number, v: number): [number, number] => [
  m[0]! * u + m[1]! * v + m[2]!,
  m[3]! * u + m[4]! * v + m[5]!,
];

const near = (want: [number, number]) => [expect.closeTo(want[0], 12), expect.closeTo(want[1], 12)];

describe('reading a stored decal', () => {
  it("fills what is left out with AppearanceBuilder's defaults", () => {
    expect(readDecal({ name: 'decals/a.png' })).toEqual(decal());
  });

  it('keeps the image key and every placement value', () => {
    const d = decal({
      hash: 'k1',
      offset: [0.1, 0.2],
      center: [0.5, 0.5],
      scale: [2, 3],
      rotation: 1,
      edgeMode: 'STICKER',
    });
    expect(readDecal(d)).toEqual(d);
  });

  it('is no decal without a name, and an unknown edge mode repeats', () => {
    expect(readDecal({ hash: 'k1' })).toBeUndefined();
    expect(readDecal({ name: 'decals/a.png', edgeMode: 'WRAP' })?.edgeMode).toBe('REPEAT');
  });

  it('repeats past the edge only in REPEAT, as the 3D view wraps it', () => {
    expect(decalRepeats(decal())).toBe(true);
    for (const edgeMode of ['MIRROR', 'CLAMP', 'STICKER'] as const)
      expect(decalRepeats(decal({ edgeMode }))).toBe(false);
  });
});

describe("the image's placement, as TextureTransform.getTransformMatrix gives it", () => {
  it('leaves a default decal where the surface maps it', () => {
    expect(sample(decalUvMatrix(decal(), true), 0.3, 0.7)).toEqual(near([0.3, 0.7]));
  });

  it("turns a fin set's image half a turn", () => {
    expect(sample(decalUvMatrix(decal(), false), 0.3, 0.7)).toEqual(near([0.7, 0.3]));
  });

  it('moves the image by the offset, in the saved orientation', () => {
    // The saved transform is conjugated by the UV flip, so a positive offset samples further back.
    expect(sample(decalUvMatrix(decal({ offset: [0.25, 0.1] }), true), 0.5, 0.5)).toEqual(near([0.25, 0.4]));
  });

  it('scales about the far corner, which the flip makes the origin', () => {
    expect(sample(decalUvMatrix(decal({ scale: [2, 1] }), true), 1, 1)).toEqual(near([1, 1]));
    expect(sample(decalUvMatrix(decal({ scale: [2, 1] }), true), 0.5, 0.5)).toEqual(near([0, 0.5]));
  });

  it('turns the image about the flipped center', () => {
    const m = decalUvMatrix(decal({ rotation: Math.PI, center: [-0.5, -0.5] }), true);
    // T(-c) R(pi) T(c) with c = (-0.5, -0.5) is a half turn about (0.5, 0.5) in the flipped frame, so about the middle.
    expect(sample(m, 0.2, 0.3)).toEqual(near([0.8, 0.7]));
  });
});

describe('archive paths', () => {
  it('puts an uploaded file under decals/, as DecalRegistry does', () => {
    expect(decalPath('C:\\art\\logo.png')).toBe('decals/logo.png');
    expect(decalPath('logo.png')).toBe('decals/logo.png');
  });

  it('numbers a taken name as DecalRegistry.makeUniqueName does', () => {
    const taken = new Set(['decals/logo.png', 'decals/logo (1).png']);
    expect(uniqueDecalPath('decals/logo.png', taken)).toBe('decals/logo (2).png');
    expect(uniqueDecalPath('decals/other.png', taken)).toBe('decals/other.png');
  });
});
