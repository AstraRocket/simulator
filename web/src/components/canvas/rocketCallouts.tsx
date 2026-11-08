import { must } from '../../services/app/must';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

function labelTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const px = 96;
  const canvas = document.createElement('canvas');
  const ctx = must(canvas.getContext('2d'), 'canvas 2D context');
  const font = `700 ${px}px system-ui, 'Segoe UI', sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + px * 0.3);
  const h = Math.ceil(px * 1.25);
  canvas.width = w;
  canvas.height = h; // resizing resets the 2D context state
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = px * 0.14;
  ctx.strokeStyle = 'rgba(10, 15, 22, 0.9)';
  ctx.strokeText(text, px * 0.15, h / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, px * 0.15, h / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: w / h };
}

// Offset via sprite `center` (screen space): a world-space offset would swing with the orbit.
function CalloutLabel({
  text,
  color,
  position,
  height,
  gap,
  place = 'right',
}: {
  text: string;
  color: string;
  position: [number, number, number];
  height: number;
  gap: number;
  place?: 'right' | 'left' | 'above' | 'below';
}) {
  const { texture, aspect } = useMemo(() => labelTexture(text, color), [text, color]);
  // The JSX-declared material is R3F-disposed on unmount; its map is ours.
  useEffect(() => () => texture.dispose(), [texture]);
  const center = useMemo(
    () =>
      place === 'above'
        ? new THREE.Vector2(0.5, -(gap / height))
        : place === 'below'
          ? new THREE.Vector2(0.5, 1 + gap / height)
          : place === 'left'
            ? new THREE.Vector2(1 + gap / (height * aspect), 0.5)
            : new THREE.Vector2(-(gap / (height * aspect)), 0.5),
    [place, gap, height, aspect],
  );
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} center={center} renderOrder={13}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}

export function AxisCallout({
  x,
  dir,
  color,
  tex,
  label,
  len,
  markerR,
  labelColor = color,
  place = dir === 1 ? 'above' : 'below',
  dashSize = len * 0.09,
  gapSize = len * 0.06,
}: {
  x: number;
  dir: 1 | -1;
  color: string;
  tex: THREE.Texture;
  label: string | undefined;
  len: number;
  markerR: number;
  labelColor?: string;
  place?: 'right' | 'left' | 'above' | 'below';
  dashSize?: number;
  gapSize?: number;
}) {
  // drei's Line rebuilds its geometry whenever `points` changes identity.
  const { end, points } = useMemo(() => {
    const e: [number, number, number] = [x, dir * len, 0];
    return { end: e, points: [[x, 0, 0] as [number, number, number], e] };
  }, [x, dir, len]);
  return (
    <>
      <sprite position={[x, 0, 0]} scale={[markerR * 0.5, markerR * 0.5, 1]} renderOrder={12}>
        <spriteMaterial map={tex} depthTest={false} transparent />
      </sprite>
      <Line
        points={points}
        color={color}
        lineWidth={1.4}
        dashed
        dashSize={dashSize}
        gapSize={gapSize}
        depthTest={false}
        transparent
        renderOrder={12}
      />
      {label !== undefined && (
        <CalloutLabel
          text={label}
          color={labelColor}
          place={place}
          position={end}
          height={markerR * 0.52}
          gap={markerR * 0.3}
        />
      )}
    </>
  );
}
