import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const FACE_PX = 64;

interface Room {
  texture: THREE.CubeTexture;
  rotation: THREE.Euler;
}

const Reflections = createContext<Room | null>(null);

// A plain cube map, not PMREM: Phong takes PMREM as extra ambient light on every part.
export function RoomReflections({ children }: { children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  const room = useMemo<Room>(() => {
    const target = new THREE.WebGLCubeRenderTarget(FACE_PX, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const scene = new RoomEnvironment();
    new THREE.CubeCamera(0.1, 100, target).update(gl, scene);
    scene.dispose();
    return { texture: target.texture, rotation: new THREE.Euler() };
  }, [gl]);
  useEffect(() => () => room.texture.dispose(), [room]);
  useFrame(({ camera }) => {
    room.rotation.setFromQuaternion(camera.quaternion);
  });
  return <Reflections.Provider value={room}>{children}</Reflections.Provider>;
}

export const useReflections = () => useContext(Reflections);
