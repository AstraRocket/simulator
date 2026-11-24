import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { useReflections } from './useReflections';
import type { Look } from '../../services/design/appearance';
import { decalMaterialProps, useDecalTexture } from './decalTexture';

const REFLECTIVITY = 0.2;

// As desktop's `RealisticRenderer.render`: shine is the specular level and, times 100, the shininess.
export function LookMaterial({
  look,
  fadeDecal = false,
  ...rest
}: {
  look: Look;
  attach: string;
  /** Fade the decal with the drawn opacity, as when a view sees through the part. */
  fadeDecal?: boolean;
} & Omit<
  ThreeElements['meshPhongMaterial'],
  'color' | 'specular' | 'shininess' | 'envMap' | 'combine' | 'reflectivity'
>) {
  const room = useReflections();
  const decal = look.decal && fadeDecal ? { ...look.decal, opacityAffectsTexture: true } : look.decal;
  const texture = useDecalTexture(look.decal);
  const withDecal = decalMaterialProps(decal, texture);
  return (
    <meshPhongMaterial
      // A new material when the decal comes, goes or changes kind: three picks the program once per material version.
      key={withDecal.map ? ['decal', ...Object.keys(withDecal.defines)].join() : 'plain'}
      ref={(m) => {
        if (m && room) m.envMapRotation = room.rotation;
      }}
      color={look.color}
      specular={[look.shine, look.shine, look.shine]}
      shininess={100 * look.shine}
      envMap={room?.texture ?? null}
      combine={THREE.AddOperation}
      reflectivity={REFLECTIVITY * look.shine}
      {...withDecal}
      {...rest}
    />
  );
}
