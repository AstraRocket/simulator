import { memo, useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { FlightBody } from '../../services/flight/flightBodies';
import type { MountBurn, Pop } from '../../services/flight/flightSources';
import { chargeMouth, type Airframe } from '../../services/flight/airframe';
import type { Exhaust } from '../../services/motors/exhaust';
import type { BodySpan, Extent } from './bodyMotion';
import type { FlightScene } from './flightScene';
import type { FlightTrack } from './flightTrack';
import type { Nozzle } from './rocketPieces';
import { blastPuffs, dustPuffs, popPuffs, trailPuffs, type Puff, type SmokeFlight } from './smokeTrail';

const LIFE_SHARE = 0.35;
const MIN_LIFE_S = 4;
const MAX_LIFE_S = 30;

/** Every puff is a function of flight time alone, so scrubbing back restores the trail exactly. */
export const FlightSmoke = memo(function FlightSmoke({
  scene,
  bodies,
  spans,
  extents,
  burns,
  pops,
  nozzles,
  exhausts,
  radius,
  airframes,
  effects,
  scaleRef,
  progressRef,
}: {
  scene: FlightScene;
  bodies: readonly FlightBody[];
  spans: readonly (readonly BodySpan[])[];
  /** Each body's own. */
  extents: readonly Extent[];
  burns: readonly MountBurn[];
  pops: readonly Pop[];
  nozzles: readonly Nozzle[];
  exhausts: Readonly<Record<string, Exhaust>> | undefined;
  /** The airframe's, in meters. */
  radius: number;
  airframes: readonly Airframe[];
  effects: boolean;
  /** Scene units per meter of rocket, as drawn this frame. */
  scaleRef: RefObject<number>;
  progressRef: RefObject<number>;
}) {
  const { tracks, duration, unitsPerMeter } = scene;
  const puffs = useMemo(() => {
    const flight: SmokeFlight = { bodies, tracks, spans, unitsPerMeter };
    return [
      ...trailPuffs(flight, burns, nozzles, exhausts),
      ...popPuffs(flight, pops, (body, time) => chargeMouth(airframes, body, time, extents[body]?.fore ?? 0), radius),
      ...(effects ? blastPuffs(flight, burns, nozzles, exhausts) : []),
      ...(effects ? dustPuffs(flight, tracks.map(landing), radius) : []),
    ];
  }, [bodies, tracks, spans, unitsPerMeter, burns, nozzles, exhausts, pops, extents, radius, airframes, effects]);
  const { geometry, material, advance } = useMemo(() => smokeParts(puffs, unitsPerMeter), [puffs, unitsPerMeter]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const life = THREE.MathUtils.clamp(duration * LIFE_SHARE, MIN_LIFE_S, MAX_LIFE_S);
  useFrame(() => advance(progressRef.current * duration, scaleRef.current, life));
  if (!puffs.length) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
});

const landing = (track: FlightTrack, body: number) => ({ body, speed: Math.abs(track.vels.at(-1) ?? 0) });

function smokeParts(puffs: readonly Puff[], unitsPerMeter: number) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.instanceCount = puffs.length;
  const set = (name: string, size: number, of: (p: Puff, i: number) => readonly number[]) => {
    const data = new Float32Array(puffs.length * size);
    puffs.forEach((p, i) => data.set(of(p, i), i * size));
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(data, size));
  };
  const color = new THREE.Color();
  set('aAt', 3, (p) => p.at.toArray());
  set('aArm', 3, (p) => p.arm.toArray());
  set('aBurst', 3, (p) => p.burst.toArray());
  set('aDrift', 3, (p) => p.drift.toArray());
  set('aColor', 3, (p) => color.set(p.color).toArray());
  set('aTimeSizeAlphaSeed', 4, (p, i) => [p.time, p.size, p.alpha, (i * 0.618034) % 1]);
  const time = { value: 0 };
  const scale = { value: 1 };
  const life = { value: 1 };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uTime: time, uScale: scale, uLife: life, uTrue: { value: unitsPerMeter } },
    transparent: true,
    depthWrite: false,
  });
  const advance = (t: number, modelScale: number, seconds: number): void => {
    time.value = t;
    scale.value = modelScale;
    life.value = seconds;
  };
  return { geometry, material, advance };
}

const VERTEX = `
attribute vec3 aAt;
attribute vec3 aArm;
attribute vec3 aBurst;
attribute vec3 aDrift;
attribute vec3 aColor;
attribute vec4 aTimeSizeAlphaSeed;
uniform float uTime;
uniform float uScale;
uniform float uTrue;
uniform float uLife;
varying vec2 vAt;
varying float vAlpha;
varying vec3 vColor;
varying float vSeed;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  float age = uTime - aTimeSizeAlphaSeed.x;
  float u = age / uLife;
  float seed = aTimeSizeAlphaSeed.w;
  // Off the screen until it is let go; a t = 0 puff would hang round the rocket on the pad.
  if (age <= 0.0 || u > 1.6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float size = aTimeSizeAlphaSeed.y * uScale * (0.5 + 0.5 * smoothstep(0.0, 0.15, age)) * (1.0 + 0.9 * sqrt(age));
  float thrown = 1.0 - exp(-4.0 * age);
  vec3 c = aAt + uScale * (aArm + aBurst * thrown) + aDrift * age;
  // Wanders off the line it was laid on, and rises.
  float wander = size * 0.22 * smoothstep(0.0, 1.5, age);
  c += wander * vec3(sin(seed * 81.0 + age * 0.5), sin(seed * 57.0 + age * 0.4), cos(seed * 93.0 + age * 0.45));
  c.y = max(c.y + size * 0.1 * sqrt(age), size * 0.3);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float spin = seed * 6.2832 + age * (seed - 0.5) * 0.5;
  vec2 turned = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * position.xy;
  mv.xy += turned * size;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  vAt = position.xy * 2.0;
  vSeed = seed;
  vColor = aColor * (0.86 + 0.2 * (position.x * sin(spin) + position.y * cos(spin)));
  // Enlarged, they overlap that many times over.
  float a = 1.0 - pow(1.0 - min(aTimeSizeAlphaSeed.z, 0.98), clamp(uTrue / uScale, 0.0, 1.0));
  // Clears as the camera goes into it.
  vAlpha = a * exp(-3.0 * u) * smoothstep(0.4 * size, 1.5 * size, -mv.z);
}`;

const FRAGMENT = `
varying vec2 vAt;
varying float vAlpha;
varying vec3 vColor;
varying float vSeed;
#include <logdepthbuf_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vAt * 2.2 + vSeed * 61.0;
  float n = 0.65 * noise(p) + 0.35 * noise(p * 2.3);
  float d = length(vAt) + (n - 0.5) * 0.55;
  float body = 1.0 - smoothstep(0.25, 0.95, d);
  if (body <= 0.0) discard;
  gl_FragColor = vec4(vColor * (0.9 + 0.2 * n), vAlpha * body);
  #include <colorspace_fragment>
}`;
