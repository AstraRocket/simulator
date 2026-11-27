import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { RocketTree } from '../../engine/openRocketEngine';
import { RoomReflections } from './RoomReflections';
import { useReducedMotion } from '../common/useMediaQuery';
import { chargeMouth } from '../../services/flight/airframe';
import type { FlightBody } from '../../services/flight/flightBodies';
import { BASE_FOV } from './flightCamera';
import { flightMiddle, type EventPill, type FlightScene } from './flightScene';
import { FlightStep } from './FlightStep';
import { FlightTrail } from './FlightTrail';
import type { Exhaust } from '../../services/motors/exhaust';
import type { MotorDims } from '../../tree/schematicGeometry';
import { FlightGround } from './FlightGround';
import { FlightMarks } from './FlightMarks';
import { FlightLabelProjector, FlightRingProjector } from './FlightLabels';
import { FlightPad } from './FlightPad';
import { padStand } from './launchGuideShape';
import type { PadSetup } from './usePadRose';
import { RecoveryDevice } from './FlightRecovery';
import type { TileSourceId } from '../../services/map/slippyMap';
import type { useGroundLayer } from '../common/map/useTileVerdict';
import { useSceneColors } from './sceneColors';
import { FlameGlow } from './FlightEffects';
import { BodyEffects, BodyFlames, FlyingBody } from './FlyingBody';
import { FlightSky } from './FlightSky';
import { FlightSmoke } from './FlightSmoke';
import { useFlightParts } from './useFlightParts';
import { useFlightShot } from './useFlightShot';
import type { FlightPlayback } from './useFlightPlayback';

// The frame loop mutates the scene from `progressRef`; React hears only a throttled `progress`.

export function FlightPathScene({
  scene,
  pills,
  labelRefs,
  ringLabelRef,
  ringPlaceRef,
  bodies,
  tree,
  motors,
  exhausts,
  site,
  mapSource,
  ground,
  rodLengthM,
  pad,
  effects,
  roseRef,
  nowT,
  playback,
}: {
  scene: FlightScene;
  pills: readonly EventPill[];
  /** The page elements `FlightLabels` draws, placed each frame here. */
  labelRefs: RefObject<(HTMLDivElement | null)[]>;
  /** `TargetRingMark`'s: the ring FlightStep shows, and the box this canvas places. */
  ringLabelRef: RefObject<HTMLDivElement | null>;
  ringPlaceRef: RefObject<HTMLDivElement | null>;
  bodies: readonly FlightBody[];
  tree: RocketTree;
  motors?: MotorDims;
  exhausts?: Readonly<Record<string, Exhaust>>;
  site: { lat: number; lon: number } | null;
  mapSource: TileSourceId | null;
  ground: ReturnType<typeof useGroundLayer>;
  rodLengthM: number;
  pad: PadSetup;
  effects: boolean;
  /** The compass rose's, turned with the camera. */
  roseRef: RefObject<SVGGElement | null>;
  nowT: number;
  playback: FlightPlayback;
}) {
  const sceneInk = useSceneColors();
  const { playing, speed, view, loop, progressRef, onTick, onEnd } = playback;
  const still = useReducedMotion();
  const modelRefs = useRef<(THREE.Group | null)[]>([]);
  const deviceRefs = useRef<(THREE.Group | null)[]>([]);
  const ringRef = useRef<THREE.Group>(null);
  const padRef = useRef<THREE.Group>(null);
  const scaleRef = useRef(1);

  const parts = useFlightParts(scene, bodies, tree, motors, effects);
  const { pieces, nozzles, overviewScale, devices, burns, owned, extents, spans, pops } = parts;
  const { radius, frames, rigs, hung, drawn, bounds } = parts;
  const { unitsPerMeter, tracks } = scene;
  const modelScale = view === 'overview' ? overviewScale : unitsPerMeter;
  const standing = spans[0]?.[0];
  const clock = { progressRef, duration: scene.duration };
  const shotAt = useFlightShot(scene, bodies, playback, parts);
  const middle = useMemo(() => flightMiddle(scene), [scene]);
  // On the deflector until well clear of the pad, and never again after apogee.
  const padLift = useMemo(
    () => ({
      heightM: padStand(rodLengthM).top,
      fadeM: rodLengthM * 2 + 1,
      untilT: scene.times[scene.apogeeIdx] ?? 0,
    }),
    [rodLengthM, scene],
  );

  // Neutral tone mapping, as the 3D model: ACES turns a lit saturated blue purple.
  return (
    <Canvas
      camera={{ position: [0, 22, 48], fov: BASE_FOV }}
      // The true-size views see millimeters and kilometers in one frame.
      gl={{ preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping, logarithmicDepthBuffer: true }}
    >
      <hemisphereLight args={[sceneInk['scene-sky'], sceneInk['scene-ground'], 1.5]} />
      <directionalLight position={[14, 26, 16]} intensity={1.7} />
      <FlightSky />
      <FlightGround scene={scene} bounds={bounds} site={site} mapSource={mapSource} ground={ground} />
      {/* First: the trails and smoke read the moment this frame's step reaches. */}
      <FlightStep
        scene={scene}
        bodies={bodies}
        spans={spans}
        shotAt={shotAt}
        still={still}
        playing={playing}
        speed={speed}
        loop={loop}
        progressRef={progressRef}
        modelRefs={modelRefs}
        hung={hung}
        deviceRefs={deviceRefs}
        rigs={rigs}
        drawn={drawn}
        radius={radius}
        ringRef={ringRef}
        ringLabelRef={ringLabelRef}
        scaleRef={scaleRef}
        padRef={padRef}
        padLift={padLift}
        dialRef={roseRef}
        onTick={onTick}
        onEnd={onEnd}
      />
      {tracks.map((track, i) => (
        <FlightTrail
          key={i}
          track={track}
          from={i === 0 ? -Infinity : (bodies[i]?.separatedAt ?? -Infinity)}
          {...clock}
        />
      ))}
      <FlightMarks scene={scene} nowT={nowT} ringScale={modelScale / overviewScale} />
      <group ref={ringRef} />
      <FlightRingProjector groupRef={ringRef} placeRef={ringPlaceRef} />
      <FlightLabelProjector pills={pills} middle={middle} labelRefs={labelRefs} />
      {standing && (
        <FlightPad groupRef={padRef} track={scene} span={standing} pieces={pieces} rodLengthM={rodLengthM} pad={pad} />
      )}
      <FlightSmoke
        scene={scene}
        bodies={bodies}
        spans={spans}
        extents={extents}
        burns={burns}
        pops={pops}
        nozzles={nozzles}
        exhausts={exhausts}
        radius={radius}
        airframes={frames}
        effects={effects}
        scaleRef={scaleRef}
        progressRef={progressRef}
      />
      {effects && (
        <FlameGlow
          burns={burns}
          bodies={bodies}
          nozzles={nozzles}
          exhausts={exhausts}
          radius={radius}
          modelRefs={modelRefs}
          scaleRef={scaleRef}
          {...clock}
        />
      )}
      <RoomReflections>
        {owned.map((parts, i) => (
          <FlyingBody
            key={i}
            groupRef={(g) => {
              modelRefs.current[i] = g;
            }}
            index={i}
            pieces={parts}
            rigs={rigs}
            devices={devices}
            radius={radius}
            {...clock}
          >
            {effects && (
              <BodyEffects
                index={i}
                body={bodies[i]!}
                extent={extents[i]!}
                mouthAt={(time) => chargeMouth(frames, i, time, extents[i]?.fore ?? 0)}
                pops={pops}
                radius={radius}
                {...clock}
              />
            )}
            <BodyFlames body={i} burns={burns} bodies={bodies} nozzles={nozzles} exhausts={exhausts} {...clock} />
          </FlyingBody>
        ))}
      </RoomReflections>

      {hung.map((d, i) => (
        <RecoveryDevice
          key={i}
          groupRef={(g) => {
            deviceRefs.current[i] = g;
          }}
          shape={d.shape}
          deployment={d}
          {...clock}
        />
      ))}

      <OrbitControls makeDefault enableDamping={view === 'overview'} />
    </Canvas>
  );
}
