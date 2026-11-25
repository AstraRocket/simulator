import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GROUND_LAYER } from './groundMapLayout';
import { useSceneColors } from './sceneColors';

/** Behind everything, all round, meeting the ground's haze at the horizon. */
export function FlightSky() {
  const ink = useSceneColors();
  const zenith = ink['scene-zenith'];
  const horizon = ink['scene-horizon'];
  const ref = useRef<THREE.Mesh>(null);
  const parts = useMemo(
    () => ({
      geometry: new THREE.SphereGeometry(1, 32, 24),
      material: new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uZenith: { value: new THREE.Color(zenith) }, uHorizon: { value: new THREE.Color(horizon) } },
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
      }),
    }),
    [zenith, horizon],
  );
  useEffect(
    () => () => {
      parts.geometry.dispose();
      parts.material.dispose();
    },
    [parts],
  );
  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.position.copy(camera.position);
    // Anywhere between the near and far planes.
    if (camera instanceof THREE.PerspectiveCamera) mesh.scale.setScalar(Math.sqrt(camera.near * camera.far));
  });
  return (
    <mesh
      ref={ref}
      geometry={parts.geometry}
      material={parts.material}
      frustumCulled={false}
      renderOrder={GROUND_LAYER.sky}
    />
  );
}

const VERTEX = `
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

const FRAGMENT = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
varying vec3 vDir;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float up = max(normalize(vDir).y, 0.0);
  gl_FragColor = vec4(mix(uHorizon, uZenith, pow(up, 0.42)), 1.0);
  #include <colorspace_fragment>
  // A slow gradient bands in 8 bits.
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`;
