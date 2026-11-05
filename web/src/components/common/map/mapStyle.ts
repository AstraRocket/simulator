import type { TileSourceId } from '../../../services/map/slippyMap';

export type Layer = 'off' | TileSourceId;

// Labels spelled out: the key-coverage test cannot see keys built from a variable.
export const LAYERS = [
  { id: 'off', labelKey: 'map.none' },
  { id: 'satellite', labelKey: 'map.satellite' },
  { id: 'street', labelKey: 'map.street' },
] as const satisfies readonly { id: Layer; labelKey: string }[];

export const SOURCE_LAYERS = [
  { id: 'satellite', labelKey: 'map.satellite' },
  { id: 'street', labelKey: 'map.street' },
] as const satisfies readonly { id: TileSourceId; labelKey: string }[];

export const HALO = {
  paintOrder: 'stroke',
  stroke: 'rgba(2,6,23,0.75)',
  strokeWidth: 3,
  strokeLinejoin: 'round',
} as const;

export const LINER = 'rgba(2,6,23,0.75)';

export const MAX_MAGNIFICATION = 4;

/** Consecutive failures with nothing loaded that mean offline; one 404 is a coverage hole. */
export const TILE_FAILURES_OFFLINE = 3;
