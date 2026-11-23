// cspell:ignore glsl -- shader source
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PhotoSettings, Rgba } from '../../../services/design/photoSettings';
import { piecesBounds, type Piece } from '../rocketPieces';
import { addPieces, finishedMaterial, type DecalTextures } from '../finishedScene';
import { skyWraps } from './photoSkies';
import { coverFit } from './customBackground';

// Desktop's Photo Studio (`PhotoPanel`) drawn with three.js: the same camera, rocket pose, light and backgrounds, and
// the same effects at each motor, lit and shaded as this app's 3D views are rather than by desktop's shaders.

export interface PhotoInput {
  pieces: readonly Piece[];
  settings: PhotoSettings;
  /** Desktop turns the motor effects off when the configuration flies no motor. */
  hasMotors: boolean;
  /** The chosen sky, once loaded; null draws the sky color in its place, as desktop does for a missing sky. */
  sky: THREE.Texture | null;
  decals: DecalTextures;
  /** A picture of the user's own, shown in place of the saved background for this session only. */
  custom?: THREE.Texture | null;
}

// Light levels picked so the defaults look as desktop's do under this app's tone mapping.
const SUN_LEVEL = 2.2;
const AMBIENT_LEVEL = 4;
const BLUR_SAMPLES = 16;
const SHADOW_MAP_PX = 2048;
/** Of the rocket's length, per unit of desktop's 0-20 blur amount. */
const BLUR_PER_UNIT = 0.02;

const rgb = (c: Rgba) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);

/** `PhotoPanel.applyCamera`: at (−d·sin az·cos alt, d·sin alt, d·cos az·cos alt), its up turned with it. */
export function photoCamera(s: PhotoSettings, aspect: number, span: number): THREE.PerspectiveCamera {
  const d = s.viewDistance;
  const { viewAlt: alt, viewAz: az } = s;
  const fovDeg = THREE.MathUtils.radToDeg(Math.min(Math.max(s.fov, 0.01), Math.PI - 0.01));
  const cam = new THREE.PerspectiveCamera(fovDeg, aspect, Math.max(1e-4, d * 0.002), d + span * 20 + 1);
  cam.position.set(-d * Math.sin(az) * Math.cos(alt), d * Math.sin(alt), d * Math.cos(az) * Math.cos(alt));
  cam.up.set(Math.sin(alt) * Math.sin(az), Math.cos(alt), -Math.sin(alt) * Math.cos(az));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

/** `PhotoPanel.applyLighting`: the way to the sun, from its altitude and azimuth. */
export function sunDirection(s: PhotoSettings): THREE.Vector3 {
  const { lightAlt: alt, lightAz: az } = s;
  return new THREE.Vector3(-Math.cos(alt) * Math.cos(az), Math.sin(alt), -Math.cos(alt) * Math.sin(az));
}

/** `PhotoPanel.applyRocketTransform`: centered on its middle, moved by the advance, then pitched, yawed and rolled. */
export function rocketPose(s: PhotoSettings, centerX: number): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeRotationZ(-s.pitch)
    .multiply(new THREE.Matrix4().makeRotationY(s.yaw))
    .multiply(new THREE.Matrix4().makeRotationX(s.roll))
    .multiply(new THREE.Matrix4().makeTranslation(-(centerX + s.advance), 0, 0));
}

interface Nozzle {
  at: THREE.Vector3;
  r: number;
}

/** Each motor's aft end, in the rocket's own frame. */
function nozzles(pieces: readonly Piece[]): Nozzle[] {
  return pieces
    .filter((p) => p.key.startsWith('motor'))
    .map((p) => {
      const box = piecesBounds([p]);
      const c = box.getCenter(new THREE.Vector3());
      return { at: new THREE.Vector3(box.max.x, c.y, c.z), r: (box.max.y - box.min.y) / 2 };
    })
    .filter((n) => n.r > 0);
}

// Seeded, so the smoke and sparks hold still between redraws.
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flameLength = (n: Nozzle, s: PhotoSettings) => n.r * 10 * s.exhaustScale * s.flameAspectRatio;

/** Wide at the nozzle, tapering aft, hot white at its root into the flame color. */
function flame(n: Nozzle, s: PhotoSettings, made: Disposable[]): THREE.Object3D {
  const group = new THREE.Group();
  const outer = rgb(s.flameColor);
  for (const [k, len, hot] of [
    [1, 1, new THREE.Color('#fff2c8')],
    [0.5, 0.55, new THREE.Color('#ffffff')],
  ] as const) {
    const L = flameLength(n, s) * len;
    const geo = new THREE.ConeGeometry(n.r * 0.9 * s.exhaustScale * k, L, 32, 8, true);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(L / 2, 0, 0);
    const pos = geo.getAttribute('position');
    const col: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const u = THREE.MathUtils.clamp(pos.getX(i) / L, 0, 1);
      const c = u < 0.3 ? hot.clone().lerp(outer, u / 0.3) : outer.clone().multiplyScalar(1 - (u - 0.3) / 0.7);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    made.push(geo, mat);
    group.add(new THREE.Mesh(geo, mat));
  }
  group.position.copy(n.at);
  return group;
}

const SMOKE_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z;
  vAlpha = aAlpha;
}`;
const SMOKE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColor, vAlpha * (1.0 - d * d));
  #include <colorspace_fragment>
}`;

/** A trail of soft puffs, growing and thinning aft, at the smoke color's opacity. */
function smoke(
  n: Nozzle,
  s: PhotoSettings,
  span: number,
  made: Disposable[],
): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const rand = random(7);
  const count = 90;
  const reach = (span * 2 + flameLength(n, s)) * s.exhaustScale;
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const opacity = s.smokeColor[3] / 255;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const spread = n.r * s.exhaustScale * (0.5 + 5 * t);
    pos.set(
      [
        n.at.x + flameLength(n, s) * 0.4 + t * reach,
        n.at.y + (rand() - 0.5) * spread,
        n.at.z + (rand() - 0.5) * spread,
      ],
      i * 3,
    );
    size[i] = n.r * 3 * s.exhaustScale * (1 + 6 * Math.sqrt(t));
    alpha[i] = opacity * 0.6 * (1 - t) ** 1.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    uniforms: { uScale: { value: 1 }, uColor: { value: rgb(s.smokeColor) } },
    transparent: true,
    depthWrite: false,
  });
  made.push(geo, mat);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/** Sparks thrown aft, as many as the concentration asks, falling toward the ground by their weight. */
function sparks(n: Nozzle, s: PhotoSettings, down: THREE.Vector3, made: Disposable[]): THREE.Points {
  const rand = random(11);
  const count = Math.round(600 * s.sparkConcentration);
  const reach = flameLength(n, s) * 3;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const hot = rgb(s.flameColor).lerp(new THREE.Color('#ffffff'), 0.5);
  const ember = new THREE.Color('#ff7a1a');
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = rand();
    const a = rand() * Math.PI * 2;
    const spread = n.r * s.exhaustScale * (0.3 + 6 * t * rand());
    const fall = s.sparkWeight * reach * t * t;
    pos.set(
      [
        n.at.x + t * reach + down.x * fall,
        n.at.y + Math.cos(a) * spread + down.y * fall,
        n.at.z + Math.sin(a) * spread + down.z * fall,
      ],
      i * 3,
    );
    c.copy(hot)
      .lerp(ember, Math.min(1, t * 1.5))
      .multiplyScalar(1 - t * 0.8);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size: n.r * 0.18 * Math.max(0.2, s.exhaustScale),
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  made.push(geo, mat);
  return new THREE.Points(geo, mat);
}

type Disposable = { dispose: () => void };

/** A top-to-bottom gradient behind everything (`GradientBackground`). */
function gradient(top: Rgba, bottom: Rgba): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `rgb(${top.slice(0, 3).join(',')})`);
    g.addColorStop(1, `rgb(${bottom.slice(0, 3).join(',')})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rooms = new WeakMap<THREE.WebGLRenderer, THREE.WebGLCubeRenderTarget>();

/** The studio room the design view reflects, for a background with nothing to reflect. */
function room(renderer: THREE.WebGLRenderer): THREE.Texture {
  let target = rooms.get(renderer);
  if (!target) {
    target = new THREE.WebGLCubeRenderTarget(64, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const scene = new RoomEnvironment();
    new THREE.CubeCamera(0.1, 100, target).update(renderer, scene);
    scene.dispose();
    rooms.set(renderer, target);
  }
  return target.texture;
}

export function disposePhotoRenderer(renderer: THREE.WebGLRenderer): void {
  rooms.get(renderer)?.dispose();
  rooms.delete(renderer);
  renderer.dispose();
}

/**
 * Draws the photo onto `out` at its size. With motion blur the rocket is drawn several times along its axis and
 * averaged over a background drawn once, as desktop blurs the rocket and not the sky.
 */
export function drawPhoto(renderer: THREE.WebGLRenderer, input: PhotoInput, out: HTMLCanvasElement): void {
  const { pieces, settings: s } = input;
  const w = out.width;
  const h = out.height;
  const ctx = out.getContext('2d');
  if (!ctx || w < 1 || h < 1) return;
  const made: Disposable[] = [];
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.NeutralToneMapping;

    const box = piecesBounds([...pieces]);
    const span = box.isEmpty() ? 0.3 : Math.max(box.max.x - box.min.x, 0.05);
    const centerX = box.isEmpty() ? 0 : (box.min.x + box.max.x) / 2;
    const camera = photoCamera(s, w / h, span);

    const scene = new THREE.Scene();
    let clear: [THREE.Color, number] = [new THREE.Color(0, 0, 0), 0];
    const sky = s.backgroundType === 'TEXTURE' && !input.custom ? input.sky : null;
    if (input.custom) {
      coverFit(input.custom, w / h);
      scene.background = input.custom;
    } else if (s.backgroundType === 'GRADIENT') {
      const g = gradient(s.gradientTopColor, s.gradientBottomColor);
      made.push(g);
      scene.background = g;
    } else if (sky) scene.background = sky;
    else clear = [rgb(s.skyColor), s.skyColor[3] / 255];

    const envMap = sky && skyWraps(sky) ? sky : room(renderer);
    const roomTurn = envMap === sky ? null : new THREE.Euler().setFromQuaternion(camera.quaternion);

    scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_LEVEL * s.ambiance));
    const sun = new THREE.DirectionalLight(rgb(s.sunlight), SUN_LEVEL * s.lightStrength);
    // Desktop's `ShadowPass`: the rocket shades itself, fins on the tube and the tube on the fins. The shadow
    // camera looks down the sun's line at the whole rocket, which sits about the origin.
    const reach = span * 0.75;
    sun.position.copy(sunDirection(s)).multiplyScalar(reach * 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_PX, SHADOW_MAP_PX);
    Object.assign(sun.shadow.camera, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      near: 0,
      far: reach * 6,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = span * 0.002;
    made.push(sun);
    scene.add(sun);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pose = new THREE.Group();
    pose.matrixAutoUpdate = false;
    pose.matrix.copy(rocketPose(s, centerX));
    scene.add(pose);
    const body = new THREE.Group();
    pose.add(body);
    made.push(
      ...addPieces(body, pieces, (_p, _i, look) => {
        const m = finishedMaterial(look, envMap, input.decals);
        if (roomTurn) m.envMapRotation = roomTurn;
        return m;
      }),
    );
    for (const part of body.children) {
      part.castShadow = true;
      part.receiveShadow = true;
    }

    if (input.hasMotors && (s.flame || s.smoke || s.sparks)) {
      // The ground's way down, in the rocket's own frame, for the sparks to fall.
      const down = new THREE.Vector3(0, -1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(pose.matrix).invert());
      for (const n of nozzles(pieces)) {
        if (s.smoke) {
          const puffs = smoke(n, s, span, made);
          const uScale = puffs.material.uniforms['uScale'];
          if (uScale) uScale.value = (h * camera.projectionMatrix.elements[5]) / 2;
          body.add(puffs);
        }
        if (s.flame) body.add(flame(n, s, made));
        if (s.sparks) body.add(sparks(n, s, down, made));
      }
    }

    ctx.clearRect(0, 0, w, h);
    const blur = s.motionBlurred ? s.motionBlurAmount * BLUR_PER_UNIT * span : 0;
    if (blur <= 0) {
      renderer.setClearColor(clear[0], clear[1]);
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, 0, 0);
      return;
    }
    // The background alone, then the rocket on clear glass, averaged along its axis.
    body.visible = false;
    renderer.setClearColor(clear[0], clear[1]);
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, 0, 0);
    body.visible = true;
    const background = scene.background;
    scene.background = null;
    const acc = document.createElement('canvas');
    acc.width = w;
    acc.height = h;
    const acc2d = acc.getContext('2d');
    if (!acc2d) return;
    // Adding each sample at 1/N sums their premultiplied colors to the average.
    acc2d.globalCompositeOperation = 'lighter';
    acc2d.globalAlpha = 1 / BLUR_SAMPLES;
    renderer.setClearColor(0x000000, 0);
    for (let i = 0; i < BLUR_SAMPLES; i++) {
      // Trailing: the rocket flies nose first, toward its −X.
      body.position.x = (i / (BLUR_SAMPLES - 1)) * blur;
      body.updateMatrixWorld();
      renderer.render(scene, camera);
      acc2d.drawImage(renderer.domElement, 0, 0);
    }
    scene.background = background;
    ctx.drawImage(acc, 0, 0);
  } finally {
    for (const d of made) d.dispose();
  }
}
