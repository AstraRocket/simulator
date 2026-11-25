import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { decalMaterialProps, decalTexture } from '../../../src/components/canvas/decalTexture';
import { DECAL_DEFAULTS, EDGE_MODES, type EdgeMode } from '../../../src/services/design/decal';

const look = (edgeMode: EdgeMode, opacityAffectsTexture = false) => ({
  decal: { name: 'decals/a.png', ...DECAL_DEFAULTS, edgeMode },
  fromTop: true,
  opacityAffectsTexture,
});
const image = {} as HTMLImageElement;

describe("a decal's edge mode", () => {
  it.each([
    ['REPEAT', THREE.RepeatWrapping],
    ['MIRROR', THREE.MirroredRepeatWrapping],
    ['CLAMP', THREE.ClampToEdgeWrapping],
    ['STICKER', THREE.ClampToEdgeWrapping],
  ] as const)('wraps %s as DefaultMaterialBinder does', (mode, wrap) => {
    const t = decalTexture(image, look(mode));
    expect([t.wrapS, t.wrapT]).toEqual([wrap, wrap]);
  });

  it('masks only a sticker past its edge', () => {
    const masked = EDGE_MODES.filter(
      (m) => 'DECAL_STICKER' in (decalMaterialProps(look(m), new THREE.Texture()).defines ?? {}),
    );
    expect(masked).toEqual(['STICKER']);
  });

  it('masks a sticker that fades with the paint too', () => {
    expect(Object.keys(decalMaterialProps(look('STICKER', true), new THREE.Texture()).defines ?? {})).toEqual([
      'DECAL_OPACITY_FADES',
      'DECAL_STICKER',
    ]);
  });

  it('puts the mask in the shader three compiles', () => {
    const shader = { fragmentShader: THREE.ShaderLib.phong.fragmentShader };
    decalMaterialProps(look('STICKER'), new THREE.Texture()).onBeforeCompile?.(
      shader as THREE.WebGLProgramParametersWithUniforms,
    );
    expect(shader.fragmentShader).toContain('#ifdef DECAL_STICKER');
  });
});
