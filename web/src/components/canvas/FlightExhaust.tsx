import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { indexForProgress, type FlightScene, type SmokePuff } from './flightScene';
import { DELAY_SMOKE, type Exhaust } from '../../services/motors/exhaust';

export function Flame({ len, r, look }: { len: number; r: number; look: Exhaust }) {
  const ref = useRef<THREE.Mesh>(null);
  const [c0, c1, c2] = look.flame;
  const geo = useMemo(() => {
    const H = r * 5.5;
    const g = new THREE.ConeGeometry(r * 0.95, H, 24, 1, true);
    g.rotateZ(Math.PI / 2); // apex to -X
    g.translate(H / 2, 0, 0); // apex at the nozzle, base trailing at +X
    const pos = g.getAttribute('position');
    const hot = new THREE.Color(c0),
      mid = new THREE.Color(c1),
      edge = new THREE.Color(c2);
    const col: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const u = THREE.MathUtils.clamp(pos.getX(i) / H, 0, 1);
      const c = u < 0.5 ? hot.clone().lerp(mid, u / 0.5) : mid.clone().lerp(edge, (u - 0.5) / 0.5);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [r, c0, c1, c2]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.scale.set(
        1 + 0.25 * Math.sin(clock.elapsedTime * 31),
        1 + 0.09 * Math.sin(clock.elapsedTime * 44),
        1 + 0.09 * Math.sin(clock.elapsedTime * 44),
      );
  });
  return (
    <group position={[len, 0, 0]}>
      <mesh ref={ref} geometry={geo}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {look.sparks && <Sparks r={r} color={c0} />}
    </group>
  );
}

const SPARKS = 180;
const EMBER = new THREE.Color('#ff7a1a');

// Additive blending, so a spark dimmed toward black simply fades.
function Sparks({ r, color }: { r: number; color: string }) {
  const seeds = useMemo(
    () =>
      Array.from({ length: SPARKS }, (_, i) => {
        const a = (i * 2.399963) % (Math.PI * 2);
        const k = ((i * 0.618034) % 1) * 0.85 + 0.15;
        const far = 0.45 + ((i * 0.7548777) % 1) * 0.55;
        return { phase: (i * 0.137) % 1, dy: Math.cos(a) * k, dz: Math.sin(a) * k, rate: 1.1 + ((i * 0.37) % 1), far };
      }),
    [],
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const hot = useMemo(() => new THREE.Color(color), [color]);
  const c = useMemo(() => new THREE.Color(), []);
  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const { attributes } = ref.current.geometry;
    const pos = attributes.position as THREE.BufferAttribute;
    const col = attributes.color as THREE.BufferAttribute;
    const reach = r * 26;
    seeds.forEach((s, i) => {
      const u = (clock.elapsedTime * s.rate + s.phase) % 1;
      const out = 1 - (1 - u) * (1 - u);
      const spread = r * (0.5 + out * 7 * s.far);
      pos.setXYZ(i, out * reach * s.far, s.dy * spread, s.dz * spread);
      c.copy(hot)
        .lerp(EMBER, Math.min(1, u * 1.6))
        .multiplyScalar((1 - u) * (1 - u));
      col.setXYZ(i, c.r, c.g, c.b);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        vertexColors
        size={0.09}
        sizeAttenuation
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

const SMOKE_VERTEX = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z;
  vAlpha = aAlpha;
  vColor = aColor;
}`;
const SMOKE_FRAGMENT = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * d));
  #include <colorspace_fragment>
}`;

const smokeOf = (p: SmokePuff, looks: readonly Exhaust[]) =>
  p.delay ? DELAY_SMOKE : looks[Math.min(p.burn, looks.length - 1)]!;

// Stateless per frame, so scrubbing back restores the trail exactly.
export const Smoke = memo(function Smoke({
  scene,
  puffs,
  looks,
  progressRef,
  start,
}: {
  scene: FlightScene;
  puffs: readonly SmokePuff[];
  looks: readonly Exhaust[];
  progressRef: RefObject<number>;
  start: number; // scene units
}) {
  const n = puffs.length;
  const { geo, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const color = new Float32Array(n * 3);
    puffs.forEach((p, i) => {
      const c = new THREE.Color(smokeOf(p, looks).smokeColor);
      color.set([c.r, c.g, c.b], i * 3);
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      uniforms: { uScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    return { geo: g, material: m };
  }, [puffs, looks, n]);
  useEffect(
    () => () => {
      geo.dispose();
      material.dispose();
    },
    [geo, material],
  );

  const life = Math.max(3, (scene.times[scene.times.length - 1] ?? 0) * 0.35);
  const ref = useRef<THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>>(null);
  useFrame(({ camera, size, viewport }) => {
    const points = ref.current;
    if (!points) return;
    const { times } = scene;
    const nowT = times[indexForProgress(times, progressRef.current)] ?? 0;
    const { attributes } = points.geometry;
    const pos = attributes.position as THREE.BufferAttribute;
    const sz = attributes.aSize as THREE.BufferAttribute;
    const al = attributes.aAlpha as THREE.BufferAttribute;
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i]!;
      const age = nowT - p.time;
      // `<= 0`, or a t = 0 puff hangs round the rocket on the pad.
      if (age <= 0) {
        al.setX(i, 0);
        continue;
      }
      const u = age / life;
      pos.setXYZ(i, p.pos.x, p.pos.y + u * 1.2, p.pos.z);
      sz.setX(i, start * (p.delay ? 0.45 : 1) * (1 + 3 * Math.sqrt(u)));
      al.setX(i, smokeOf(p, looks).smoke * Math.exp(-3 * u));
    }
    pos.needsUpdate = true;
    sz.needsUpdate = true;
    al.needsUpdate = true;
    // World size to pixels at unit depth, for the shader's attenuation.
    const uScale = points.material.uniforms.uScale;
    if (uScale) uScale.value = (size.height * viewport.dpr * camera.projectionMatrix.elements[5]) / 2;
  });
  if (!n) return null;
  return <points ref={ref} geometry={geo} material={material} frustumCulled={false} />;
});
