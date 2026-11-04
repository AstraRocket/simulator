import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import type { FlightResult, RocketTree } from '../../engine/openRocketEngine';
import type { Piece } from './rocketPieces';
import { LookMaterial, surfacesOf } from './LookMaterial';
import { RoomReflections } from './RoomReflections';
import { usePieces } from './usePieces';
import { mergePalette } from '../../services/design/partColors';
import { useSettings } from '../../state/SettingsProvider';
import { withFixedUnit } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import { EVENT_LABEL } from '../../services/flight/simReport';
import {
  buildFlightScene,
  burnAt,
  findRecovery,
  indexForProgress,
  modelPoseAt,
  newModelPose,
  smokePuffs,
  type FlightScene,
  type SmokePuff,
} from './flightScene';
import { DEFAULT_EXHAUST, DELAY_SMOKE, type Exhaust } from '../../services/motors/exhaust';
import type { MotorDims } from '../../tree/schematicGeometry';
import { FlightGroundMap } from './FlightGroundMap';
import { TILE_SOURCES, type TileSourceId } from '../../services/map/slippyMap';
import { LAYERS } from '../common/map/mapStyle';
import { MapCredit, TileLayerButtons } from '../common/map/MapParts';
import { useGroundLayer } from '../common/map/useTileVerdict';
import { MIN_EXTENT_M } from '../../services/flight/groundTrack';
import { ColorInput } from '../common/ColorInput';
import { useSceneColors } from './sceneColors';
import { PLAYBACK_SPEEDS, playbackLabel } from '../../services/storage/settings';
import { ToggleButton } from '../common/ToggleButton';
import { smallButton } from '../common/smallButton';

// The frame loop mutates the scene from `progressRef`; React hears only a throttled `progress`.
const MODEL_LEN = 1.6; // scene units
const PLAY_SECONDS = 8; // wall-clock length of a full 1x playback
const HUD_INTERVAL_MS = 100;
const MAX_PUFFS = 700;

const GROUND_MARGIN = 1.2;

export function FlightPath3D({
  result,
  tree,
  motors,
  exhausts,
  latitudeDeg,
  longitudeDeg,
}: {
  result: FlightResult;
  tree: RocketTree;
  motors?: MotorDims;
  exhausts?: readonly Exhaust[];
  latitudeDeg?: number | null;
  longitudeDeg?: number | null;
}) {
  const sceneInk = useSceneColors();
  const { t } = useTranslation();
  const u = useUnits();
  const { settings, update } = useSettings();
  const palette = useMemo(() => mergePalette(settings.partColors), [settings.partColors]);
  const phase = settings.phaseColors;
  // The HUD copy; the frame loop owns the live value (progressRef).
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(settings.playbackSpeed);
  const [follow, setFollow] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const progressRef = useRef(0);
  const site = latitudeDeg != null && longitudeDeg != null ? { lat: latitudeDeg, lon: longitudeDeg } : null;
  const ground = useGroundLayer(site !== null);
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

  const scene = useMemo(() => buildFlightScene(result, phase), [result, phase]);
  const looks = useMemo(() => (exhausts?.length ? exhausts : [DEFAULT_EXHAUST]), [exhausts]);
  const puffStart = Math.max(Math.max(maxR, 0.005) * modelScale * 3, 0.08);
  const puffs = useMemo(() => smokePuffs(scene, MAX_PUFFS, MODEL_LEN / 2, puffStart / 2), [scene, puffStart]);
  const { colors, scenePts, apogeeIdx, times, alts, vels, callouts } = scene;
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

  // Every hook sits above the empty-state return so the hook count never changes.
  const idx = useMemo(() => indexForProgress(times, progress), [times, progress]);
  const nowT = times[idx] ?? 0;
  const shownCallouts = useMemo(() => callouts.filter((c) => nowT >= c.time), [callouts, nowT]);

  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }
      setCountdown(null);
      progressRef.current = 0;
      setProgress(0);
      setPlaying(true);
    }, 900);
    return () => clearTimeout(id);
  }, [countdown]);

  const seek = useCallback((v: number) => {
    progressRef.current = v;
    setProgress(v);
  }, []);
  const onTick = useCallback((p: number) => setProgress(p), []);
  const onEnd = useCallback(() => setPlaying(false), []);
  const setBoost = useCallback((c: string) => update({ phaseColors: { ...phase, boost: c } }), [update, phase]);
  const setCoast = useCallback((c: string) => update({ phaseColors: { ...phase, coast: c } }), [update, phase]);
  const setDescent = useCallback((c: string) => update({ phaseColors: { ...phase, descent: c } }), [update, phase]);

  const handlePlay = () => {
    if (countdown !== null) {
      setCountdown(null);
      return;
    }
    if (playing) {
      setPlaying(false);
      return;
    }
    // The live value: the HUD copy can lag by a tick.
    const p = progressRef.current;
    if (p <= 0.001 || p >= 0.999) setCountdown(5);
    else setPlaying(true);
  };
  const handleReset = () => {
    setPlaying(false);
    setCountdown(null);
    seek(0);
  };

  const groundRadiusM = useMemo(() => {
    let far = 0;
    for (const p of scenePts) {
      const d = Math.max(Math.abs(p.x), Math.abs(p.z));
      if (d > far) far = d;
    }
    return Math.max(MIN_EXTENT_M, (far / scene.unitsPerMeter) * GROUND_MARGIN);
  }, [scenePts, scene.unitsPerMeter]);

  const mapSource: TileSourceId | null = ground.imagery === 'unavailable' ? null : ground.source;

  if (n < 2) {
    return <div className="grid h-full place-items-center text-sm text-ink-faint">{t('sim.prompt')}</div>;
  }

  const chuteR = recovery?.kind === 'parachute' ? Math.max(0.5, (recovery.diameter / 2) * modelScale) : 0;

  return (
    <div className="relative h-full overflow-hidden rounded-xl bg-canvas ring-1 ring-line/10">
      {/* Neutral tone mapping, as the 3D model: ACES turns a lit saturated blue purple. */}
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
            <Streamer
              length={recovery.length * modelScale}
              width={recovery.width * modelScale}
              color={recovery.color}
            />
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

      <div className="pointer-events-none absolute left-3 top-3 flex gap-3 rounded-lg bg-surface/80 px-3 py-2 text-xs ring-1 ring-line/10">
        <Hud label={t('flight.altitude')} value={`${u.fmtSym('distance', alts[idx] ?? 0)}`} />
        <Hud label={t('flight.velocity')} value={`${u.fmtSym('velocity', vels[idx] ?? 0)}`} />
        <Hud label={t('flight.time')} value={withFixedUnit(nowT, t('units.second'))} />
      </div>
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1 rounded-lg bg-surface/80 px-2 py-1.5 text-[10px] ring-1 ring-line/10">
        <Legend color={phase.boost} label={t('flight.boost')} onChange={setBoost} />
        <Legend color={phase.coast} label={t('flight.coast')} onChange={setCoast} />
        <Legend color={phase.descent} label={t('flight.descent')} onChange={setDescent} />
      </div>
      {site && (
        <TileLayerButtons
          layers={LAYERS}
          value={ground.layer}
          onPick={ground.pick}
          className="absolute left-3 top-16"
        />
      )}
      {mapSource && <MapCredit className="absolute bottom-16 right-3">{TILE_SOURCES[mapSource].attribution}</MapCredit>}
      {ground.source && ground.imagery === 'unavailable' && (
        <MapCredit warn className="absolute bottom-16 right-3">
          {t('map.offline')}
        </MapCredit>
      )}

      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-surface/85 px-3 py-2 ring-1 ring-line/10">
        <button
          onClick={handlePlay}
          aria-label={countdown !== null ? t('flight.cancel') : playing ? t('flight.pause') : t('flight.play')}
          className={smallButton('xs', 'ink', 'shrink-0')}
        >
          {countdown !== null ? '✕' : playing ? '⏸' : '▶'}
        </button>
        <button
          onClick={handleReset}
          title={t('flight.reset')}
          aria-label={t('flight.reset')}
          className={smallButton('xs', 'ink', 'shrink-0')}
        >
          ⟲
        </button>
        <ToggleButton
          active={loop}
          onClick={() => setLoop((l) => !l)}
          title={t('flight.loop')}
          label={t('flight.loop')}
          className="shrink-0 rounded-md px-2 py-1 text-xs ring-1 ring-line/10"
        >
          ⟳
        </ToggleButton>
        <ToggleButton
          active={follow}
          onClick={() => setFollow((f) => !f)}
          title={t('flight.follow')}
          className="shrink-0 rounded-md px-2 py-1 text-xs ring-1 ring-line/10"
        >
          ⊙ {t('flight.follow')}
        </ToggleButton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          aria-label={t('flight.time')}
          aria-valuetext={withFixedUnit(nowT, t('units.second'))}
          onChange={(e) => {
            setPlaying(false);
            seek(parseFloat(e.target.value));
          }}
          className="min-w-0 flex-1 accent-accent-500"
        />
        <select
          value={speed}
          aria-label={t('flight.playbackSpeed')}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="shrink-0 rounded-md bg-raised px-1.5 py-1 text-xs text-ink ring-1 ring-line/10"
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {playbackLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {countdown !== null && countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            key={countdown}
            style={{ animation: 'fp-cd 0.9s ease-out' }}
            className="text-8xl font-black tabular-nums text-on-accent drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]"
          >
            {countdown}
          </span>
        </div>
      )}
      <style>
        {'@keyframes fp-cd{0%{transform:scale(1.9);opacity:0}25%{opacity:1}100%{transform:scale(1);opacity:.92}}'}
      </style>
    </div>
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

function Flame({ len, r, look }: { len: number; r: number; look: Exhaust }) {
  const ref = useRef<THREE.Mesh>(null);
  const [c0, c1, c2] = look.flame;
  const geo = useMemo(() => {
    const H = r * 5.5;
    const g = new THREE.ConeGeometry(r * 0.95, H, 24, 1, true);
    g.rotateZ(Math.PI / 2); // apex to -X
    g.translate(H / 2, 0, 0); // apex at the nozzle, base trailing at +X
    const pos = g.attributes.position!;
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
const Smoke = memo(function Smoke({
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
    points.material.uniforms.uScale!.value = (size.height * viewport.dpr * camera.projectionMatrix.elements[5]) / 2;
  });
  if (!n) return null;
  return <points ref={ref} geometry={geo} material={material} frustumCulled={false} />;
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
    const pos = g.attributes.position!;
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

function Hud({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink-strong">{value}</span>
    </span>
  );
}

// `pointer-events-auto` overrides the legend box's inherited `pointer-events-none`.
function Legend({ color, label, onChange }: { color: string; label: string; onChange: (c: string) => void }) {
  return (
    <label className="pointer-events-auto flex cursor-pointer items-center gap-1.5 text-ink-soft" title={label}>
      <ColorInput
        value={color}
        onCommit={onChange}
        className="h-3 w-3 cursor-pointer appearance-none rounded-sm border border-line/20 bg-transparent p-0"
        style={{ background: color }}
      />
      {label}
    </label>
  );
}
