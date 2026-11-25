import { useEffect, useMemo, useRef, type RefCallback, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Deployment } from '../../services/flight/flightSources';
import {
  canopyGeometry,
  collapse,
  inflation,
  lineGeometry,
  stripGeometry,
  unrolled,
  waveStrip,
  type RecoveryShape,
} from './recoveryMotion';
import { useSceneColors } from './sceneColors';

interface Motion {
  deployment: Deployment;
  progressRef: RefObject<number>;
  /** Seconds, the whole replay. */
  duration: number;
}

/** In meters of rocket, tied at its origin; FlightStep places and shows it. */
export function RecoveryDevice({
  groupRef,
  shape,
  ...motion
}: Motion & { groupRef: RefCallback<THREE.Group>; shape: RecoveryShape }) {
  return (
    <group ref={groupRef} visible={false}>
      {shape.kind === 'parachute' ? <Parachute {...shape} {...motion} /> : <Streamer {...shape} {...motion} />}
    </group>
  );
}

function Parachute({
  mouth,
  lines,
  lineLength,
  color,
  deployment,
  progressRef,
  duration,
}: Motion & Extract<RecoveryShape, { kind: 'parachute' }>) {
  const ink = useSceneColors();
  const reach = Math.sqrt(lineLength ** 2 - mouth ** 2);
  const canopy = useMemo(() => canopyGeometry(lines), [lines]);
  const cords = useMemo(() => lineGeometry(lines, reach), [lines, reach]);
  useEffect(() => () => canopy.dispose(), [canopy]);
  useEffect(() => () => cords.dispose(), [cords]);
  const whole = useRef<THREE.Group>(null);
  const wall = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const age = progressRef.current * duration - deployment.from;
    const fallen = collapse(age - (deployment.to - deployment.from));
    const open = inflation(age) * (1 - 0.35 * fallen);
    whole.current?.scale.set(open * mouth, unrolled(age), open * mouth);
    // Long and narrow until it fills; flat once it is down.
    wall.current?.scale.setY(mouth * Math.max(0.8, 1.9 - open) * (1 - 0.8 * fallen));
  });
  return (
    <group ref={whole}>
      <mesh ref={wall} geometry={canopy} position={[0, reach, 0]}>
        <meshStandardMaterial color={color} vertexColors side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      <lineSegments geometry={cords}>
        <lineBasicMaterial color={ink['scene-callout']} transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

function Streamer({
  length,
  width,
  color,
  deployment,
  progressRef,
  duration,
}: Motion & Extract<RecoveryShape, { kind: 'streamer' }>) {
  const strip = useMemo(() => stripGeometry(), []);
  useEffect(() => () => strip.dispose(), [strip]);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const age = progressRef.current * duration - deployment.from;
    const geometry = mesh.current?.geometry;
    if (age < 0 || !geometry) return;
    waveStrip(geometry.getAttribute('position') as THREE.BufferAttribute, length, width, age);
    geometry.computeVertexNormals();
  });
  return (
    <mesh ref={mesh} geometry={strip} frustumCulled={false}>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} metalness={0} />
    </mesh>
  );
}
