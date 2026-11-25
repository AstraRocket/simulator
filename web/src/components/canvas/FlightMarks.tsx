import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { EVENT_LABEL } from '../../services/flight/simReport';
import { useSettings } from '../../state/useSettings';
import type { FlightScene } from './flightScene';
import { GROUND_LAYER } from './groundMapLayout';
import { useSceneColors } from './sceneColors';

/** The pad, the apogee, each landing and the events passed so far. */
export function FlightMarks({
  scene,
  nowT,
  ringScale,
}: {
  scene: FlightScene;
  nowT: number;
  /** 1 in the overview; less where the rocket is drawn at its true size. */
  ringScale: number;
}) {
  const { t } = useTranslation();
  const sceneInk = useSceneColors();
  const { settings } = useSettings();
  const phase = settings.phaseColors;
  const overview = ringScale === 1;
  const { scenePts, apogeeIdx, times, callouts, tracks } = scene;
  return (
    <>
      {/* At true size the pad marks itself, and a ball at the apogee would hide the rocket. */}
      {overview && <GroundRing pos={scenePts[0]!} color={sceneInk['scene-marker']} scale={1} />}
      {overview && nowT >= (times[apogeeIdx] ?? Infinity) && <Marker pos={scenePts[apogeeIdx]!} color={phase.coast} />}
      {tracks.map(({ times: at, scenePts: pts }, i) => {
        const end = pts.length - 1;
        return (
          end > 0 && nowT >= at[end]! && <GroundRing key={i} pos={pts[end]!} color={phase.descent} scale={ringScale} />
        );
      })}
      {callouts.map((c) => (
        // Hidden rather than unmounted: drei's Html unmounts its own root while React is rendering.
        <Html
          key={`${c.type}@${c.time}`}
          position={[c.pos.x, c.pos.y, c.pos.z]}
          center
          // drei's default range starts at 16,777,271, above every dialog (z-50 to z-70).
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            data-flight-callout
            style={{ display: nowT >= c.time ? undefined : 'none' }}
            className="whitespace-nowrap rounded bg-surface/85 px-1.5 py-0.5 text-[10px] font-medium text-warn-300 ring-1 ring-line/10"
          >
            {t(EVENT_LABEL[c.type] ?? c.type)}
          </div>
        </Html>
      ))}
    </>
  );
}

/** Circles the tracked body while it is too small to see; FlightStep moves and shows it. */
export function TargetRing({
  groupRef,
  ringRef,
}: {
  groupRef: RefObject<THREE.Group | null>;
  ringRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <group ref={groupRef}>
      <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div
          ref={ringRef}
          data-flight-ring
          className="h-6 w-6 rounded-full border-2 border-warn-300"
          style={{ display: 'none' }}
        />
      </Html>
    </group>
  );
}

interface MarkProps {
  pos: THREE.Vector3;
  color: string;
  scale: number;
}

function GroundRing({ pos, color, scale }: MarkProps) {
  return (
    <mesh position={[pos.x, 0, pos.z]} rotation={[-Math.PI / 2, 0, 0]} scale={scale} renderOrder={GROUND_LAYER.ring}>
      <ringGeometry args={[0.32, 0.42, 48]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

function Marker({ pos, color }: Omit<MarkProps, 'scale'>) {
  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.22, 14, 14]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
    </mesh>
  );
}
