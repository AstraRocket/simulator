import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import * as THREE from 'three';
import { type TileRef, type TileSourceId } from '../../services/map/slippyMap';
import { sceneFromEnu } from './flightTrack';
import { useEsriKey } from '../../services/map/esriKey';
import { groundMapLayout, GROUND_LAYER, GROUND_ROTATION, configureTileTexture } from './groundMapLayout';
import type { TerrainField } from '../../services/map/terrainTiles';
import { TILE_SEGMENTS, terrainPlane } from './terrainMesh';

export interface GroundMapProps {
  latitudeDeg: number;
  longitudeDeg: number;
  // Half the side, from the pad.
  radiusM: number;
  unitsPerMeter: number;
  source: TileSourceId;
  /** Drapes the tiles over it, drawn with depth so hills hide what is behind them. */
  terrain?: TerrainField | null;
  onTileLoad?: () => void;
  onTileError?: () => void;
}

export interface GroundQuad extends TileRef {
  url: string;
  // Scene units east and north of the pad.
  east: number;
  north: number;
}

export function FlightGroundMap({
  latitudeDeg,
  longitudeDeg,
  radiusM,
  unitsPerMeter,
  source,
  terrain,
  onTileLoad,
  onTileError,
}: GroundMapProps) {
  const key = useEsriKey();
  const layer = useMemo(
    () => groundMapLayout(latitudeDeg, longitudeDeg, radiusM, unitsPerMeter, source, key),
    [latitudeDeg, longitudeDeg, radiusM, unitsPerMeter, source, key],
  );

  // Tagged with their layout: tile keys repeat across layers, so a stale texture could show.
  const [loaded, setLoaded] = useState<{ of: typeof layer; texes: Record<string, THREE.Texture> }>({
    of: layer,
    texes: {},
  });

  const draped = useMemo(() => {
    if (!terrain) return null;
    const out = new Map<string, THREE.PlaneGeometry>();
    for (const ref of layer.refs) {
      out.set(ref.key, terrainPlane(terrain, layer.quad, TILE_SEGMENTS, ref.east, ref.north, unitsPerMeter));
    }
    return out;
  }, [terrain, layer, unitsPerMeter]);
  useEffect(() => () => draped?.forEach((g) => g.dispose()), [draped]);

  // Effect Events, so an unmemoized parent callback does not re-fetch every tile per HUD tick.
  const reportTileLoad = useEffectEvent(() => onTileLoad?.());
  const reportTileError = useEffectEvent(() => onTileError?.());

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    // Without CORS the preserveDrawingBuffer canvas is tainted and image export breaks.
    loader.setCrossOrigin('anonymous');
    let live = true;
    const mine: THREE.Texture[] = [];

    for (const ref of layer.refs) {
      loader.load(
        ref.url,
        (tex) => {
          if (!live) {
            tex.dispose();
            return;
          }
          configureTileTexture(tex);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          mine.push(tex);
          reportTileLoad();
          setLoaded((prev) => ({
            of: layer,
            texes: prev.of === layer ? { ...prev.texes, [ref.key]: tex } : { [ref.key]: tex },
          }));
        },
        undefined,
        () => {
          if (live) reportTileError();
        },
      );
    }

    return () => {
      live = false;
      for (const tex of mine) tex.dispose();
    };
  }, [layer]);

  return (
    <group>
      {layer.refs.map((ref) => {
        const tex = loaded.of === layer ? loaded.texes[ref.key] : undefined;
        if (!tex) return null;
        const geometry = draped?.get(ref.key);
        if (geometry) {
          return (
            <mesh
              key={ref.key}
              geometry={geometry}
              position={sceneFromEnu(ref.east, 0, ref.north)}
              rotation={GROUND_ROTATION}
            >
              <meshBasicMaterial map={tex} vertexColors toneMapped={false} />
            </mesh>
          );
        }
        return (
          <mesh
            key={ref.key}
            position={sceneFromEnu(ref.east, 0, ref.north)}
            rotation={GROUND_ROTATION}
            renderOrder={GROUND_LAYER.map}
          >
            <planeGeometry args={[layer.quad, layer.quad]} />
            <meshBasicMaterial map={tex} toneMapped={false} depthTest={false} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
