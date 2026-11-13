import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TILE_SIZE, TILE_SOURCES, visibleTiles, type TileSourceId } from '../../../services/map/slippyMap';
import { useEsriKey } from '../../../services/map/esriKey';
import { useHelpStore } from '../../../state/helpStore';
import { mapButtonClass } from './mapButton';

export function TileLayerButtons<Id extends string>({
  layers,
  value,
  onPick,
  className = 'absolute left-1 top-1',
}: {
  layers: readonly { id: Id; labelKey: string }[];
  value: Id;
  onPick: (id: Id) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const key = useEsriKey();
  const openHelp = useHelpStore((s) => s.openHelp);
  return (
    <div className={`${className} flex flex-col items-start gap-1`}>
      <div className="flex overflow-hidden rounded-md ring-1 ring-shade/40">
        {layers.map((l) => (
          <button
            key={l.id}
            onClick={() => onPick(l.id)}
            aria-pressed={value === l.id}
            className={mapButtonClass(value === l.id)}
          >
            {t(l.labelKey)}
          </button>
        ))}
      </div>
      {!key && value in TILE_SOURCES && (
        <p className="max-w-64 rounded-md bg-surface/90 px-2 py-1 text-[11px] leading-snug text-warn-400 ring-1 ring-shade/40">
          {t('map.keyNag')}{' '}
          <button onClick={() => openHelp('settings#esri-key')} className="underline hover:text-warn-300">
            {t('map.keyHelp')}
          </button>
        </p>
      )}
    </div>
  );
}

export function TileImg({
  source,
  tile,
  onLoad,
  onError,
  className = '',
}: {
  source: TileSourceId;
  tile: ReturnType<typeof visibleTiles>[number];
  onLoad: () => void;
  onError: () => void;
  className?: string;
}) {
  const key = useEsriKey();
  return (
    <img
      src={TILE_SOURCES[source].url(tile.z, tile.x, tile.y, key)}
      alt=""
      draggable={false}
      // CORS to match the WebGL textures, or the service worker caches an opaque copy they fail on.
      crossOrigin="anonymous"
      // No `referrerPolicy="no-referrer"`: tile usage policies want the Referer.
      width={TILE_SIZE}
      height={TILE_SIZE}
      // `max-w-none` beats preflight's `img { max-width: 100% }`, which leaves gaps between tiles.
      className={`absolute max-w-none select-none ${className}`}
      style={{ left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

export function MapCredit({
  children,
  warn = false,
  className = 'absolute bottom-0 right-0',
}: {
  children: ReactNode;
  warn?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`pointer-events-none ${className} bg-surface/70 px-1 text-[9px] leading-tight ${
        warn ? 'text-warn-400' : 'text-ink-muted'
      }`}
    >
      {children}
    </p>
  );
}
