import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { FlightBody } from '../../services/flight/flightBodies';
import { burnLevel, type MountBurn } from '../../services/flight/flightSources';
import type { Exhaust } from '../../services/motors/exhaust';
import { glow } from './glowMaterial';
import type { Nozzle } from './rocketPieces';

// In motor radii, at average thrust.
const FLAME_LENGTH = 18;
const FLAME_WIDTH = 1.05;
const CORE_LENGTH = 0.5;
const CORE_WIDTH = 0.5;
const MAX_LEVEL = 2.2;

const SPARKS = 160;
const SPARK_REACH = 60;
const SPARK_SPREAD = 11;
const SPARK_RADII = 0.55;
const EMBER = new THREE.Color('#ff7a1a');

/** The flames of one mount's motors, in the rocket's frame. */
export const MotorFlames = memo(function MotorFlames({
  burn,
  bodies,
  nozzles,
  look,
  progressRef,
  duration,
}: {
  burn: MountBurn;
  bodies: readonly FlightBody[];
  nozzles: readonly Nozzle[];
  look: Exhaust;
  progressRef: RefObject<number>;
  duration: number;
}) {
  const all = useRef<THREE.Group>(null);
  const plumes = useRef<(THREE.Group | null)[]>([]);
  const { plume, flame, core, sparks, sparkSeeds, advance } = useFlameParts(look);
  useFrame(({ camera, size, viewport }) => {
    const group = all.current;
    if (!group) return;
    // On flight time, so a paused flame holds still and a scrubbed one is the one that was played.
    const t = progressRef.current * duration;
    const level = Math.min(MAX_LEVEL, burnLevel(burn, bodies, t));
    group.visible = level > 0;
    if (!group.visible) return;
    const flicker = 1 + 0.07 * Math.sin(t * 71) + 0.05 * Math.sin(t * 113 + 1);
    nozzles.forEach((n, i) => {
      const wide = n.radius * FLAME_WIDTH * Math.sqrt(level);
      plumes.current[i]?.scale.set(n.radius * FLAME_LENGTH * level * flicker, wide, wide);
    });
    // World size to pixels at unit depth.
    advance(t, Math.min(1, level), (size.height * viewport.dpr * (camera.projectionMatrix.elements[5] ?? 1)) / 2);
  });
  return (
    <group ref={all} visible={false}>
      {nozzles.map((n, i) => (
        <group key={i} position={n.at}>
          <group
            ref={(g) => {
              plumes.current[i] = g;
            }}
          >
            <mesh geometry={plume} material={flame} renderOrder={1} />
            <mesh geometry={plume} material={core} scale={[CORE_LENGTH, CORE_WIDTH, CORE_WIDTH]} renderOrder={1} />
          </group>
          {look.sparks && (
            <points geometry={sparkSeeds} material={sparks} scale={n.radius} frustumCulled={false} renderOrder={1} />
          )}
        </group>
      ))}
    </group>
  );
});

function useFlameParts(look: Exhaust) {
  const [hot, mid, edge] = look.flame;
  const parts = useMemo(() => {
    const color = (c: string) => ({ value: new THREE.Color(c) });
    const time = { value: 0 };
    const level = { value: 1 };
    const scale = { value: 1 };
    return {
      plume: plumeGeometry(),
      sparkSeeds: seedGeometry(),
      flame: glow(FLAME_VERTEX, FLAME_FRAGMENT, { uTime: time, uFore: color(mid), uAft: color(edge) }),
      core: glow(FLAME_VERTEX, FLAME_FRAGMENT, { uTime: time, uFore: color(hot), uAft: color(mid) }),
      sparks: glow(SPARK_VERTEX, SPARK_FRAGMENT, {
        uTime: time,
        uLevel: level,
        uScale: scale,
        uHot: color(hot),
        uEmber: { value: EMBER },
      }),
      advance: (t: number, sparkLevel: number, sparkScale: number): void => {
        time.value = t;
        level.value = sparkLevel;
        scale.value = sparkScale;
      },
    };
  }, [hot, mid, edge]);
  useEffect(
    () => () => {
      const { plume, sparkSeeds, flame, core, sparks } = parts;
      for (const p of [plume, sparkSeeds, flame, core, sparks]) p.dispose();
    },
    [parts],
  );
  return parts;
}

/** From the nozzle at its origin to a point 1 along +X, 1 in radius at its widest. */
function plumeGeometry(): THREE.BufferGeometry {
  const STEPS = 28;
  const profile = Array.from({ length: STEPS + 1 }, (_, i) => {
    const x = (i / STEPS) ** 1.5;
    const swell = 0.5 + 0.5 * THREE.MathUtils.smoothstep(x, 0, 0.16);
    return new THREE.Vector2(Math.max(1e-4, swell * Math.sqrt(1 - x) * (1 - 0.35 * x)), x);
  });
  return new THREE.LatheGeometry(profile, 28).rotateZ(-Math.PI / 2);
}

function seedGeometry(): THREE.BufferGeometry {
  const seed = new Float32Array(SPARKS * 4);
  for (let i = 0; i < SPARKS; i++) {
    seed.set([(i * 0.137) % 1, (i * 2.399963) % (Math.PI * 2), (i * 0.618034) % 1, (i * 0.7548777) % 1], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  return g;
}

const FLAME_VERTEX = `
uniform float uTime;
varying float vAlong;
varying float vFacing;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vAlong = position.x;
  float around = atan(position.z, position.y);
  float wave = sin(position.x * 17.0 - uTime * 43.0 + around * 2.0) * 0.6 + sin(position.x * 31.0 - uTime * 67.0 - around * 3.0) * 0.4;
  vec3 p = vec3(position.x, position.yz * (1.0 + 0.16 * position.x * wave));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(mv.xyz)));
}`;

const FLAME_FRAGMENT = `
uniform vec3 uFore;
uniform vec3 uAft;
varying float vAlong;
varying float vFacing;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float fade = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.1);
  float i = fade * vFacing * vFacing;
  vec3 c = linearToOutputTexel(vec4(mix(uFore, uAft, smoothstep(0.0, 0.75, vAlong)), 1.0)).rgb;
  gl_FragColor = vec4(c * i, i * 0.45);
}`;

// Each spark flies anew, its way turned a little, so no streak repeats.
const SPARK_VERTEX = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uLevel;
uniform float uScale;
uniform vec3 uHot;
uniform vec3 uEmber;
varying vec3 vColor;
varying float vAlpha;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  float flown = uTime * (1.1 + aSeed.z) + aSeed.x;
  float u = fract(flown);
  float n = floor(flown);
  float angle = aSeed.y + n * 2.399963;
  float far = 0.35 + 0.65 * fract(aSeed.w + n * 0.618034);
  float wide = 0.15 + 0.85 * fract(aSeed.z + n * 0.7548777);
  float gone = 1.0 - (1.0 - u) * (1.0 - u);
  float spread = wide * (0.4 + gone * far * ${SPARK_SPREAD.toFixed(1)});
  vec3 p = vec3(gone * far * ${SPARK_REACH.toFixed(1)}, cos(angle) * spread, sin(angle) * spread);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  float size = ${SPARK_RADII.toFixed(2)} * (0.6 + 0.8 * aSeed.w) * length(modelMatrix[0].xyz);
  gl_PointSize = size * uScale / -mv.z;
  vColor = mix(uHot, uEmber, min(1.0, u * 1.6));
  vAlpha = (1.0 - u) * (1.0 - u) * uLevel;
}`;

const SPARK_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float i = vAlpha * (1.0 - d) * (1.0 - d) * 1.6;
  vec3 c = linearToOutputTexel(vec4(vColor, 1.0)).rgb;
  gl_FragColor = vec4(c * i, min(1.0, i) * 0.45);
}`;
