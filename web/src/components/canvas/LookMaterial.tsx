import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { useReflections } from './useReflections';
import type { Look } from '../../services/design/appearance';

const REFLECTIVITY = 0.2;

// As desktop's `RealisticRenderer.render`: shine is the specular level and, times 100, the shininess.
export function LookMaterial({
  look,
  ...rest
}: { look: Look; attach: string } & Omit<
  ThreeElements['meshPhongMaterial'],
  'color' | 'specular' | 'shininess' | 'envMap' | 'combine' | 'reflectivity'
>) {
  const room = useReflections();
  return (
    <meshPhongMaterial
      ref={(m) => {
        if (m && room) m.envMapRotation = room.rotation;
      }}
      color={look.color}
      specular={[look.shine, look.shine, look.shine]}
      shininess={100 * look.shine}
      envMap={room?.texture ?? null}
      combine={THREE.AddOperation}
      reflectivity={REFLECTIVITY * look.shine}
      {...rest}
    />
  );
}
