import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import type { LauncherKind } from '../../services/design/launcher';
import { railGeometry } from './launchGuideShape';
import { useSceneColors } from './sceneColors';

/**
 * The rod or rail the rocket rides, centered at `position` along its axis, yellow as the launch panel draws it: a
 * round rod with a cap on its tip, or a T-slot rail `side` wide.
 */
export function LaunchGuide({
  kind,
  radius,
  side,
  length,
  position,
  quaternion,
}: {
  kind: LauncherKind;
  /** The rod's. */
  radius: number;
  /** The rail's width. */
  side: number;
  length: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}) {
  const ink = useSceneColors();
  const rail = useMemo(() => (kind === 'rail' ? railGeometry(side, length) : null), [kind, side, length]);
  useEffect(() => () => rail?.dispose(), [rail]);
  if (rail) {
    return (
      <mesh position={position} quaternion={quaternion} geometry={rail}>
        {/* Anodized aluminum: a little sheen along the slots. */}
        <meshStandardMaterial color={ink['scene-rod']} metalness={0.35} roughness={0.4} />
      </mesh>
    );
  }
  return (
    <group position={position} quaternion={quaternion}>
      <mesh>
        <cylinderGeometry args={[radius, radius, length, 16]} />
        <meshStandardMaterial color={ink['scene-rod']} metalness={0.5} roughness={0.3} />
      </mesh>
      {/* The cap a range puts on a rod's tip, and the line-and-ball the legends draw. */}
      <mesh position={[0, length / 2, 0]}>
        <sphereGeometry args={[radius * 2.6, 16, 12]} />
        <meshStandardMaterial color={ink['scene-rod']} metalness={0.2} roughness={0.5} />
      </mesh>
    </group>
  );
}
