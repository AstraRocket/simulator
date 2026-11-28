import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TileSourceId } from '../../services/map/slippyMap';
import type { TerrainField } from '../../services/map/terrainTiles';
import { terrainPlane } from './terrainMesh';
import type { useGroundLayer } from '../common/map/useTileVerdict';
import { FlightGroundMap } from './FlightGroundMap';
import type { FlightScene } from './flightScene';
import { GROUND_LAYER, GROUND_ROTATION } from './groundMapLayout';
import { useSceneColors } from './sceneColors';

const MIN_HAZE = 220;
// The floor's edge, in haze lengths: past this it is all haze.
const FLOOR_REACH = 3;

export function FlightGround({
  scene,
  bounds,
  site,
  mapSource,
  ground,
  radiusM,
  terrain,
}: {
  scene: FlightScene;
  bounds: THREE.Box3;
  site: { lat: number; lon: number } | null;
  mapSource: TileSourceId | null;
  ground: ReturnType<typeof useGroundLayer>;
  radiusM: number;
  terrain: TerrainField | null;
}) {
  const { unitsPerMeter } = scene;
  const haze = useMemo(() => {
    let far = 0;
    for (const v of [bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z]) far = Math.max(far, Math.abs(v));
    return Math.max(MIN_HAZE, far * 6);
  }, [bounds]);
  return (
    <>
      <GroundFloor haze={haze} unitsPerMeter={unitsPerMeter} under={terrain != null} />
      {mapSource && site ? (
        <FlightGroundMap
          latitudeDeg={site.lat}
          longitudeDeg={site.lon}
          radiusM={radiusM}
          unitsPerMeter={unitsPerMeter}
          source={mapSource}
          terrain={terrain}
          onTileLoad={ground.onTileLoad}
          onTileError={ground.onTileError}
        />
      ) : (
        terrain && <TerrainSurface field={terrain} unitsPerMeter={unitsPerMeter} />
      )}
    </>
  );
}

// The bare ground, with no map over it: a cell between each pair of height samples.
function TerrainSurface({ field, unitsPerMeter }: { field: TerrainField; unitsPerMeter: number }) {
  const ink = useSceneColors();
  const geometry = useMemo(
    () => terrainPlane(field, field.halfWidthM * 2 * unitsPerMeter, field.n - 1, 0, 0, unitsPerMeter),
    [field, unitsPerMeter],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} rotation={GROUND_ROTATION}>
      <meshBasicMaterial color={ink['scene-floor']} vertexColors toneMapped={false} />
    </mesh>
  );
}

/**
 * The floor and its grid under haze; a map, when there is one, draws between the two by render order. `under`
 * keeps the floor out of the depth buffer, so terrain lower than the pad is not hidden behind it.
 */
export function GroundFloor({
  haze,
  unitsPerMeter,
  under = false,
}: {
  haze: number;
  unitsPerMeter: number;
  under?: boolean;
}) {
  const ink = useSceneColors();
  const floor = useMemo(() => new THREE.CircleGeometry(haze * FLOOR_REACH, 96), [haze]);
  useEffect(() => () => floor.dispose(), [floor]);
  const line = ink['scene-grid'];
  const minor = ink['scene-grid-minor'];
  const horizon = ink['scene-horizon'];
  const grid = useMemo(
    () => gridMaterial(line, minor, horizon, haze, unitsPerMeter),
    [line, minor, horizon, haze, unitsPerMeter],
  );
  useEffect(() => () => grid.dispose(), [grid]);
  return (
    <>
      <mesh geometry={floor} rotation={GROUND_ROTATION} renderOrder={GROUND_LAYER.floor}>
        <meshBasicMaterial color={ink['scene-floor']} toneMapped={false} depthWrite={!under} />
      </mesh>
      <mesh geometry={floor} material={grid} rotation={GROUND_ROTATION} renderOrder={GROUND_LAYER.grid} />
    </>
  );
}

/** Lines every meter, 10 m, 100 m…, each set fading in as the camera nears, under haze that thickens with distance. */
function gridMaterial(
  line: string,
  minor: string,
  horizon: string,
  haze: number,
  unitsPerMeter: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GRID_VERTEX,
    fragmentShader: GRID_FRAGMENT,
    uniforms: {
      uLine: { value: new THREE.Color(line) },
      uMinor: { value: new THREE.Color(minor) },
      uHorizon: { value: new THREE.Color(horizon) },
      uHaze: { value: haze },
      uUnits: { value: unitsPerMeter },
    },
    // Blended, but with the opaque ground, before the rocket.
    transparent: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    // Keeps the canvas opaque, or the page shows through.
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
  });
}

const GRID_VERTEX = `
varying vec2 vAt;
varying float vAway;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vAt = world.xz;
  vAway = length(world.xz - cameraPosition.xz);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}`;

const GRID_FRAGMENT = `
uniform vec3 uLine;
uniform vec3 uMinor;
uniform vec3 uHorizon;
uniform float uHaze;
uniform float uUnits;
varying vec2 vAt;
varying float vAway;
#include <logdepthbuf_pars_fragment>
float lines(vec2 at, float cell) {
  vec2 p = at / cell;
  vec2 w = fwidth(p);
  vec2 d = abs(fract(p - 0.5) - 0.5) / max(w, vec2(1e-6));
  vec2 on = (1.0 - min(d, 1.0)) * (1.0 - smoothstep(0.12, 0.4, w));
  return max(on.x, on.y);
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 m = vAt / uUnits;
  float pixel = max(length(fwidth(m)) * 0.7071, 1e-5);
  // The finest set still drawn: ten pixels or so a cell.
  float level = max(log(pixel * 10.0) / log(10.0), 0.0);
  float base = pow(10.0, floor(level));
  float fade = 1.0 - fract(level);
  float fine = lines(m, base);
  float mid = lines(m, base * 10.0);
  float wide = lines(m, base * 100.0);
  // Each set takes over the next finer one's weight as it fades out.
  float on = max(max(fine * 0.6 * fade, mid * mix(0.6, 1.0, fade)), wide);
  vec3 c = mix(uMinor, uLine, max(wide, mid * fade));
  float hazed = 1.0 - exp(-pow(vAway / uHaze, 2.0) * 1.6);
  gl_FragColor = vec4(mix(c, uHorizon, hazed), max(on, hazed));
  #include <colorspace_fragment>
}`;
