import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Deployment } from '../../services/flight/flightSources';
import { copyPath, type AirframeRig } from './airframeRig';
import { BodyMeshes } from './BodyMeshes';
import type { Piece } from './rocketPieces';
import { useSceneColors } from './sceneColors';

interface Shared {
  /** Every pod that comes apart on the same body. */
  pods: readonly AirframeRig[];
  devices: readonly Deployment[];
  /** The airframe's, in meters. */
  radius: number;
  progressRef: RefObject<number>;
  /** Seconds, the whole replay. */
  duration: number;
}

/** An airframe that comes apart, in the rocket's frame. FlightStep works out where its sections are. */
export function FlyingAirframe({ rig, pieces, ...shared }: Shared & { rig: AirframeRig; pieces: readonly Piece[] }) {
  const { assemblyId, sections } = rig.frame;
  const copies = useMemo(
    () =>
      rig.copies.flatMap(({ path }, copy) => {
        const held = assemblyId == null ? pieces : pieces.filter((p) => copyPath(p, assemblyId) === path);
        return held.length ? [{ copy, held }] : [];
      }),
    [rig, assemblyId, pieces],
  );
  return copies.map(({ copy, held }) =>
    sections.map((section, k) => (
      <FlyingSection
        key={`${copy}.${k}`}
        rig={rig}
        copy={copy}
        index={k}
        partIds={section.partIds}
        pieces={held}
        {...shared}
      />
    )),
  );
}

function FlyingSection({
  rig,
  copy,
  index,
  partIds,
  pieces,
  ...shared
}: Shared & {
  rig: AirframeRig;
  copy: number;
  index: number;
  partIds: ReadonlySet<string>;
  pieces: readonly Piece[];
}) {
  const { pods, devices, radius, ...clock } = shared;
  const ref = useRef<THREE.Group>(null);
  const [own, carried] = useMemo(() => {
    const mine = pieces.filter((p) => p.id != null && partIds.has(p.id));
    const on = pods.filter(({ frame }) => frame.carrierId != null && partIds.has(frame.carrierId));
    const held = on.map((pod) => {
      const id = pod.frame.assemblyId;
      return { pod, pieces: id == null ? [] : mine.filter((p) => copyPath(p, id) != null) };
    });
    return [mine.filter((p) => !held.some((h) => h.pieces.includes(p))), held];
  }, [pieces, partIds, pods]);
  useFrame(() => {
    const m = rig.copies[copy]?.sections[index];
    if (m) ref.current?.matrix.copy(m);
  });
  return (
    <>
      <group ref={ref} matrixAutoUpdate={false}>
        <PackedMeshes pieces={own} devices={devices} {...clock} />
        {carried.map(({ pod, pieces: held }) => (
          <FlyingAirframe key={pod.frame.assemblyId} rig={pod} pieces={held} {...shared} />
        ))}
      </group>
      {index < rig.frame.joints.length && <CordRun rig={rig} copy={copy} joint={index} radius={radius} />}
    </>
  );
}

/** A section's pieces, each recovery device gone from among them once it is out. */
function PackedMeshes({
  pieces,
  devices,
  progressRef,
  duration,
}: Omit<Shared, 'pods' | 'radius'> & { pieces: readonly Piece[] }) {
  const [fixed, packed] = useMemo(() => {
    const out = devices.flatMap(({ device, from }) => {
      const its = pieces.filter((p) => p.id != null && p.id === device.id);
      return its.length ? [{ from, pieces: its }] : [];
    });
    return [pieces.filter((p) => !out.some((d) => d.pieces.includes(p))), out];
  }, [pieces, devices]);
  return (
    <>
      <BodyMeshes pieces={fixed} />
      {packed.map(({ from, pieces: its }, i) => (
        <PackedDevice key={i} until={from} pieces={its} progressRef={progressRef} duration={duration} />
      ))}
    </>
  );
}

function PackedDevice({
  until,
  pieces,
  progressRef,
  duration,
}: Pick<Shared, 'progressRef' | 'duration'> & { until: number; pieces: readonly Piece[] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = progressRef.current * duration < until;
  });
  return (
    <group ref={ref}>
      <BodyMeshes pieces={pieces} />
    </group>
  );
}

function CordRun({ rig, copy, joint, radius }: { rig: AirframeRig; copy: number; joint: number; radius: number }) {
  const ink = useSceneColors();
  const aft = useRef<THREE.Mesh>(null);
  const fore = useRef<THREE.Mesh>(null);
  const along = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const cord = rig.copies[copy]?.cords[joint];
    if (!cord || !aft.current || !fore.current) return;
    aft.current.visible = cord.out;
    fore.current.visible = cord.out;
    if (!cord.out) return;
    stretch(aft.current, cord.aft, cord.tied, along);
    stretch(fore.current, cord.tied, cord.fore, along);
  });
  const thick = Math.max(0.0008, radius * 0.06);
  return (
    <>
      <mesh ref={aft} visible={false}>
        <cylinderGeometry args={[thick, thick, 1, 8]} />
        <meshStandardMaterial color={ink['scene-callout']} roughness={0.9} />
      </mesh>
      <mesh ref={fore} visible={false}>
        <cylinderGeometry args={[thick, thick, 1, 8]} />
        <meshStandardMaterial color={ink['scene-callout']} roughness={0.9} />
      </mesh>
    </>
  );
}

const UP = new THREE.Vector3(0, 1, 0);

function stretch(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, along: THREE.Vector3): void {
  const length = Math.max(along.subVectors(to, from).length(), 1e-6);
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(UP, along.divideScalar(length));
}
