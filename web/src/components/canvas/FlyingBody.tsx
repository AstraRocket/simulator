import { memo, useMemo, type ReactNode, type RefCallback, type RefObject } from 'react';
import type * as THREE from 'three';
import type { FlightBody } from '../../services/flight/flightBodies';
import type { Deployment, MountBurn, Pop } from '../../services/flight/flightSources';
import { DEFAULT_EXHAUST, type Exhaust } from '../../services/motors/exhaust';
import type { AirframeRig } from './airframeRig';
import type { Extent } from './bodyMotion';
import { BodyMeshes } from './BodyMeshes';
import { FlyingAirframe } from './FlightAirframe';
import { EjectionFlash, VaporCone } from './FlightEffects';
import { MotorFlames } from './FlightFlames';
import type { Nozzle, Piece } from './rocketPieces';

/** A body and what it burns, in the rocket’s frame; FlightStep places it. */
export function FlyingBody({
  groupRef,
  index,
  pieces,
  rigs,
  children,
  ...shared
}: {
  groupRef: RefCallback<THREE.Group>;
  index: number;
  pieces: Piece[];
  rigs: readonly AirframeRig[];
  devices: readonly Deployment[];
  radius: number;
  progressRef: RefObject<number>;
  duration: number;
  children?: ReactNode;
}) {
  const [own, pods, rest] = useMemo(() => {
    const its = rigs.filter((r) => r.frame.body === index);
    const main = its.filter((r) => r.frame.carrierId == null);
    const moved = ({ id }: Piece) => id != null && main.some((r) => r.frame.sections.some((x) => x.partIds.has(id)));
    return [main, its.filter((r) => r.frame.carrierId != null), pieces.filter((p) => !moved(p))];
  }, [rigs, index, pieces]);
  return (
    <group ref={groupRef}>
      {/* FlightStep slides this so the body turns about the middle of what it is attached to. */}
      <group>
        <BodyMeshes pieces={rest} />
        {own.map((rig, i) => (
          <FlyingAirframe key={i} rig={rig} pods={pods} pieces={pieces} {...shared} />
        ))}
        {children}
      </group>
    </group>
  );
}

export function BodyEffects({
  index,
  body,
  extent,
  mouthAt,
  pops,
  ...rest
}: {
  index: number;
  body: FlightBody;
  extent: Extent;
  /** Where a charge at a time blows out. */
  mouthAt: (time: number) => number;
  pops: readonly Pop[];
  radius: number;
  progressRef: RefObject<number>;
  duration: number;
}) {
  return (
    <>
      {index === 0 && <VaporCone body={body} extent={extent} {...rest} />}
      {pops
        .filter((p) => p.body === index && p.kind === 'ejection')
        .map((p) => (
          <EjectionFlash key={p.time} pop={p} at={mouthAt(p.time)} {...rest} />
        ))}
    </>
  );
}

export const BodyFlames = memo(function BodyFlames({
  body,
  burns,
  bodies,
  nozzles,
  exhausts,
  progressRef,
  duration,
}: {
  body: number;
  burns: readonly MountBurn[];
  bodies: readonly FlightBody[];
  nozzles: readonly Nozzle[];
  exhausts: Readonly<Record<string, Exhaust>> | undefined;
  progressRef: RefObject<number>;
  duration: number;
}) {
  const own = useMemo(
    () =>
      burns
        .filter((b) => b.body === body)
        .map((burn) => ({ burn, nozzles: nozzles.filter((n) => n.mountId === burn.mountId) })),
    [burns, body, nozzles],
  );
  return own.map(({ burn, nozzles: at }) => (
    <MotorFlames
      key={burn.mountId}
      burn={burn}
      bodies={bodies}
      nozzles={at}
      look={exhausts?.[burn.mountId] ?? DEFAULT_EXHAUST}
      progressRef={progressRef}
      duration={duration}
    />
  ));
});
