import { memo } from 'react';
import { LookMaterial } from './LookMaterial';
import { surfacesOf } from './lookSurfaces';
import type { Piece } from './rocketPieces';

// Memoized: the parent re-renders every HUD tick, and this has a mesh per piece.
export const BodyMeshes = memo(function BodyMeshes({ pieces }: { pieces: readonly Piece[] }) {
  return pieces.map((p) => (
    <mesh key={p.key} geometry={p.geometry} position={p.position ?? [0, 0, 0]} rotation={p.rotation ?? [0, 0, 0]}>
      {surfacesOf(p, 'finished').map(([attach, look]) => (
        <LookMaterial
          key={attach}
          attach={attach}
          look={look}
          transparent={look.opacity < 1}
          opacity={look.opacity}
          depthWrite={look.opacity >= 1}
        />
      ))}
    </mesh>
  ));
});
