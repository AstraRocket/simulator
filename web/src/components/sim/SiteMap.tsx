import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MIN_ZOOM,
  TILE_SOURCES,
  formatCoord,
  metersPerPixel,
  project,
  visibleTiles,
  type TileSourceId,
} from '../../services/map/slippyMap';
import { rememberTileLayer, tileLayer } from '../../services/map/tileLayer';
import { useUnits, type Units } from '../../prefs/useUnits';
import { fmtNum, withUnit, shortDigits } from '../../i18n/format';
import { siToUi } from '../../prefs/units';
import { useTileVerdict } from '../common/map/useTileVerdict';
import { MapCredit, TileImg, TileLayerButtons } from '../common/map/MapParts';
import { SOURCE_LAYERS } from '../common/map/mapStyle';
import { useSiteMapView, type View } from './useSiteMapView';

export function SiteMap({
  latitudeDeg,
  longitudeDeg,
  onPick,
  className = 'h-64',
}: {
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  onPick?: (latitudeDeg: number, longitudeDeg: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const keysId = useId();
  const [source, setSource] = useState<TileSourceId>(tileLayer());
  const { imagery, onTileLoad, onTileError, retry } = useTileVerdict(source);
  const tiles = TILE_SOURCES[source];

  const pickSource = (id: TileSourceId) => {
    rememberTileLayer(id);
    retry();
    setSource(id);
  };
  const live = imagery !== 'unavailable';
  const { size, view, setView, setZoom, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown } =
    useSiteMapView({ hostRef, latitudeDeg, longitudeDeg, onPick, maxZoom: tiles.maxZoom, live });

  const pin =
    latitudeDeg === null || longitudeDeg === null
      ? null
      : project(latitudeDeg, longitudeDeg, view.lat, view.lon, view.zoom, size.w, size.h);
  const pinVisible = pin !== null && pin.x > -40 && pin.y > -40 && pin.x < size.w + 40 && pin.y < size.h + 40;

  const ariaLabel =
    latitudeDeg === null || longitudeDeg === null
      ? t('map.label')
      : `${t('map.label')}: ${formatCoord(latitudeDeg, longitudeDeg)}`;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div // eslint-disable-line jsx-a11y-x/no-noninteractive-element-interactions -- a focusable map: the arrows pan it and +/- zoom it, and the group names it without claiming a widget role it does not fit
        ref={hostRef}
        role="group"
        aria-label={ariaLabel}
        aria-describedby={imagery === 'unavailable' ? undefined : keysId}
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focusable map: the arrows pan it and +/- zoom it, and the group names it without claiming a widget role it does not fit
        tabIndex={imagery === 'unavailable' ? undefined : 0}
        onKeyDown={imagery === 'unavailable' ? undefined : onKeyDown}
        // `touch-none` or the browser cancels the pointer to scroll.
        className={`group relative min-h-0 flex-1 overflow-hidden rounded-lg bg-raised ring-1 ring-line/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
          imagery === 'unavailable'
            ? 'cursor-default'
            : `touch-none ${onPick ? 'cursor-crosshair' : 'cursor-grab'} active:cursor-grabbing`
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {imagery === 'unavailable' ? (
          <Graticule latitudeDeg={latitudeDeg} longitudeDeg={longitudeDeg} width={size.w} height={size.h} />
        ) : (
          visibleTiles(view.lat, view.lon, view.zoom, size.w, size.h).map((tile) => (
            <TileImg
              key={`${source}:${tile.key}`}
              source={source}
              tile={tile}
              className="pointer-events-none"
              onLoad={onTileLoad}
              onError={onTileError}
            />
          ))
        )}

        {pinVisible && pin && (
          <div
            aria-hidden
            className="pointer-events-none absolute text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            // The pin's point is the bottom center of the glyph, not its middle.
            style={{ left: pin.x, top: pin.y, transform: 'translate(-50%, -100%)' }}
          >
            📍
          </div>
        )}

        <TileLayerButtons layers={SOURCE_LAYERS} value={source} onPick={pickSource} />
        {live && (
          <MapOverlays
            keysId={keysId}
            picking={!!onPick}
            zoom={view.zoom}
            maxZoom={tiles.maxZoom}
            setZoom={setZoom}
            recenterTo={
              !pinVisible && latitudeDeg !== null && longitudeDeg !== null
                ? { lat: latitudeDeg, lon: longitudeDeg }
                : null
            }
            setView={setView}
            attribution={tiles.attribution}
          />
        )}
      </div>

      <MapFooter latitudeDeg={latitudeDeg} longitudeDeg={longitudeDeg} live={live} picking={!!onPick} view={view} />
    </div>
  );
}

function MapOverlays({
  keysId,
  picking,
  zoom,
  maxZoom,
  setZoom,
  recenterTo,
  setView,
  attribution,
}: {
  keysId: string;
  picking: boolean;
  zoom: number;
  maxZoom: number;
  setZoom: (next: number) => void;
  recenterTo: { lat: number; lon: number } | null;
  setView: (update: (v: View) => View) => void;
  attribution: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <span id={keysId} className="sr-only">
        {t(picking ? 'map.keysPick' : 'map.keysView')}
      </span>
      {picking && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-xl text-accent-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] group-focus-visible:block"
        >
          +
        </div>
      )}
      <div className="absolute right-1 top-1 flex flex-col overflow-hidden rounded-md ring-1 ring-shade/40">
        <button
          onClick={() => setZoom(zoom + 1)}
          disabled={zoom >= maxZoom}
          aria-label={t('map.zoomIn')}
          className="bg-surface/80 px-2 py-0.5 text-sm text-ink hover:bg-raised disabled:opacity-40"
        >
          +
        </button>
        <button
          onClick={() => setZoom(zoom - 1)}
          disabled={zoom <= MIN_ZOOM}
          aria-label={t('map.zoomOut')}
          className="bg-surface/80 px-2 py-0.5 text-sm text-ink hover:bg-raised disabled:opacity-40"
        >
          −
        </button>
      </div>
      {recenterTo && (
        <button
          onClick={() => setView((v) => ({ ...v, ...recenterTo }))}
          className="absolute bottom-1 left-1 rounded-md bg-surface/80 px-2 py-1 text-[11px] text-ink ring-1 ring-shade/40 hover:bg-raised"
        >
          <span aria-hidden="true">◎</span> {t('map.recenter')}
        </button>
      )}
      <MapCredit>{attribution}</MapCredit>
    </>
  );
}

function MapFooter({
  latitudeDeg,
  longitudeDeg,
  live,
  picking,
  view,
}: {
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  live: boolean;
  picking: boolean;
  view: View;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  return (
    <>
      <p className="flex items-baseline justify-between gap-2 text-[11px] leading-tight text-ink-muted">
        <span className="tabular-nums">
          {latitudeDeg === null || longitudeDeg === null ? t('map.noCoords') : formatCoord(latitudeDeg, longitudeDeg)}
        </span>
        {!live ? (
          <span className="shrink-0 text-warn-400">{t('map.offline')}</span>
        ) : (
          <span className="shrink-0 tabular-nums">{scaleLabel(u, view.lat, view.zoom)}</span>
        )}
      </p>
      {picking && live && <p className="text-[11px] leading-tight text-ink-faint">{t('map.pick')}</p>}
    </>
  );
}

const SCALE_PROMOTION: Record<string, string> = { m: 'km', ft: 'mi' };

function scaleLabel(u: Units, lat: number, zoom: number): string {
  const meters = metersPerPixel(lat, zoom) * 100;
  const sym = u.sym('distance');
  const up = SCALE_PROMOTION[sym];
  const big = up ? siToUi('distance', up, meters) : 0;
  if (up && big >= 1) return withUnit(fmtNum(big, shortDigits(big)), up);
  return u.fmtSym('distance', meters, 0);
}

/** Offline fallback; the stronger equator and prime meridian catch a flipped sign. */
function Graticule({
  latitudeDeg,
  longitudeDeg,
  width,
  height,
}: {
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  width: number;
  height: number;
}) {
  const x = longitudeDeg === null ? null : ((longitudeDeg + 180) / 360) * width;
  const y = latitudeDeg === null ? null : ((90 - latitudeDeg) / 180) * height;
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [-60, -30, 0, 30, 60];

  return (
    <svg width={width} height={height} className="absolute inset-0" aria-hidden>
      <rect width={width} height={height} className="fill-raised" />
      {meridians.map((lon) => (
        <line
          key={lon}
          x1={((lon + 180) / 360) * width}
          x2={((lon + 180) / 360) * width}
          y1={0}
          y2={height}
          className={lon === 0 ? 'stroke-ink-faint' : 'stroke-elevated'}
          strokeWidth={1}
        />
      ))}
      {parallels.map((lat) => (
        <line
          key={lat}
          y1={((90 - lat) / 180) * height}
          y2={((90 - lat) / 180) * height}
          x1={0}
          x2={width}
          className={lat === 0 ? 'stroke-ink-faint' : 'stroke-elevated'}
          strokeWidth={1}
        />
      ))}
      {x !== null && y !== null && (
        <>
          <circle cx={x} cy={y} r={5} className="fill-accent-400" />
          <circle cx={x} cy={y} r={11} className="fill-none stroke-accent-400/60" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}
