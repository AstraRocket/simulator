import { createContext, useContext } from 'react';
import * as THREE from 'three';

export interface Room {
  texture: THREE.CubeTexture;
  rotation: THREE.Euler;
}

export const Reflections = createContext<Room | null>(null);

export const useReflections = () => useContext(Reflections);
