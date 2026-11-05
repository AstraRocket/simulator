import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { useReflections } from './RoomReflections';
import type { Look } from '../../services/design/appearance';
import { isSurfaced, SURFACE, type Piece, type RenderMode } from './rocketPieces';

export function surfacesOf(p: Piece, mode: RenderMode): [string, Look][] {
  const looks = p.looks[mode];
  if (!isSurfaced(p.geometry)) return [['material', looks.outside]];
  return [
    [`material-${SURFACE.outside}`, looks.outside],
    [`material-${SURFACE.inside}`, looks.inside],
    [`material-${SURFACE.edges}`, looks.edges],
  ];
}

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
