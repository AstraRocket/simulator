import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MIN_ZOOM,
  SITE_ZOOM,
  TILE_SOURCES,
  formatCoord,
  metersPerPixel,
  project,
  roundCoord,
  unproject,
  visibleTiles,
  type TileSourceId,
  panView,
} from '../../services/map/slippyMap';
import { rememberTileLayer, tileLayer } from '../../services/map/tileLayer';
import { useUnits, type Units } from '../../prefs/useUnits';
import { fmtNum, withUnit, shortDigits } from '../../i18n/format';
import { siToUi } from '../../prefs/units';
import { useElementResize } from '../common/useElementResize';
import { useTileVerdict } from '../common/map/useTileVerdict';
import { MapCredit, TileImg, TileLayerButtons } from '../common/map/MapParts';
import { SOURCE_LAYERS } from '../common/map/mapStyle';
import { useNativeWheel } from '../common/useNativeWheel';

const CLICK_SLOP_PX = 4;

const KEY_PAN_PX = 80;

interface View {
  lat: number;
  lon: number;
  zoom: number;
}

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
  const u = useUnits();
  const hostRef = useRef<HTMLDivElement>(null);
  const keysId = useId();
  const [size, setSize] = useState({ w: 320, h: 256 });
  const [source, setSource] = useState<TileSourceId>(tileLayer());
  const [view, setView] = useState<View>({
    lat: latitudeDeg ?? 0,
    lon: longitudeDeg ?? 0,
    zoom: latitudeDeg === null || longitudeDeg === null ? 2 : SITE_ZOOM,
  });
  const { imagery, onTileLoad, onTileError, retry } = useTileVerdict(source);
  const tiles = TILE_SOURCES[source];

  const pickSource = (id: TileSourceId) => {
    rememberTileLayer(id);
    retry();
    setSource(id);
  };

  useElementResize(hostRef, (r) => {
    if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
  });

  // Recenter on outside changes only; following our own click would snap the view from the pointer.
  const emitted = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    if (latitudeDeg === null || longitudeDeg === null) return;
    const mine = emitted.current;
    if (mine && Math.abs(mine.lat - latitudeDeg) < 1e-9 && Math.abs(mine.lon - longitudeDeg) < 1e-9) return;
    setView((v) => ({
      lat: latitudeDeg,
      lon: longitudeDeg,
      zoom: v.zoom < SITE_ZOOM - 3 ? SITE_ZOOM : v.zoom,
    }));
  }, [latitudeDeg, longitudeDeg]);

  const setZoom = (next: number, about?: { x: number; y: number }) => {
    const z = Math.max(MIN_ZOOM, Math.min(tiles.maxZoom, next));
    if (z === view.zoom) return;
    if (!about) return setView((v) => ({ ...v, zoom: z }));
    const at = unproject(about.x, about.y, view.lat, view.lon, view.zoom, size.w, size.h);
    setView(
      panView({ lat: at.latitudeDeg, lon: at.longitudeDeg, zoom: z }, size.w / 2 - about.x, size.h / 2 - about.y),
    );
  };

  const drag = useRef<{ id: number; x: number; y: number; view: View; moved: number } | null>(null);
  // A second finger ends the gesture, so the last finger lifting is not a tap.
  const down = useRef(new Set<number>());
  const release = (e: React.PointerEvent) => {
    down.current.delete(e.pointerId);
  };

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (imagery === 'unavailable') return;
    // Button clicks bubble here; leaving `drag` unset makes `onPointerUp` bail.
    if ((e.target as Element).closest?.('button')) return;
    // Captured on the box, not `e.target`: a tile unmounts mid-drag and drops the capture.
    down.current.add(e.pointerId);
    if (down.current.size > 1) {
      drag.current = null;
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, view, moved: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
    if (d.moved < CLICK_SLOP_PX) return;
    // The ground follows the pointer, so the center moves the other way.
    setView(panView(d.view, -dx, -dy));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const pan = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (pan) {
      e.preventDefault();
      setView(panView(view, pan[0]! * KEY_PAN_PX, pan[1]! * KEY_PAN_PX));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setZoom(view.zoom + 1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setZoom(view.zoom - 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && onPick) {
      e.preventDefault();
      const lat = roundCoord(view.lat);
      const lon = roundCoord(view.lon);
      emitted.current = { lat, lon };
      onPick(lat, lon);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    release(e);
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved >= CLICK_SLOP_PX || !onPick) return;
    const p = localPoint(e);
    const at = unproject(p.x, p.y, view.lat, view.lon, view.zoom, size.w, size.h);
    const lat = roundCoord(at.latitudeDeg);
    const lon = roundCoord(at.longitudeDeg);
    emitted.current = { lat, lon };
    onPick(lat, lon);
  };

  const pin =
    latitudeDeg === null || longitudeDeg === null
      ? null
      : project(latitudeDeg, longitudeDeg, view.lat, view.lon, view.zoom, size.w, size.h);
  const pinVisible = pin !== null && pin.x > -40 && pin.y > -40 && pin.x < size.w + 40 && pin.y < size.h + 40;

  const ariaLabel =
    latitudeDeg === null || longitudeDeg === null
      ? t('map.label')
      : `${t('map.label')}: ${formatCoord(latitudeDeg, longitudeDeg)}`;

  // Native non-passive listener: React's `onWheel` is passive, so `preventDefault` would not work.
  useNativeWheel(
    hostRef,
    (e) => {
      e.preventDefault();
      setZoom(view.zoom + (e.deltaY < 0 ? 1 : -1), localPoint(e));
    },
    imagery !== 'unavailable',
  );

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
        onPointerCancel={(e) => {
          release(e);
          drag.current = null;
        }}
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
        {imagery !== 'unavailable' && (
          <>
            <span id={keysId} className="sr-only">
              {t(onPick ? 'map.keysPick' : 'map.keysView')}
            </span>
            {onPick && (
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-xl text-accent-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] group-focus-visible:block"
              >
                +
              </div>
            )}
            <div className="absolute right-1 top-1 flex flex-col overflow-hidden rounded-md ring-1 ring-shade/40">
              <button
                onClick={() => setZoom(view.zoom + 1)}
                disabled={view.zoom >= tiles.maxZoom}
                aria-label={t('map.zoomIn')}
                className="bg-surface/80 px-2 py-0.5 text-sm text-ink hover:bg-raised disabled:opacity-40"
              >
                +
              </button>
              <button
                onClick={() => setZoom(view.zoom - 1)}
                disabled={view.zoom <= MIN_ZOOM}
                aria-label={t('map.zoomOut')}
                className="bg-surface/80 px-2 py-0.5 text-sm text-ink hover:bg-raised disabled:opacity-40"
              >
                −
              </button>
            </div>
            {!pinVisible && latitudeDeg !== null && longitudeDeg !== null && (
              <button
                onClick={() => setView((v) => ({ ...v, lat: latitudeDeg, lon: longitudeDeg }))}
                className="absolute bottom-1 left-1 rounded-md bg-surface/80 px-2 py-1 text-[11px] text-ink ring-1 ring-shade/40 hover:bg-raised"
              >
                <span aria-hidden="true">◎</span> {t('map.recenter')}
              </button>
            )}
            <MapCredit>{tiles.attribution}</MapCredit>
          </>
        )}
      </div>

      <p className="flex items-baseline justify-between gap-2 text-[11px] leading-tight text-ink-muted">
        <span className="tabular-nums">
          {latitudeDeg === null || longitudeDeg === null ? t('map.noCoords') : formatCoord(latitudeDeg, longitudeDeg)}
        </span>
        {imagery === 'unavailable' ? (
          <span className="shrink-0 text-warn-400">{t('map.offline')}</span>
        ) : (
          <span className="shrink-0 tabular-nums">{scaleLabel(u, view.lat, view.zoom)}</span>
        )}
      </p>
      {onPick && imagery !== 'unavailable' && (
        <p className="text-[11px] leading-tight text-ink-faint">{t('map.pick')}</p>
      )}
    </div>
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
