import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GROUND_LAYER, GROUND_ROTATION } from './groundMapLayout';
import { useSceneColors } from './sceneColors';
import { textTexture } from './textTexture';

const DEG = Math.PI / 180;
const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);
const MN_DASHES = [0, 1, 2];
const CARDINALS = [0, 90, 180, 270];

/** About +y, the turn that points -z (north) along a bearing clockwise from north. */
const bearingTurn = (deg: number): [number, number, number] => [0, -deg * DEG, 0];

/** The rose's words, in the app's language: N, E, S and W, and the wind arrow's label. */
export interface PadRoseLabels {
  cardinals: readonly string[];
  wind: string;
}

/** A flat arrow along +x, `length` long, centered. */
function arrowShape(length: number): THREE.Shape {
  const half = length / 2;
  const shaft = length * 0.06;
  const headLen = length * 0.32;
  const headHalf = length * 0.16;
  return new THREE.Shape([
    new THREE.Vector2(-half, -shaft),
    new THREE.Vector2(half - headLen, -shaft),
    new THREE.Vector2(half - headLen, -headHalf),
    new THREE.Vector2(half, 0),
    new THREE.Vector2(half - headLen, headHalf),
    new THREE.Vector2(half - headLen, shaft),
    new THREE.Vector2(-half, shaft),
  ]);
}

/**
 * A compass rose on the ground around the pad, in the pad's meters: true north red and longest, with N, E, S and W
 * inside the rim; a dashed magnetic north tick when the panel reads magnetic; and the pad wind as an arrow in the
 * air upwind of the pad, blowing toward it, labeled.
 */
export function PadRose({
  radius,
  windFromDeg,
  declinationDeg,
  labels,
}: {
  radius: number;
  /** Null in calm air: no direction to draw. */
  windFromDeg: number | null;
  declinationDeg: number | null;
  labels?: PadRoseLabels;
}) {
  const ink = useSceneColors();
  const line = radius * 0.018;
  const flat = { depthTest: false, depthWrite: false, transparent: true } as const;
  const north = ink['scene-north'];
  const rose = ink['scene-rose'];
  const windInk = ink['scene-wind'];

  const letters = useMemo(
    () => (labels ? labels.cardinals.map((text, i) => textTexture(text, i === 0 ? north : rose)) : []),
    [labels, north, rose],
  );
  const windLabel = useMemo(() => (labels ? textTexture(labels.wind, windInk) : null), [labels, windInk]);
  const arrowLength = radius * 0.5;
  const arrow = useMemo(() => new THREE.ShapeGeometry(arrowShape(arrowLength)), [arrowLength]);
  useEffect(
    () => () => {
      for (const l of letters) l?.texture.dispose();
      windLabel?.texture.dispose();
      arrow.dispose();
    },
    [letters, windLabel, arrow],
  );

  const letterSize = radius * 0.13;
  // Upwind of the pad, about half the rose's radius up: in the air, clear of the rod's foot.
  const windAt: [number, number, number] = [0, radius * 0.45, -radius * 0.72];
  const labelSize = arrowLength * 0.26;

  return (
    <group renderOrder={GROUND_LAYER.rose}>
      <mesh rotation={GROUND_ROTATION} renderOrder={GROUND_LAYER.rose}>
        <ringGeometry args={[radius - line, radius, 96]} />
        <meshBasicMaterial color={rose} opacity={0.8} {...flat} />
      </mesh>
      {TICKS.map((deg) => {
        const isNorth = deg === 0;
        const len = isNorth ? radius * 0.22 : deg % 90 === 0 ? radius * 0.14 : radius * 0.07;
        return (
          <group key={deg} rotation={bearingTurn(deg)}>
            <mesh rotation={GROUND_ROTATION} position={[0, 0, -radius + len / 2]} renderOrder={GROUND_LAYER.rose}>
              <planeGeometry args={[isNorth ? line * 2.4 : line * 1.4, len]} />
              <meshBasicMaterial color={isNorth ? north : rose} {...flat} />
            </mesh>
          </group>
        );
      })}
      {/* Flat inside the rim, each with its top toward the rim, so it reads facing outward. */}
      {CARDINALS.map((deg, i) => {
        const letter = letters[i];
        if (!letter) return null;
        return (
          <group key={deg} rotation={bearingTurn(deg)}>
            <mesh rotation={GROUND_ROTATION} position={[0, 0, -radius * 0.66]} renderOrder={GROUND_LAYER.rose}>
              <planeGeometry args={[letterSize * letter.aspect, letterSize]} />
              <meshBasicMaterial map={letter.texture} {...flat} />
            </mesh>
          </group>
        );
      })}
      {/* True north: a pointer outside the rim. */}
      <mesh
        rotation={GROUND_ROTATION}
        position={[0, 0, -radius * 1.1]}
        renderOrder={GROUND_LAYER.rose}
        name="true-north"
      >
        <circleGeometry args={[radius * 0.08, 3, Math.PI / 2]} />
        <meshBasicMaterial color={north} {...flat} />
      </mesh>
      {/* Past the true north pointer, so a small declination does not hide under it. */}
      {declinationDeg !== null && (
        <group rotation={bearingTurn(declinationDeg)} name="magnetic-north">
          {MN_DASHES.map((k) => (
            <mesh
              key={k}
              rotation={GROUND_ROTATION}
              position={[0, 0, -radius * (1.24 + k * 0.07)]}
              renderOrder={GROUND_LAYER.rose}
            >
              <planeGeometry args={[line * 1.4, radius * 0.04]} />
              <meshBasicMaterial color={north} {...flat} />
            </mesh>
          ))}
        </group>
      )}
      {windFromDeg !== null && (
        <group rotation={bearingTurn(windFromDeg)} name="pad-wind">
          {/* Two flat arrows crossed along one axis, so it reads from any side; along +z, toward the pad. */}
          <group position={windAt} rotation={[0, -Math.PI / 2, 0]}>
            <mesh geometry={arrow}>
              <meshBasicMaterial color={windInk} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={arrow} rotation={[Math.PI / 2, 0, 0]}>
              <meshBasicMaterial color={windInk} side={THREE.DoubleSide} />
            </mesh>
          </group>
          {windLabel && (
            <sprite
              position={[0, windAt[1] + arrowLength * 0.28, windAt[2]]}
              scale={[labelSize * windLabel.aspect, labelSize, 1]}
            >
              <spriteMaterial map={windLabel.texture} transparent depthWrite={false} />
            </sprite>
          )}
        </group>
      )}
    </group>
  );
}
