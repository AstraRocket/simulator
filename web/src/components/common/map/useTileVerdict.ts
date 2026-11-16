import { useCallback, useRef, useState } from 'react';
import type { TileSourceId } from '../../../services/map/slippyMap';
import { groundImagery, rememberGroundImagery, rememberTileLayer, tileLayer } from '../../../services/map/tileLayer';
import { TILE_FAILURES_OFFLINE, type Layer } from './mapStyle';

type TileImagery = 'unknown' | 'ok' | 'unavailable';

/** Callbacks keep the state object when unchanged, since a re-render per tile stalls the tab. */
export function useTileVerdict(source: TileSourceId | null) {
  const [reached, setReached] = useState<{ src: TileSourceId; state: 'ok' | 'unavailable' } | null>(null);
  const errors = useRef(0);
  const imagery: TileImagery = source && reached?.src === source ? reached.state : 'unknown';

  const onTileLoad = useCallback(() => {
    errors.current = 0;
    if (!source) return;
    setReached((prev) => (prev?.src === source && prev.state === 'ok' ? prev : { src: source, state: 'ok' }));
  }, [source]);

  const onTileError = useCallback(() => {
    errors.current += 1;
    if (!source || errors.current < TILE_FAILURES_OFFLINE) return;
    setReached((prev) => (prev?.src === source && prev.state === 'ok' ? prev : { src: source, state: 'unavailable' }));
  }, [source]);

  const retry = useCallback(() => {
    errors.current = 0;
    setReached((prev) => (prev?.state === 'unavailable' ? null : prev));
  }, []);

  return { imagery, onTileLoad, onTileError, retry };
}

export function useGroundLayer(hasSite: boolean) {
  const [layer, setLayer] = useState<Layer>(() => (groundImagery() ? tileLayer() : 'off'));
  const source: TileSourceId | null = hasSite && layer !== 'off' ? layer : null;
  const verdict = useTileVerdict(source);
  const pick = (next: Layer) => {
    rememberGroundImagery(next !== 'off');
    if (next !== 'off') rememberTileLayer(next);
    verdict.retry();
    setLayer(next);
  };
  return { layer, source, pick, ...verdict };
}

/** The launch site, null without both coordinates, and the ground layer over it. */
export function useSiteGround(latitudeDeg: number | null | undefined, longitudeDeg: number | null | undefined) {
  const site = latitudeDeg != null && longitudeDeg != null ? { lat: latitudeDeg, lon: longitudeDeg } : null;
  return { site, ground: useGroundLayer(site !== null) };
}
