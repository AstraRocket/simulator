import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Each cube face's size: small, so the room reflects soft rather than sharp. */
const FACE_PX = 64;

interface Room {
  texture: THREE.CubeTexture;
  /** The room's turn, one object every material shares, so it follows the camera. */
  rotation: THREE.Euler;
}

const Reflections = createContext<Room | null>(null);

/**
 * A soft studio room for the parts inside it to reflect, so a glossy finish
 * reads as glossy rather than as a flat color with one highlight.
 *
 * Built in code from three.js's own room scene, rendered once per renderer to
 * a small plain cube map: no image to fetch, so it works offline. A plain cube
 * map rather than the blurred kind three.js makes for its physical materials,
 * because a Phong material given the blurred kind takes it as extra ambient
 * light on every part, whatever its shine, rather than as a reflection.
 *
 * The room turns with the camera, as the lights do (`ViewLight`), so a
 * part's reflection does not favor one side of the model as you orbit it.
 */
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

/** The room the parts reflect, or null outside a `RoomReflections`. */
export const useReflections = () => useContext(Reflections);
