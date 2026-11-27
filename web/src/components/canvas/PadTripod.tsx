import { useMemo } from 'react';
import * as THREE from 'three';
import type { LauncherKind } from '../../services/design/launcher';
import type { PadStand } from './launchGuideShape';
import { useSceneColors } from './sceneColors';

const UP = new THREE.Vector3(0, 1, 0);
const LEGS = [0, 1, 2];

/**
 * A flat bar from `from` to `to`, its broad face up: along it +y, across it horizontally +x, through its thickness
 * +z. A minimal turn from +y would twist each leg's broad face its own way.
 */
function bar(from: THREE.Vector3, to: THREE.Vector3) {
  const along = to.clone().sub(from);
  const y = along.clone().normalize();
  const x = new THREE.Vector3().crossVectors(y, UP).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return {
    position: from.clone().add(to).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)),
    length: along.length(),
  };
}

const at = (bearing: number, out: number, up: number) =>
  new THREE.Vector3(Math.sin(bearing) * out, up, -Math.cos(bearing) * out);

/**
 * A launch pad, in meters: a hub on three flat legs splayed wide to the ground, each on a small foot, and on the hub
 * a rod's round blast deflector or a rail's square mounting plate. The guide stands from `stand.top`.
 */
export function PadTripod({ launcher, stand }: { launcher: LauncherKind; stand: PadStand }) {
  const ink = useSceneColors();
  const { reach, height, plate } = stand;
  const rail = launcher === 'rail';
  // A rail pad is built heavier.
  const heft = rail ? 1.5 : 1;
  const hubR = reach * 0.07 * heft;
  const hubTall = height * 0.35;
  const width = reach * 0.07 * heft;
  const thick = reach * 0.014 * heft;
  const foot = reach * 0.06 * heft;
  // Off the north line, so no leg hides under the north tick.
  const legs = useMemo(
    () =>
      LEGS.map((k) => {
        const b = ((k * 2 + 1) * Math.PI) / 3;
        return { bar: bar(at(b, hubR * 0.8, height - hubTall * 0.6), at(b, reach, thick / 2)), foot: at(b, reach, 0) };
      }),
    [hubR, height, hubTall, reach, thick],
  );
  const steel = <meshStandardMaterial color={ink['scene-callout']} metalness={0.55} roughness={0.5} />;
  return (
    <group>
      {legs.map((l, k) => (
        <group key={k}>
          <mesh position={l.bar.position} quaternion={l.bar.quaternion}>
            <boxGeometry args={[width, l.bar.length, thick]} />
            {steel}
          </mesh>
          <mesh position={[l.foot.x, thick / 2, l.foot.z]}>
            <cylinderGeometry args={[foot, foot, thick, 16]} />
            {steel}
          </mesh>
        </group>
      ))}
      <mesh position={[0, height - hubTall / 2, 0]}>
        <cylinderGeometry args={[hubR, hubR * 1.15, hubTall, 20]} />
        {steel}
      </mesh>
      {/* Darker: scorched by every launch off it. */}
      <mesh position={[0, height + plate / 2, 0]}>
        {rail ? (
          <boxGeometry args={[reach * 0.36, plate, reach * 0.36]} />
        ) : (
          <cylinderGeometry args={[reach * 0.22, reach * 0.22, plate, 40]} />
        )}
        <meshStandardMaterial color={ink['scene-grid']} metalness={0.5} roughness={0.6} />
      </mesh>
    </group>
  );
}
