import { useEffect, useMemo, useState } from 'react';
import type { FlightResult } from '../../engine/openRocketEngine';
import type { EventRow } from '../../services/flight/flightEvents';
import { buildFlightScene, type FlightScene, type PhaseColors } from './flightScene';
import { groundRadiusM } from './groundMapLayout';
import { TILE_SIZE } from '../../services/map/slippyMap';
import {
  groundTerrain,
  groundTerrainScale,
  rememberGroundTerrain,
  rememberGroundTerrainScale,
} from '../../services/map/tileLayer';
import {
  decodeTerrarium,
  sampleTerrain,
  scaleTerrain,
  terrainHeightAt,
  terrainLayout,
  type TerrainField,
  type TerrainLayout,
} from '../../services/map/terrainTiles';

export type TerrainStatus = 'off' | 'loading' | 'ready' | 'failed';

/** Why terrain failed: tiles that did not download, pixels the browser would not let us read, or no data there. */
export type TerrainFailure = { kind: 'download'; failed: number; total: number } | { kind: 'blocked' | 'coverage' };

class TileBlocked extends Error {}

// One more try for a tile that failed: a single dropped request should not cost the whole ground.
const RETRY_MS = 1500;

/** How many times taller than it is the ground may be drawn. */
export const TERRAIN_SCALES = [1, 2, 5, 10] as const;

// Decoded tiles by URL, so turning terrain back on or reopening a flight fetches nothing again.
const decoded = new Map<string, Promise<Float32Array>>();
const KEPT_TILES = 64;

function loadTile(url: string): Promise<Float32Array> {
  const hit = decoded.get(url);
  if (hit) return hit;
  const load = new Promise<Float32Array>((resolve, reject) => {
    const img = new Image();
    // Without CORS the canvas is tainted and its pixels cannot be read.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
      try {
        resolve(decodeTerrarium(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data));
      } catch {
        // A tainted canvas: the image came without CORS.
        reject(new TileBlocked(url));
      }
    };
    img.onerror = () => reject(new Error(`terrain tile ${url}`));
    img.src = url;
  });
  // A failure is not kept: offline now need not mean offline on the next try.
  load.catch(() => decoded.delete(url));
  decoded.set(url, load);
  const oldest = decoded.keys().next().value;
  if (decoded.size > KEPT_TILES && oldest != null) decoded.delete(oldest);
  return load;
}

async function loadTileRetried(url: string): Promise<Float32Array> {
  try {
    return await loadTile(url);
  } catch (err) {
    if (err instanceof TileBlocked) throw err;
    await new Promise((r) => setTimeout(r, RETRY_MS));
    return loadTile(url);
  }
}

async function loadField(layout: TerrainLayout, radiusM: number): Promise<TerrainField | TerrainFailure> {
  const settled = await Promise.allSettled(layout.refs.map((r) => loadTileRetried(r.url)));
  const tiles = new Map<string, Float32Array>();
  let failed = 0;
  let blocked = false;
  settled.forEach((s, i) => {
    const key = layout.refs[i]?.key;
    if (s.status === 'fulfilled' && key) tiles.set(key, s.value);
    else {
      failed++;
      if (s.status === 'rejected' && s.reason instanceof TileBlocked) blocked = true;
    }
  });
  if (blocked) return { kind: 'blocked' };
  if (failed) return { kind: 'download', failed, total: layout.refs.length };
  return sampleTerrain(layout, tiles, radiusM) ?? { kind: 'coverage' };
}

/** The ground's heights around the pad, fetched only while terrain is on. */
export function useFlightTerrain(site: { lat: number; lon: number } | null, radiusM: number) {
  const [on, setOn] = useState(groundTerrain);
  const [scale, setScaleState] = useState(groundTerrainScale);
  const lat = site?.lat;
  const lon = site?.lon;
  const layout = useMemo(
    () => (on && lat != null && lon != null ? terrainLayout(lat, lon, radiusM) : null),
    [on, lat, lon, radiusM],
  );
  // Tagged with its layout, so a field for another site or size never shows.
  const [got, setGot] = useState<{ of: typeof layout; answer: TerrainField | TerrainFailure } | null>(null);

  useEffect(() => {
    if (!layout) return;
    let live = true;
    void loadField(layout, radiusM).then((answer) => {
      if (live) setGot({ of: layout, answer });
    });
    return () => {
      live = false;
    };
  }, [layout, radiusM]);

  const mine = got && got.of === layout ? got.answer : null;
  const failure = mine && 'kind' in mine ? mine : null;
  const field = mine && !('kind' in mine) ? mine : null;
  const status: TerrainStatus = !layout ? 'off' : !mine ? 'loading' : failure ? 'failed' : 'ready';
  const toggle = (next: boolean) => {
    rememberGroundTerrain(next);
    setOn(next);
  };
  const setScale = (next: number) => {
    rememberGroundTerrainScale(next);
    setScaleState(next);
  };
  return { on, toggle, scale, setScale, status, failure, field };
}

/**
 * The flight, landed on the terrain while it is on and loaded; else on level ground, as the engine flew it. With the
 * ground drawn taller, `scene` lands on the ground as drawn, and `trueScene` on the real one, for the numbers.
 */
export function useTerrainScene(result: FlightResult, phase: PhaseColors, site: { lat: number; lon: number } | null) {
  // The engine's flight sizes the ground, so the terrain fetched never depends on the terrain.
  const level = useMemo(() => buildFlightScene(result, phase), [result, phase]);
  const radiusM = useMemo(() => groundRadiusM(level), [level]);
  const terrain = useFlightTerrain(site, radiusM);
  const { field, scale } = terrain;
  const trueScene = useMemo(
    () => (field ? buildFlightScene(result, phase, (e, n) => terrainHeightAt(field, e, n)) : level),
    [field, result, phase, level],
  );
  const drawn = useMemo(() => (field ? scaleTerrain(field, scale) : null), [field, scale]);
  const scene = useMemo(
    () =>
      drawn && drawn !== field ? buildFlightScene(result, phase, (e, n) => terrainHeightAt(drawn, e, n)) : trueScene,
    [drawn, field, result, phase, trueScene],
  );
  const land = useMemo(() => ({ radiusM, terrain: drawn }), [radiusM, drawn]);
  return { scene, trueScene, terrain, land };
}

/** On terrain a branch lands where its drawn path ends, not when the engine met its level ground. */
export function landedOnTerrain(events: readonly EventRow[], scene: FlightScene | null): EventRow[] {
  if (!scene) return [...events];
  return events.map((e) => {
    const end = e.type === 'GROUND_HIT' ? scene.tracks[e.branch]?.times.at(-1) : undefined;
    return end == null ? e : { ...e, time: end };
  });
}
