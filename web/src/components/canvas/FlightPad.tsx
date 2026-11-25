import { useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import type { BodySpan } from './bodyMotion';
import type { FlightTrack } from './flightTrack';
import { GROUND_LAYER, GROUND_ROTATION } from './groundMapLayout';
import { launchRod } from './launchPad';
import type { Piece } from './rocketPieces';
import { useSceneColors } from './sceneColors';

const UP = new THREE.Vector3(0, 1, 0);
const LEGS = [0, 1, 2];

/** In meters of rocket, at the pad; FlightStep sets its scale. */
export function FlightPad({
  groupRef,
  track,
  span,
  pieces,
  rodLengthM,
  reach,
}: {
  groupRef: RefObject<THREE.Group | null>;
  track: FlightTrack;
  span: BodySpan;
  pieces: readonly Piece[];
  rodLengthM: number;
  /** How far the rocket reaches to a side, fins and all. */
  reach: number;
}) {
  const ink = useSceneColors();
  const rod = useMemo(() => launchRod(track, span, pieces, rodLengthM), [track, span, pieces, rodLengthM]);
  const turn = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, rod.dir), [rod]);
  const middle = useMemo(() => rod.foot.clone().addScaledVector(rod.dir, rod.length / 2), [rod]);
  const at = track.scenePts[0];
  if (!at) return null;
  const plate = reach * 1.25;
  const thick = Math.max(rod.radius * 2, plate * 0.05);
  return (
    <group ref={groupRef} position={[at.x, 0, at.z]}>
      <mesh rotation={GROUND_ROTATION} renderOrder={GROUND_LAYER.pad}>
        <circleGeometry args={[plate, 40]} />
        <meshBasicMaterial color={ink['scene-grid-minor']} depthTest={false} depthWrite={false} />
      </mesh>
      {LEGS.map((k) => (
        <group key={k} rotation={[0, ((k * 2 + 1) * Math.PI) / 3, 0]}>
          <mesh position={[plate * 1.35, thick / 2, 0]}>
            <boxGeometry args={[plate * 0.9, thick, thick * 1.6]} />
            <meshStandardMaterial color={ink['scene-callout']} metalness={0.6} roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={middle} quaternion={turn}>
        <cylinderGeometry args={[rod.radius, rod.radius, rod.length, 12]} />
        <meshStandardMaterial color={ink['scene-callout']} metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}
