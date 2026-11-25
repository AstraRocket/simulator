import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { FlightBody } from '../../services/flight/flightBodies';
import { seriesAt } from '../../services/flight/flightEvents';
import { burnLevel, type MountBurn, type Pop } from '../../services/flight/flightSources';
import { DEFAULT_EXHAUST, type Exhaust } from '../../services/motors/exhaust';
import type { Extent } from './bodyMotion';
import { glow } from './glowMaterial';
import { GROUND_LAYER, GROUND_ROTATION } from './groundMapLayout';
import type { Nozzle } from './rocketPieces';

interface Timed {
  progressRef: RefObject<number>;
  /** Seconds, the whole replay. */
  duration: number;
}

/** A glowing disc, disposed with its component, and a setter for its strength and color. */
function useDisc(vertexShader: string, color: THREE.Color, depthTest = true) {
  const disc = useMemo(() => {
    const uAlpha = { value: 0 };
    const uColor = { value: color.clone() };
    const material = glow(vertexShader, DISC_FRAGMENT, { uColor, uAlpha });
    material.depthTest = depthTest;
    const dim = (v: number, c?: string): void => {
      uAlpha.value = v;
      if (c) uColor.value.set(c);
    };
    return { material, dim };
  }, [vertexShader, color, depthTest]);
  useEffect(() => () => disc.material.dispose(), [disc]);
  return disc;
}

const FLASH_SECONDS = 0.16;
const FLASH_COLOR = new THREE.Color(1, 0.72, 0.32);

/** A charge lighting the front of its bay, in the rocket's frame. */
export function EjectionFlash({
  pop,
  at,
  radius,
  progressRef,
  duration,
}: Timed & { pop: Pop; at: number; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const { material, dim } = useDisc(BILLBOARD_VERTEX, FLASH_COLOR);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const u = (progressRef.current * duration - pop.time) / FLASH_SECONDS;
    mesh.visible = u > 0 && u < 1;
    dim((1 - u) * (1 - u) * 1.6);
    mesh.scale.setScalar(radius * (6 + 8 * u));
  });
  return (
    <mesh ref={ref} position={[at, 0, 0]} material={material} visible={false} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

const SONIC_WIDTH = 0.035;
const CONE_ALPHA = 0.5;

/** The cloud a body pushes through the speed of sound. For looks: whether one forms depends on the air. */
export function VaporCone({
  body,
  extent,
  radius,
  progressRef,
  duration,
}: Timed & { body: FlightBody; extent: Extent; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const { geometry, material, dim } = useMemo(() => {
    const alpha = { value: 0 };
    const set = (v: number): void => {
      alpha.value = v;
    };
    return {
      geometry: coneGeometry(),
      material: glow(CONE_VERTEX, CONE_FRAGMENT, { uAlpha: alpha }),
      dim: set,
    };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const mach = seriesAt(body.branch.series, 'mach', progressRef.current * duration) ?? 0;
    const near = (mach - 1) / SONIC_WIDTH;
    const alpha = CONE_ALPHA * Math.exp(-near * near);
    mesh.visible = alpha > 0.01;
    dim(alpha);
    // Grows as it nears the speed of sound.
    mesh.scale.set(radius * 7, radius * (3.4 + near * 0.4), radius * (3.4 + near * 0.4));
  });
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      position={[extent.fore + (extent.aft - extent.fore) * 0.5, 0, 0]}
      visible={false}
      frustumCulled={false}
      renderOrder={1}
    />
  );
}

/** Opens from the airframe at its origin to a rim 1 out, 1 along +X. */
function coneGeometry(): THREE.BufferGeometry {
  const STEPS = 16;
  const profile = Array.from({ length: STEPS + 1 }, (_, i) => {
    const x = i / STEPS;
    return new THREE.Vector2(0.3 + 0.7 * Math.sqrt(x), x);
  });
  return new THREE.LatheGeometry(profile, 48).rotateZ(-Math.PI / 2);
}

const LIGHT_INTENSITY = 5;
const LIGHT_RANGE = 16; // airframe radii
const POOL_RADII = 22; // motor radii
const POOL_HEIGHT = 24;
const POOL_COLOR = new THREE.Color();

/** The brightest flame, lighting the tail and the ground under it. */
export function FlameGlow({
  burns,
  bodies,
  nozzles,
  exhausts,
  radius,
  modelRefs,
  scaleRef,
  progressRef,
  duration,
}: Timed & {
  burns: readonly MountBurn[];
  bodies: readonly FlightBody[];
  nozzles: readonly Nozzle[];
  exhausts: Readonly<Record<string, Exhaust>> | undefined;
  radius: number;
  modelRefs: RefObject<(THREE.Group | null)[]>;
  scaleRef: RefObject<number>;
}) {
  const light = useRef<THREE.PointLight>(null);
  const pool = useRef<THREE.Mesh>(null);
  const at = useMemo(() => new THREE.Vector3(), []);
  const { material, dim } = useDisc(FLAT_VERTEX, POOL_COLOR, false);
  useFrame(() => {
    if (!light.current || !pool.current) return;
    const t = progressRef.current * duration;
    let best: { burn: MountBurn; nozzle: Nozzle; power: number } | null = null;
    for (const burn of burns) {
      const level = burnLevel(burn, bodies, t);
      if (level <= 0) continue;
      const nozzle = nozzles.find((n) => n.mountId === burn.mountId);
      if (!nozzle) continue;
      const power = Math.min(1.5, level) * nozzle.radius;
      if (!best || power > best.power) best = { burn, nozzle, power };
    }
    const scale = scaleRef.current;
    const inner = best ? modelRefs.current[best.burn.body]?.children[0] : undefined;
    light.current.intensity = 0;
    pool.current.visible = false;
    if (!best || !inner) return;
    const { nozzle, power, burn } = best;
    const level = power / nozzle.radius;
    const flicker = 1 + 0.08 * Math.sin(t * 67) + 0.06 * Math.sin(t * 101 + 2);
    const color = (exhausts?.[burn.mountId] ?? DEFAULT_EXHAUST).flame[1];
    inner.updateWorldMatrix(true, false);
    inner.localToWorld(at.set(nozzle.at[0] + nozzle.radius * 4, nozzle.at[1], nozzle.at[2]));
    light.current.position.copy(at);
    light.current.color.set(color);
    light.current.distance = LIGHT_RANGE * radius * scale;
    light.current.intensity = LIGHT_INTENSITY * Math.min(1, level) * flicker;
    const height = at.y / (scale * nozzle.radius * POOL_HEIGHT);
    const lit = Math.exp(-height * height) * Math.min(1, level) * flicker;
    pool.current.visible = lit > 0.01;
    pool.current.position.set(at.x, 0, at.z);
    pool.current.scale.setScalar(nozzle.radius * POOL_RADII * 2 * scale);
    dim(0.55 * lit, color);
  });
  return (
    <>
      <pointLight ref={light} intensity={0} decay={0} />
      <mesh
        ref={pool}
        rotation={GROUND_ROTATION}
        material={material}
        visible={false}
        frustumCulled={false}
        renderOrder={GROUND_LAYER.ring}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}

const BILLBOARD_VERTEX = `
varying vec2 vAt;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vAt = position.xy * 2.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const FLAT_VERTEX = `
varying vec2 vAt;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vAt = position.xy * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

const DISC_FRAGMENT = `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vAt;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float d = 1.0 - min(1.0, length(vAt));
  float i = d * d * uAlpha;
  gl_FragColor = vec4(linearToOutputTexel(vec4(uColor, 1.0)).rgb * i, min(1.0, i) * 0.4);
}`;

const CONE_VERTEX = `
varying float vAlong;
varying float vFacing;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vAlong = position.x;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(mv.xyz)));
}`;

const CONE_FRAGMENT = `
uniform float uAlpha;
varying float vAlong;
varying float vFacing;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float i = uAlpha * smoothstep(0.0, 0.25, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong)) * (0.35 + 0.65 * (1.0 - vFacing));
  gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * i, i);
}`;
