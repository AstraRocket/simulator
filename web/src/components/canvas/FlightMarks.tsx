import * as THREE from 'three';
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
  const sceneInk = useSceneColors();
  const { settings } = useSettings();
  const phase = settings.phaseColors;
  const overview = ringScale === 1;
  const { scenePts, apogeeIdx, times, tracks } = scene;
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
    </>
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
