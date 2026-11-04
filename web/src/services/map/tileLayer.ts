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
