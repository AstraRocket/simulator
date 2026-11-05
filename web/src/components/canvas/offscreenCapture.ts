// cspell:ignore glsl Reinhard Cineon MSAA tonemapping OETF
import * as THREE from 'three';
import { pixelsToCanvas } from '../../services/exports/offscreenRaster';

// three tone maps only when rendering to the canvas, so a second pass (as OutputPass) does it here.

// Same table WebGLProgram uses to bind `toneMapping()`.
const TONE_MAPPING_FN: Partial<Record<THREE.ToneMapping, string>> = {
  [THREE.LinearToneMapping]: 'LinearToneMapping',
  [THREE.ReinhardToneMapping]: 'ReinhardToneMapping',
  [THREE.CineonToneMapping]: 'CineonToneMapping',
  [THREE.ACESFilmicToneMapping]: 'ACESFilmicToneMapping',
  [THREE.AgXToneMapping]: 'AgXToneMapping',
  [THREE.NeutralToneMapping]: 'NeutralToneMapping',
  [THREE.CustomToneMapping]: 'CustomToneMapping',
};

const SAMPLES = 4;

// three prepends `tonemapping_pars_fragment` only for the canvas. Alpha is un-premultiplied
// before tone mapping so the translucent shell composites onto white as on screen.
function outputPassMaterial(renderer: THREE.WebGLRenderer, source: THREE.Texture): THREE.ShaderMaterial {
  const fn = TONE_MAPPING_FN[renderer.toneMapping];
  const srgb = renderer.outputColorSpace === THREE.SRGBColorSpace;
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: source },
      toneMappingExposure: { value: renderer.toneMappingExposure },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        c.rgb /= max(c.a, 1e-5);
        ${fn ? `c.rgb = ${fn}(c.rgb);` : ''}
        ${srgb ? 'c = sRGBTransferOETF(c);' : ''}
        gl_FragColor = c;
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
}

// A refused target would otherwise be a silent black frame.
function assertFramebufferComplete(gl: WebGLRenderingContext | WebGL2RenderingContext, what: string): void {
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`offscreen capture: ${what} framebuffer incomplete (GL status 0x${status.toString(16)})`);
  }
}

// Must stay synchronous, so the frame loop cannot interleave or dispose the renderer mid-capture.
export function captureSceneOffscreen(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): HTMLCanvasElement {
  const gl = renderer.getContext();
  // Half-float when supported: an 8-bit linear target bands the darks once sRGB-encoded.
  const floatOk =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const sceneTarget = new THREE.WebGLRenderTarget(width, height, {
    samples: SAMPLES,
    type: floatOk ? THREE.HalfFloatType : THREE.UnsignedByteType,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  // Already sRGB; declared linear so three does not encode it again.
  const encodedTarget = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  const material = outputPassMaterial(renderer, sceneTarget.texture);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const passScene = new THREE.Scene();
  passScene.add(quad);
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const prevTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(sceneTarget);
    assertFramebufferComplete(gl, 'scene');
    renderer.render(scene, camera);

    renderer.setRenderTarget(encodedTarget);
    assertFramebufferComplete(gl, 'output');
    renderer.render(passScene, passCamera);

    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(encodedTarget, 0, 0, width, height, pixels);
    return pixelsToCanvas(pixels, width, height);
  } finally {
    renderer.setRenderTarget(prevTarget);
    quad.geometry.dispose();
    material.dispose();
    sceneTarget.dispose();
    encodedTarget.dispose();
  }
}
