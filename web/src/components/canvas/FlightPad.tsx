import { useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import type { BodySpan } from './bodyMotion';
import type { FlightTrack } from './flightTrack';
import { launchRod } from './launchPad';
import { PadRose } from './PadRose';
import { LaunchGuide } from './LaunchGuide';
import { PadTripod } from './PadTripod';
import { padStand } from './launchGuideShape';
import type { PadSetup } from './usePadRose';
import type { Piece } from './rocketPieces';

const UP = new THREE.Vector3(0, 1, 0);

/** In meters of rocket, at the pad; FlightStep sets its scale. */
export function FlightPad({
  groupRef,
  track,
  span,
  pieces,
  rodLengthM,
  pad,
}: {
  groupRef: RefObject<THREE.Group | null>;
  track: FlightTrack;
  span: BodySpan;
  pieces: readonly Piece[];
  rodLengthM: number;
  pad: PadSetup;
}) {
  const stand = padStand(rodLengthM);
  const rod = useMemo(() => launchRod(track, span, pieces, rodLengthM), [track, span, pieces, rodLengthM]);
  const turn = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, rod.dir), [rod]);
  const middle = useMemo(() => rod.foot.clone().addScaledVector(rod.dir, rod.length / 2), [rod]);
  const at = track.scenePts[0];
  if (!at) return null;
  return (
    <group ref={groupRef} position={[at.x, 0, at.z]}>
      {/* Centered on the rod, which passes the airframe through its lug or button. */}
      <group position={[rod.foot.x, 0, rod.foot.z]}>
        <PadTripod launcher={pad.launcher} stand={stand} />
      </group>
      {/* Wide enough to clear the legs, and to read beside a long rod. */}
      <PadRose radius={Math.max(stand.reach * 1.6, rod.length * 0.5)} {...pad.rose} />
      <LaunchGuide
        kind={pad.launcher}
        radius={rod.radius}
        // Sized to the rocket, as the rod is: its offset from the airframe is taken from the rod's radius.
        side={rod.radius * 2.8}
        length={rod.length}
        // Standing on the deflector, where FlightStep lifts the rocket to.
        position={middle.clone().setY(middle.y + stand.top)}
        quaternion={turn}
      />
    </group>
  );
}
