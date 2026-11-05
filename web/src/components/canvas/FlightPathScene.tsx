import { memo, useCallback, useEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import type { RocketTree } from '../../engine/openRocketEngine';
import type { Piece } from './rocketPieces';
import { LookMaterial } from './LookMaterial';
import { surfacesOf } from './lookSurfaces';
import { RoomReflections } from './RoomReflections';
import { usePieces } from './usePieces';
import { mergePalette } from '../../services/design/partColors';
import { useSettings } from '../../state/useSettings';
import { EVENT_LABEL } from '../../services/flight/simReport';
import {
  burnAt,
  findRecovery,
  indexForProgress,
  modelPoseAt,
  newModelPose,
  smokePuffs,
  type FlightScene,
} from './flightScene';
import { DEFAULT_EXHAUST, type Exhaust } from '../../services/motors/exhaust';
import type { MotorDims } from '../../tree/schematicGeometry';
import { FlightGroundMap } from './FlightGroundMap';
import type { TileSourceId } from '../../services/map/slippyMap';
import type { useGroundLayer } from '../common/map/useTileVerdict';
import { MIN_EXTENT_M } from '../../services/flight/groundTrack';
import { useSceneColors } from './sceneColors';
import { Flame, Smoke } from './FlightExhaust';
import type { FlightPlayback } from './useFlightPlayback';

// The frame loop mutates the scene from `progressRef`; React hears only a throttled `progress`.
const MODEL_LEN = 1.6; // scene units
const PLAY_SECONDS = 8; // wall-clock length of a full 1x playback
const HUD_INTERVAL_MS = 100;
const MAX_PUFFS = 700;

const GROUND_MARGIN = 1.2;

export function FlightPathScene({
  scene,
  tree,
  motors,
  exhausts,
  site,
  mapSource,
  ground,
  idx,
  playback,
}: {
  scene: FlightScene;
  tree: RocketTree;
  motors?: MotorDims;
  exhausts?: readonly Exhaust[];
  site: { lat: number; lon: number } | null;
  mapSource: TileSourceId | null;
  ground: ReturnType<typeof useGroundLayer>;
  idx: number;
  playback: FlightPlayback;
}) {
  const sceneInk = useSceneColors();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const palette = useMemo(() => mergePalette(settings.partColors), [settings.partColors]);
  const phase = settings.phaseColors;
  const { playing, speed, follow, loop, progressRef, onTick, onEnd } = playback;
  const modelRef = useRef<THREE.Group>(null);
  const flameRefs = useRef<(THREE.Group | null)[]>([]);
  const recoveryRef = useRef<THREE.Group>(null);
  const trailRef = useRef<ComponentRef<typeof Line>>(null);
  // Stable, or React re-runs it (hiding the trail again) on every HUD tick.
  const attachTrail = useCallback((line: ComponentRef<typeof Line> | null) => {
    trailRef.current = line;
    if (line) line.visible = false;
  }, []);

  const { pieces, totalLen, maxR } = usePieces(tree, motors, palette);
  const modelScale = MODEL_LEN / Math.max(totalLen, 0.05);
  const recovery = useMemo(() => findRecovery(tree, palette), [tree, palette]);

  const looks = useMemo(() => (exhausts?.length ? exhausts : [DEFAULT_EXHAUST]), [exhausts]);
  const puffStart = Math.max(Math.max(maxR, 0.005) * modelScale * 3, 0.08);
  const puffs = useMemo(() => smokePuffs(scene, MAX_PUFFS, MODEL_LEN / 2, puffStart / 2), [scene, puffStart]);
  const { colors, scenePts, apogeeIdx, times, callouts } = scene;
  const n = scenePts.length;

  // A loop, not Math.max(...spread), which overflows the stack on long flights.
  const maxY = useMemo(() => {
    let m = 0;
    for (const p of scenePts) if (p.y > m) m = p.y;
    return m;
  }, [scenePts]);
  const home = useMemo(() => new THREE.Vector3(maxY * 1.15, maxY * 0.62, maxY * 1.4), [maxY]);
  const midY = maxY / 2;
  const followDist = MODEL_LEN * 3.4;

  const nowT = times[idx] ?? 0;
  const shownCallouts = useMemo(() => callouts.filter((c) => nowT >= c.time), [callouts, nowT]);

  const groundRadiusM = useMemo(() => {
    let far = 0;
    for (const p of scenePts) {
      const d = Math.max(Math.abs(p.x), Math.abs(p.z));
      if (d > far) far = d;
    }
    return Math.max(MIN_EXTENT_M, (far / scene.unitsPerMeter) * GROUND_MARGIN);
  }, [scenePts, scene.unitsPerMeter]);

  const chuteR = recovery?.kind === 'parachute' ? Math.max(0.5, (recovery.diameter / 2) * modelScale) : 0;

  // Neutral tone mapping, as the 3D model: ACES turns a lit saturated blue purple.
  return (
    <Canvas
      camera={{ position: [34, 22, 34], fov: 42 }}
      gl={{ preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping }}
    >
      <hemisphereLight args={[sceneInk['scene-sky'], sceneInk['scene-ground'], 1.5]} />
      <directionalLight position={[14, 26, 16]} intensity={1.7} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[60, 72]} />
        <meshStandardMaterial color={sceneInk['scene-floor']} roughness={1} metalness={0.05} />
      </mesh>
      {mapSource && site && (
        <FlightGroundMap
          latitudeDeg={site.lat}
          longitudeDeg={site.lon}
          radiusM={groundRadiusM}
          unitsPerMeter={scene.unitsPerMeter}
          source={mapSource}
          onTileLoad={ground.onTileLoad}
          onTileError={ground.onTileError}
        />
      )}
      <gridHelper args={[120, 60, sceneInk['scene-grid'], sceneInk['scene-grid-minor']]} position={[0, 0.02, 0]} />
      {/* Hidden through the ref, not `visible`: drei's Line spreads props onto the material, which would never draw. */}
      <Line ref={attachTrail} points={scenePts} vertexColors={colors} lineWidth={3} />
      <GroundRing pos={scenePts[0]!} color={sceneInk['scene-marker']} />
      {idx >= apogeeIdx && <Marker pos={scenePts[apogeeIdx]!} color={phase.coast} />}
      {idx >= n - 1 && <GroundRing pos={scenePts[n - 1]!} color={phase.descent} />}

      {shownCallouts.map((c) => (
        // Keyed by identity: index keys would remount callouts as the list grows.
        <Html
          key={`${c.type}@${c.time}`}
          position={[c.pos.x, c.pos.y, c.pos.z]}
          center
          // drei's default range starts at 16,777,271, above every dialog (z-50 to z-70).
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            data-flight-callout
            className="whitespace-nowrap rounded bg-surface/85 px-1.5 py-0.5 text-[10px] font-medium text-warn-300 ring-1 ring-line/10"
          >
            {t(EVENT_LABEL[c.type] ?? c.type)}
          </div>
        </Html>
      ))}

      <Smoke scene={scene} puffs={puffs} looks={looks} progressRef={progressRef} start={puffStart} />
      <RoomReflections>
        <FlyingModel
          groupRef={modelRef}
          flameRefs={flameRefs}
          looks={looks}
          pieces={pieces}
          totalLen={totalLen}
          maxR={maxR}
          modelScale={modelScale}
        />
      </RoomReflections>

      <group ref={recoveryRef} visible={false}>
        {recovery?.kind === 'parachute' && <Parachute radius={chuteR} color={recovery.color} />}
        {recovery?.kind === 'streamer' && (
          <Streamer length={recovery.length * modelScale} width={recovery.width * modelScale} color={recovery.color} />
        )}
      </group>

      <OrbitControls
        makeDefault
        enableDamping={!follow}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={3}
        maxDistance={160}
      />
      <Playback
        scene={scene}
        playing={playing}
        speed={speed}
        loop={loop}
        progressRef={progressRef}
        modelRef={modelRef}
        flameRefs={flameRefs}
        lookCount={looks.length}
        recoveryRef={recoveryRef}
        trailRef={trailRef}
        follow={follow}
        home={home}
        midY={midY}
        followDist={followDist}
        onTick={onTick}
        onEnd={onEnd}
      />
    </Canvas>
  );
}

type OrbitLike = { target: THREE.Vector3; object: THREE.Object3D; update: () => void } | null;

function Playback({
  scene,
  playing,
  speed,
  loop,
  progressRef,
  modelRef,
  flameRefs,
  lookCount,
  recoveryRef,
  trailRef,
  follow,
  home,
  midY,
  followDist,
  onTick,
  onEnd,
}: {
  scene: FlightScene;
  playing: boolean;
  speed: number;
  loop: boolean;
  progressRef: RefObject<number>;
  modelRef: RefObject<THREE.Group | null>;
  flameRefs: RefObject<(THREE.Group | null)[]>;
  lookCount: number;
  recoveryRef: RefObject<THREE.Group | null>;
  trailRef: RefObject<ComponentRef<typeof Line> | null>;
  follow: boolean;
  home: THREE.Vector3;
  midY: number;
  followDist: number;
  onTick: (progress: number) => void;
  onEnd: () => void;
}) {
  const controls = useThree((s) => s.controls) as OrbitLike;
  const pose = useMemo(() => newModelPose(), []);
  const camPrev = useRef<THREE.Vector3 | null>(null);
  const camMode = useRef<boolean | null>(null);
  const hud = useRef({ at: 0, idx: -1 });
  const camDelta = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const { scenePts, times, deployT, boostWindows: burns } = scene;
    const n = scenePts.length;
    let p = progressRef.current;
    let ended = false;
    if (playing && n >= 2) {
      p += (dt * speed) / PLAY_SECONDS;
      if (p >= 1) {
        if (loop) p -= 1;
        else {
          p = 1;
          ended = true;
        }
      }
      progressRef.current = p;
    }

    const idx = indexForProgress(times, p);
    const nowT = times[idx] ?? 0;
    const descending = nowT >= deployT;
    modelPoseAt(scenePts, idx, descending, MODEL_LEN, pose);
    const model = modelRef.current;
    if (model) {
      model.position.copy(pose.position);
      model.quaternion.copy(pose.quaternion);
    }
    // Not on the pad: the first burn opens at t = 0, which is also pre-launch.
    const burn = p > 0 ? burnAt(nowT, burns) : -1;
    const lit = burn < 0 ? -1 : Math.min(burn, lookCount - 1);
    flameRefs.current.forEach((g, i) => {
      if (g) g.visible = i === lit;
    });
    const rec = recoveryRef.current;
    if (rec) {
      rec.visible = descending;
      rec.position.copy(pose.nose);
    }
    const trail = trailRef.current;
    if (trail) {
      trail.visible = idx >= 1;
      (trail.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(0, Math.min(idx, n - 1));
    }

    const point = scenePts[idx];
    if (controls && point) {
      if (camMode.current !== follow) {
        camMode.current = follow;
        if (follow) {
          controls.target.copy(point);
          controls.object.position.set(point.x + followDist * 0.55, point.y + followDist * 0.32, point.z + followDist);
          camPrev.current = point.clone();
        } else {
          controls.target.set(0, midY, 0);
          controls.object.position.copy(home);
          camPrev.current = null;
        }
        controls.update();
      } else if (follow && camPrev.current) {
        camDelta.subVectors(point, camPrev.current);
        if (camDelta.lengthSq() > 1e-9) {
          controls.object.position.add(camDelta);
          controls.target.add(camDelta);
          controls.update();
        }
        camPrev.current.copy(point);
      }
    }

    if (ended) {
      hud.current = { at: performance.now(), idx };
      onTick(p);
      onEnd();
    } else if (playing) {
      const now = performance.now();
      if (now - hud.current.at >= HUD_INTERVAL_MS || (idx === n - 1 && hud.current.idx !== idx)) {
        hud.current = { at: now, idx };
        onTick(p);
      }
    }
  });
  return null;
}

// Memoized: the parent re-renders every HUD tick, and this has a mesh per piece.
const FlyingModel = memo(function FlyingModel({
  groupRef,
  flameRefs,
  looks,
  pieces,
  totalLen,
  maxR,
  modelScale,
}: {
  groupRef: RefObject<THREE.Group | null>;
  flameRefs: RefObject<(THREE.Group | null)[]>;
  looks: readonly Exhaust[];
  pieces: Piece[];
  totalLen: number;
  maxR: number;
  modelScale: number;
}) {
  return (
    <group ref={groupRef} scale={modelScale}>
      <group position={[-totalLen / 2, 0, 0]}>
        {pieces.map((p) => (
          <mesh key={p.key} geometry={p.geometry} position={p.position ?? [0, 0, 0]} rotation={p.rotation ?? [0, 0, 0]}>
            {surfacesOf(p, 'finished').map(([attach, look]) => (
              <LookMaterial
                key={attach}
                attach={attach}
                look={look}
                transparent={look.opacity < 1}
                opacity={look.opacity}
                depthWrite={look.opacity >= 1}
              />
            ))}
          </mesh>
        ))}
        {looks.map((look, i) => (
          <group
            key={i}
            ref={(g) => {
              flameRefs.current[i] = g;
            }}
            visible={false}
          >
            <Flame len={totalLen} r={maxR} look={look} />
          </group>
        ))}
      </group>
    </group>
  );
});

// Local origin is the nose.
function Parachute({ radius, color }: { radius: number; color: string }) {
  const drop = radius * 1.4;
  const strings = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return [
          [Math.cos(a) * radius, 0, Math.sin(a) * radius],
          [0, -drop, 0],
        ] as [number, number, number][];
      }),
    [radius, drop],
  );
  return (
    <group position={[0, drop, 0]}>
      <mesh>
        <sphereGeometry args={[radius, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.92} roughness={0.85} />
      </mesh>
      {strings.map((pts, i) => (
        <Line key={i} points={pts} color="#d9e4ec" lineWidth={1} transparent opacity={0.7} />
      ))}
    </group>
  );
}

// Local origin is the nose.
function Streamer({ length, width, color }: { length: number; width: number; color: string }) {
  const w = Math.max(0.15, width),
    L = Math.max(1.5, length);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, L, 1, 14);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setZ(i, Math.sin((y / L) * Math.PI * 4) * w * 0.9);
    }
    g.computeVertexNormals();
    return g;
  }, [w, L]);
  // R3F does not dispose geometry passed via the `geometry` prop.
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[0, L / 2, 0]}>
      <mesh geometry={geo} rotation={[0, 0.5, 0]}>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

function GroundRing({ pos, color }: { pos: THREE.Vector3; color: string }) {
  return (
    <mesh position={[pos.x, 0.03, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.32, 0.42, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Marker({ pos, color }: { pos: THREE.Vector3; color: string }) {
  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.22, 14, 14]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
    </mesh>
  );
}
