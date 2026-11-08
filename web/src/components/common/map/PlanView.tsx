import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { rangeRings, type GroundPoint } from '../../../services/flight/groundTrack';
import { TILE_SOURCES, metersPerPixel, visibleTiles, zoomForMetersPerPixel } from '../../../services/map/slippyMap';
import { HALO, LAYERS, MAX_MAGNIFICATION } from './mapStyle';
import { MapCredit, TileImg, TileLayerButtons } from './MapParts';
import type { useGroundLayer } from './useTileVerdict';

export interface PlanGeometry {
  half: number;
  X: (east: number) => number;
  Y: (north: number) => number;
  poly: (points: readonly GroundPoint[]) => string;
  mapOn: boolean;
}

const PAD = 18;

export function PlanView({
  size,
  extent,
  site,
  ground,
  fmtDist,
  ariaLabel,
  under,
  children,
  overlay,
}: {
  size: number;
  /** Meters from the pad to the edge of the drawing. */
  extent: number;
  site: { lat: number; lon: number } | null;
  ground: ReturnType<typeof useGroundLayer>;
  fmtDist: (m: number) => string;
  ariaLabel: string;
  under?: (g: PlanGeometry) => ReactNode;
  children: (g: PlanGeometry) => ReactNode;
  overlay?: ReactNode;
}) {
  const { t } = useTranslation();
  const half = size / 2;
  const scale = (half - PAD) / extent;
  const X = (east: number) => half + east * scale;
  const Y = (north: number) => half - north * scale;
  const poly = (points: readonly GroundPoint[]) =>
    points.map((p) => `${X(p.east).toFixed(1)},${Y(p.north).toFixed(1)}`).join(' ');
  const rings = rangeRings(extent);

  const { source, imagery } = ground;
  const tiles = site && source ? TILE_SOURCES[source] : null;
  // The rings own the scale: nearest tile zoom, then the tile layer scaled by the leftover fraction.
  const drawnMpp = extent / (half - PAD);
  const tileZoom = site && tiles ? zoomForMetersPerPixel(site.lat, drawnMpp, tiles.maxZoom) : 0;
  const tileScale = site && tiles ? metersPerPixel(site.lat, tileZoom) / drawnMpp : 1;
  const tileBox = Math.ceil(size / tileScale);
  const tooClose = tileScale > MAX_MAGNIFICATION;
  const mapOn = tiles !== null && imagery !== 'unavailable' && !tooClose;
  const g: PlanGeometry = { half, X, Y, poly, mapOn };
  const grid = mapOn ? 'stroke-line/40' : 'stroke-line/10';

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${mapOn ? 'rounded-lg ring-1 ring-line/10' : ''}`}
      style={{ width: size, height: size }}
    >
      {mapOn && site && source && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{ width: tileBox, height: tileBox, transform: `translate(-50%, -50%) scale(${tileScale})` }}
        >
          {visibleTiles(site.lat, site.lon, tileZoom, tileBox, tileBox).map((tile) => (
            <TileImg
              key={`${source}:${tile.key}`}
              source={source}
              tile={tile}
              onLoad={ground.onTileLoad}
              onError={ground.onTileError}
            />
          ))}
        </div>
      )}
      {mapOn && <div aria-hidden className="pointer-events-none absolute inset-0 bg-canvas/30" />}

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className="absolute inset-0"
      >
        {under?.(g)}
        {rings.map((r) => (
          <g key={r}>
            <circle cx={half} cy={half} r={r * scale} fill="none" className={grid} />
            <text
              x={half + 3}
              y={Y(r) + 10}
              style={mapOn ? HALO : undefined}
              className={`text-[9px] tabular-nums ${mapOn ? 'fill-on-accent' : 'fill-ink-faint'}`}
            >
              {fmtDist(r)}
            </text>
          </g>
        ))}
        <line x1={PAD} y1={half} x2={size - PAD} y2={half} className={grid} />
        <line x1={half} y1={PAD} x2={half} y2={size - PAD} className={grid} />
        <text
          x={half}
          y={PAD - 4}
          textAnchor="middle"
          style={mapOn ? HALO : undefined}
          className={`text-[10px] font-semibold ${mapOn ? 'fill-on-accent' : 'fill-ink-muted'}`}
        >
          {t('flight.north')}
        </text>
        {children(g)}
        {mapOn && <circle cx={half} cy={half} r={5} className="fill-canvas/75" />}
        <circle cx={half} cy={half} r={3.5} className="fill-ink" />
      </svg>

      {site && <TileLayerButtons layers={LAYERS} value={ground.layer} onPick={ground.pick} />}
      {overlay}
      {mapOn && tiles && <MapCredit>{tiles.attribution}</MapCredit>}
      {tiles && !mapOn && <MapCredit warn>{tooClose ? t('map.tooClose') : t('map.offline')}</MapCredit>}
    </div>
  );
}
