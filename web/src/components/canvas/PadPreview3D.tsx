import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { LaunchConditions } from '../../services/design/orkTree';
import { padWindFromDeg, rodLean } from '../../services/flight/bearing';
import { usePadRose } from './usePadRose';
import { PadRose } from './PadRose';
import { LaunchGuide } from './LaunchGuide';
import { PadTripod } from './PadTripod';
import { padStand, railSide, rodRadius } from './launchGuideShape';
import type { LauncherKind } from '../../services/design/launcher';
import { FlightSky } from './FlightSky';
import { GroundFloor } from './FlightGround';
import { useSceneColors } from './sceneColors';

const UP = new THREE.Vector3(0, 1, 0);
// As the engine's, for a launch with no rod length.
const DEFAULT_ROD_M = 1;
// As the flight's least: the grid fades to the horizon well past the pad.
const GROUND_HAZE_M = 220;

/** A unit vector along a lean: `heading` clockwise from north (-z), `angle` from vertical. */
function leanDirection(headingDeg: number, angleDeg: number): THREE.Vector3 {
  const h = (headingDeg * Math.PI) / 180;
  const a = (angleDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * Math.sin(h), Math.cos(a), -Math.sin(a) * Math.cos(h));
}

/**
 * The pad as the launch conditions set it, before any flight: the rod or rail at its bearing and angle, the ground rose and
 * the pad wind. It follows the launch panel as it is edited.
 */
export function PadPreview3D({ launch, launcher }: { launch: LaunchConditions; launcher: LauncherKind }) {
  const ink = useSceneColors();
  const lean = rodLean(launch);
  const length = launch.launchRodLengthM && launch.launchRodLengthM > 0 ? launch.launchRodLengthM : DEFAULT_ROD_M;
  const dir = useMemo(() => leanDirection(lean.headingDeg, lean.angleDeg), [lean.headingDeg, lean.angleDeg]);
  const turn = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, dir), [dir]);
  const rose = usePadRose(padWindFromDeg(launch), launch.latitudeDeg, launch.longitudeDeg);
  // As sold, but never under a few pixels across at this framing.
  const rodR = Math.max(rodRadius(length), length * 0.004);
  const stand = padStand(length);
  return (
    <Canvas
      // From the south, facing north, as the flight path's overview.
      camera={{ position: [0, length * 1.1, length * 2.4], fov: 40 }}
      gl={{ preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping }}
    >
      <hemisphereLight args={[ink['scene-sky'], ink['scene-ground'], 1.5]} />
      <directionalLight position={[3, 6, 4]} intensity={1.7} />
      {/* The 3D flight's own sky, floor and grid, in meters. */}
      <FlightSky />
      <GroundFloor haze={GROUND_HAZE_M} unitsPerMeter={1} />
      <PadRose radius={length * 0.9} {...rose} />
      <PadTripod launcher={launcher} stand={stand} />
      <LaunchGuide
        kind={launcher}
        radius={rodR}
        side={railSide(length)}
        length={length}
        position={dir
          .clone()
          .multiplyScalar(length / 2)
          .setY(dir.y * (length / 2) + stand.top)}
        quaternion={turn}
      />
      <OrbitControls makeDefault target={[0, length * 0.35, 0]} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  );
}
