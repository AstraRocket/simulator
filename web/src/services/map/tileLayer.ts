import type { TileSourceId } from './slippyMap';

let current: TileSourceId = 'satellite';

export const tileLayer = (): TileSourceId => current;

export const rememberTileLayer = (id: TileSourceId): void => {
  current = id;
};

// Off by default so opening Results makes no third-party tile requests.
// Behind a function because `react-hooks/immutability` flags direct module-level assignment.
let ground = false;

export const groundImagery = (): boolean => ground;

export const rememberGroundImagery = (on: boolean): void => {
  ground = on;
};

// Off by default too: terrain is fetched from a third party only once asked for.
let terrain = false;

export const groundTerrain = (): boolean => terrain;

export const rememberGroundTerrain = (on: boolean): void => {
  terrain = on;
};

let terrainScale = 1;

export const groundTerrainScale = (): number => terrainScale;

export const rememberGroundTerrainScale = (scale: number): void => {
  terrainScale = scale;
};
