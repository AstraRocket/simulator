import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { useReflections } from './RoomReflections';
import type { Look } from '../../services/design/appearance';
import { isSurfaced, SURFACE, type Piece, type RenderMode } from './rocketPieces';

/**
 * The materials a piece is drawn with, as `[attach, look]` pairs: one for a
 * piece whose geometry is not split by surface, one per surface for one that is.
 */
export function surfacesOf(p: Piece, mode: RenderMode): [string, Look][] {
  const looks = p.looks[mode];
  if (!isSurfaced(p.geometry)) return [['material', looks.outside]];
  return [
    [`material-${SURFACE.outside}`, looks.outside],
    [`material-${SURFACE.inside}`, looks.inside],
    [`material-${SURFACE.edges}`, looks.edges],
  ];
}

/**
 * How much of the room a full-shine surface reflects. Added over the paint
 * rather than mixed into it, as a clear coat does, so the paint keeps its hue.
 */
const REFLECTIVITY = 0.2;

/**
 * One surface's material, lit the way desktop's realistic view lights it
 * (`RealisticRenderer.render`): the paint is the diffuse color, and the shine
 * is both the specular level and, times 100, the shininess. Inside a
 * `RoomReflections` the shine also sets how much of the room it reflects, so a
 * matte part reflects nothing and a glossy one looks glossy.
 */
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
      // The room's own turn, not a copy, so the room follows the camera for
      // every part at once without a write per material per frame.
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
