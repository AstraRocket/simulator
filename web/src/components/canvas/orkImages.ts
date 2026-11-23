// cspell:ignore glsl unpremultiply SUPERSAMPLING -- shader source, alpha math, desktop's constant name
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import i18n from '../../i18n';
import type { OrkImages, OrkImageSource } from '../../services/files/saveOrk';
import { encodeCanvas, snapshotWithHeader, type ExportData } from '../../services/exports/schematicExport';
import { canvas2d, flipRows } from '../../services/exports/offscreenRaster';
import { APP_VERSION } from '../../services/app/appInfo';
import { mergePalette } from '../../services/design/partColors';
import { withFigureDefaults } from '../../services/design/figureStyle';
import { loadSettings } from '../../services/storage/settings';
import { selectMotorDims } from '../../state/configSlice';
import { buildPieces, piecesBounds, type Piece } from './rocketPieces';
import { addPieces, decalsFor, finishedMaterial, withDecal, type DecalTextures } from './finishedScene';
import { exportCamera, isFittableBox } from './rocketExportCamera';
import { captureSceneOffscreen } from './offscreenCapture';
import { rocketSpanM } from './aftScene';
import { composeThumbnail, SUPERSAMPLING, THUMBNAIL_MARGIN, THUMBNAIL_SIZE } from './thumbnailCompose';

// Desktop's `BasicFrame.PREVIEW_WIDTH` and `PREVIEW_HEIGHT`; our figures go in a band above, not over the rocket.
const PREVIEW_WIDTH = 1000;
const PREVIEW_HEIGHT = 600;
// The design view's lights and finish (Rocket3D, LookMaterial), in the default theme's colors: a file outlives the
// theme it was saved in.
const KEY_LIGHT = { from: new THREE.Vector3(1.5, 2.5, 2), intensity: 0.95, color: '#fff7ee' };
const FILL_LIGHTS = [
  { from: new THREE.Vector3(-2, 0.5, -1), intensity: 0.45, color: '#e8eef8' },
  { from: new THREE.Vector3(-0.5, -1.5, -2.5), intensity: 0.35, color: '#ffffff' },
];
const AMBIENT = 0.55;
const ROOM_FACE_PX = 64;

/**
 * Desktop's `preview.png` and `thumbnail.png` for a saved `.ork`, drawn off-screen from the design, so a save does
 * not need the 3D view open. Each is left out when it cannot be drawn, as desktop does.
 */
export async function renderOrkImages(source: OrkImageSource): Promise<OrkImages> {
  // No WebGL at all (jsdom, a locked-down browser): nothing to try.
  if (typeof WebGLRenderingContext === 'undefined') return {};
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true });
  } catch (e) {
    console.warn('.ork save: no WebGL for the preview images', e);
    return {};
  }
  const settings = loadSettings();
  const motors = selectMotorDims(source.tree, source.config);
  const tree = withFigureDefaults(source.tree, settings.figureStyles);
  const { pieces } = buildPieces(tree, motors, mergePalette(settings.partColors));
  const textures: THREE.Texture[] = [];
  try {
    const box = piecesBounds(pieces);
    if (!isFittableBox(box)) return {};
    const decals = await decalsFor(pieces, textures);
    const header: ExportData = {
      name: source.name,
      info: source.info,
      units: settings.units,
      spanM: rocketSpanM(source.tree.components),
      withMotors: Object.keys(motors).length > 0,
      appVersion: APP_VERSION,
      t: i18n.t,
    };
    const images: OrkImages = {};
    // Apart, so one failing still leaves the other.
    try {
      images.preview = await previewPng(renderer, pieces, box, header, decals);
    } catch (e) {
      console.warn('.ork save: preview.png failed', e);
    }
    try {
      images.thumbnail = await thumbnailPng(renderer, pieces, box, decals);
    } catch (e) {
      console.warn('.ork save: thumbnail.png failed', e);
    }
    return images;
  } finally {
    for (const p of pieces) p.geometry.dispose();
    for (const t of textures) t.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

const pngBytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

/** The finished rocket from the side, lit as the design view, under the figures our image exports carry. */
async function previewPng(
  renderer: THREE.WebGLRenderer,
  pieces: readonly Piece[],
  box: THREE.Box3,
  header: ExportData,
  decals: DecalTextures,
): Promise<Uint8Array> {
  renderer.toneMapping = THREE.NeutralToneMapping;
  const aspect = PREVIEW_WIDTH / PREVIEW_HEIGHT;
  const side = new THREE.PerspectiveCamera(40, aspect);
  side.position.set(0, 0, 1);
  side.lookAt(0, 0, 0);
  const camera = exportCamera(box, side, aspect);

  const room = new THREE.WebGLCubeRenderTarget(ROOM_FACE_PX, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const roomScene = new RoomEnvironment();
  new THREE.CubeCamera(0.1, 100, room).update(renderer, roomScene);
  roomScene.dispose();
  const envRotation = new THREE.Euler().setFromQuaternion(camera.quaternion);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT));
  for (const { from, intensity, color } of [KEY_LIGHT, ...FILL_LIGHTS]) {
    const light = new THREE.DirectionalLight(color, intensity);
    // View-space direction, as `ViewLight`; the target stays at the origin.
    light.position.copy(from).applyQuaternion(camera.quaternion);
    scene.add(light);
  }
  const materials = addPieces(scene, pieces, (_p, _i, look) => {
    const m = finishedMaterial(look, room.texture, decals);
    m.envMapRotation = envRotation;
    return m;
  });
  try {
    const shot = captureSceneOffscreen(renderer, scene, camera, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    return await pngBytes(await snapshotWithHeader(shot, header, 'png'));
  } finally {
    for (const m of materials) m.dispose();
    room.dispose();
  }
}

// Each piece's view-space distance as 16 bits in red and green, for the thumbnail's depth layer.
const depthMaterial = (near: number, far: number) =>
  new THREE.ShaderMaterial({
    uniforms: { near: { value: near }, far: { value: far } },
    vertexShader: /* glsl */ `
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float near;
      uniform float far;
      varying float vDepth;
      void main() {
        float v = floor(clamp((vDepth - near) / (far - near), 0.0, 1.0) * 65535.0 + 0.5);
        gl_FragColor = vec4(floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, 0.0, 1.0);
      }
    `,
  });

/** A color given as its stored bytes: render targets skip three's sRGB encoding. */
const raw = (style: string): THREE.Color => new THREE.Color().setStyle(style, THREE.LinearSRGBColorSpace);

/**
 * As desktop's `RocketFigure3d.renderOffscreenFlatLayers` and `RocketThumbnail`: the finished rocket unlit, with an
 * orthographic camera, nose up-left at 45°, outlined and averaged down from twice the size.
 */
async function thumbnailPng(
  renderer: THREE.WebGLRenderer,
  pieces: readonly Piece[],
  box: THREE.Box3,
  decals: DecalTextures,
) {
  const n = Math.min(THUMBNAIL_SIZE * SUPERSAMPLING, Math.floor(renderer.capabilities.maxTextureSize / 2) * 2);
  const center = box.getCenter(new THREE.Vector3());
  // Image up is the nose's direction (−X) turned 45° toward the view's up, which puts the nose up-left.
  const up = new THREE.Vector3(-1, 1, 0).normalize();
  const right = new THREE.Vector3(1, 1, 0).normalize();
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  let extent = 0;
  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z);
    extent = Math.max(extent, Math.abs(corner.dot(up)), Math.abs(corner.dot(right)));
  }
  const h = extent / (1 - 2 * THUMBNAIL_MARGIN);
  const dist = half.z * 2 + h;
  const near = Math.max(1e-4, dist - half.z * 1.5 - 1e-3);
  const far = dist + half.z * 1.5 + 1e-3;
  const camera = new THREE.OrthographicCamera(-h, h, h, -h, near, far);
  camera.up.copy(up);
  camera.position.set(center.x, center.y, center.z + dist);
  camera.lookAt(center);
  camera.updateMatrixWorld();

  const target = new THREE.WebGLRenderTarget(n, n, { type: THREE.UnsignedByteType, depthBuffer: true });
  const prevTarget = renderer.getRenderTarget();
  const layer = (paint: (scene: THREE.Scene) => THREE.Material[]): Uint8ClampedArray => {
    const scene = new THREE.Scene();
    const materials = paint(scene);
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      const pixels = new Uint8Array(n * n * 4);
      renderer.readRenderTargetPixels(target, 0, 0, n, n, pixels);
      return flipRows(pixels, n, n);
    } finally {
      for (const m of materials) m.dispose();
    }
  };
  try {
    const color = layer((scene) =>
      addPieces(scene, pieces, (_p, _i, look) =>
        withDecal(
          look.opacity < 1
            ? new THREE.MeshBasicMaterial({
                color: raw(look.color),
                transparent: true,
                opacity: look.opacity,
                depthWrite: false,
              })
            : new THREE.MeshBasicMaterial({ color: raw(look.color) }),
          look,
          decals,
          'raw',
        ),
      ),
    );
    unpremultiply(color);
    const ids = layer((scene) =>
      addPieces(scene, pieces, (_p, i) => {
        const id = i + 1;
        return new THREE.MeshBasicMaterial({
          color: new THREE.Color().setRGB(
            ((id >> 16) & 255) / 255,
            ((id >> 8) & 255) / 255,
            (id & 255) / 255,
            THREE.LinearSRGBColorSpace,
          ),
        });
      }),
    );
    const packed = layer((scene) => {
      const m = depthMaterial(near, far);
      addPieces(scene, pieces, () => m);
      return [m];
    });
    const pxPerUnit = n / (2 * h);
    const depth = new Float32Array(n * n);
    for (let o = 0; o < depth.length; o++) {
      depth[o] = (((packed[o * 4]! << 8) | packed[o * 4 + 1]!) / 65535) * (far - near) * pxPerUnit;
    }
    const pixels = composeThumbnail(color, ids, depth, n);
    if (!pixels) throw new Error('nothing drawn');
    const size = n / SUPERSAMPLING;
    const { canvas, ctx } = canvas2d(size, size);
    const image = ctx.createImageData(size, size);
    image.data.set(pixels);
    ctx.putImageData(image, 0, 0);
    return await pngBytes(await encodeCanvas(canvas, 'png'));
  } finally {
    renderer.setRenderTarget(prevTarget);
    target.dispose();
  }
}

/** Blending onto transparent black leaves color times alpha; the thumbnail composes straight alpha. */
function unpremultiply(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a === 0 || a === 255) continue;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round((rgba[i + c]! * 255) / a);
  }
}
