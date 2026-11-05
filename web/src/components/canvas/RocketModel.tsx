import { useMemo } from 'react';
import * as THREE from 'three';
import { useHoverCursor } from '../common/useHoverCursor';
import type { Piece, RenderMode } from './rocketPieces';
import type { Look } from '../../services/design/appearance';
import { LookMaterial, surfacesOf } from './LookMaterial';
import { ROCKET_MODEL_NAME } from './rocketSvgExport';
import { useSceneColors } from './sceneColors';

// Does not dispose geometry; whoever built the pieces owns it.
export function RocketModel({
  pieces,
  selectedId,
  onSelect,
  clip,
  mode = 'figure',
}: {
  pieces: Piece[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  clip?: THREE.Plane | null;
  mode?: RenderMode;
}) {
  const scene = useSceneColors();
  const hoverCursor = useHoverCursor();
  const planes = useMemo(() => (clip ? [clip] : null), [clip]);
  // The raycaster ignores clipping planes; not stopping propagation passes the hit to the visible part.
  const hidden = (p: Piece, point: THREE.Vector3): boolean =>
    !!clip && (!!p.translucent || !!p.innerGlass) && clip.distanceToPoint(point) < 0;
  return (
    <group name={ROCKET_MODEL_NAME}>
      {pieces.map((p) => {
        const selected = !!p.id && p.id === selectedId;
        const cut = !!planes && (!!p.translucent || !!p.innerGlass);
        const layered = mode === 'figure' && !selected && !cut;
        return (
          <mesh
            key={p.key}
            geometry={p.geometry}
            position={p.position ?? [0, 0, 0]}
            rotation={p.rotation ?? [0, 0, 0]}
            renderOrder={selected ? 3 : p.translucent ? 2 : p.innerGlass ? 1 : 0}
            onClick={
              p.id && onSelect
                ? (e) => {
                    if (hidden(p, e.point)) return;
                    e.stopPropagation();
                    if (p.id) onSelect(p.id);
                  }
                : undefined
            }
            onPointerOver={
              p.id && onSelect
                ? (e) => {
                    if (hidden(p, e.point)) return;
                    e.stopPropagation();
                    hoverCursor(true);
                  }
                : undefined
            }
            onPointerOut={p.id && onSelect ? () => hoverCursor(false) : undefined}
          >
            {/* Depth writes off for see-through tiers, or a translucent shell reads as opaque. */}
            {surfacesOf(p, mode).map(([attach, look]) => {
              const opacity = selected ? 1 : drawnOpacity(p, look, layered);
              const seeThrough = opacity < 1;
              return (
                <LookMaterial
                  key={attach}
                  attach={attach}
                  look={selected ? { ...look, color: scene['scene-selected'] } : look}
                  emissive={selected ? scene['scene-selected-glow'] : '#000000'}
                  emissiveIntensity={selected ? 0.6 : 0}
                  transparent={seeThrough}
                  opacity={opacity}
                  depthWrite={!seeThrough}
                  side={cut || (layered && (p.translucent || p.innerGlass)) ? THREE.DoubleSide : THREE.FrontSide}
                  clippingPlanes={cut ? planes : null}
                />
              );
            })}
          </mesh>
        );
      })}
    </group>
  );
}

export function drawnOpacity(p: Piece, look: Look, layered: boolean): number {
  const tier = !layered ? 1 : p.translucent ? 0.55 : p.innerGlass ? 0.5 : 1;
  return tier * look.opacity;
}
