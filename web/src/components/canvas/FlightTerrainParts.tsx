import { useTranslation } from 'react-i18next';
import type { FlightResult } from '../../engine/openRocketEngine';
import { fmtDegrees, fmtGroundDistance, useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { flightBranches } from '../../services/flight/flightColumns';
import { bearingFromPad, distanceFromPad, landingPoint, type GroundPoint } from '../../services/flight/groundTrack';
import { mapButtonClass } from '../common/map/mapButton';
import { MapCredit } from '../common/map/MapParts';
import { TERRAIN_ATTRIBUTION } from '../../services/map/terrainTiles';
import type { FlightScene } from './flightScene';
import { TERRAIN_SCALES, type TerrainFailure, type useFlightTerrain } from './useFlightTerrain';

/** The terrain switch and how tall to draw it, and once it is loaded, where the flight lands on it. */
export function TerrainPanel({
  terrain,
  result,
  scene,
  names,
}: {
  terrain: ReturnType<typeof useFlightTerrain>;
  result: FlightResult;
  scene: FlightScene;
  names: readonly string[];
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        <TerrainToggle terrain={terrain} />
        {terrain.on && <TerrainScale terrain={terrain} />}
      </div>
      {terrain.field && <TerrainLandings result={result} scene={scene} names={names} scale={terrain.scale} />}
    </>
  );
}

function TerrainToggle({ terrain }: { terrain: ReturnType<typeof useFlightTerrain> }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={() => terrain.toggle(!terrain.on)}
      aria-pressed={terrain.on}
      title={t('flight.terrainHint')}
      className={`${mapButtonClass(terrain.on)} rounded-md ring-1 ring-shade/40`}
    >
      {terrain.status === 'loading' ? t('flight.terrainLoading') : t('flight.terrain')}
    </button>
  );
}

function TerrainScale({ terrain }: { terrain: ReturnType<typeof useFlightTerrain> }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('flight.terrainScale')}
      title={t('flight.terrainScaleHint')}
      className="flex overflow-hidden rounded-md ring-1 ring-shade/40"
    >
      {TERRAIN_SCALES.map((n) => (
        <button
          key={n}
          onClick={() => terrain.setScale(n)}
          aria-pressed={terrain.scale === n}
          className={mapButtonClass(terrain.scale === n)}
        >
          {t('flight.terrainScaleN', { n })}
        </button>
      ))}
    </div>
  );
}

export function TerrainCredits({ terrain }: { terrain: ReturnType<typeof useFlightTerrain> }) {
  const { t } = useTranslation();
  if (terrain.field) return <MapCredit className="">{TERRAIN_ATTRIBUTION}</MapCredit>;
  if (terrain.failure) {
    return (
      <MapCredit warn className="">
        {failureText(t, terrain.failure)}
      </MapCredit>
    );
  }
  return null;
}

// Keys spelled out: the key-coverage test cannot see keys built from a variable.
function failureText(t: (key: string, opts?: Record<string, unknown>) => string, f: TerrainFailure): string {
  if (f.kind === 'download') return t('flight.terrainFailedDownload', { failed: f.failed, total: f.total });
  if (f.kind === 'blocked') return t('flight.terrainFailedBlocked');
  return t('flight.terrainFailedCoverage');
}

/** Where each branch comes down on the terrain, beside where the engine, on level ground, has it land. */
function TerrainLandings({
  result,
  scene,
  names,
  scale,
}: {
  result: FlightResult;
  scene: FlightScene;
  names: readonly string[];
  scale: number;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const dist = u.at(unitScope('sim', 'downrange'), 'distance');
  const alt = u.at(unitScope('sim', 'apogee'), 'distance');
  const branches = flightBranches(result);
  const where = (p: GroundPoint) =>
    `${fmtGroundDistance(dist, distanceFromPad(p))}, ${fmtDegrees(u, bearingFromPad(p))}`;
  const rows = scene.tracks.flatMap((track, i) => {
    const engine = landingPoint(branches[i]?.series);
    const end = track.scenePts.at(-1);
    if (!engine || !end) return [];
    const s = scene.unitsPerMeter;
    const onTerrain = { east: end.x / s, north: -end.z / s };
    const from = track.times.findIndex((at) => at >= track.estimatedFromT);
    const top = track.alts[from];
    const bottom = track.alts.at(-1);
    const drop = top != null && bottom != null ? top - bottom : 0;
    return [{ i, onTerrain, engine, drop }];
  });
  if (!rows.length) return null;
  return (
    <div className="pointer-events-none max-w-72 rounded-md bg-surface/85 px-2 py-1 text-[11px] leading-snug ring-1 ring-shade/40">
      {rows.map(({ i, onTerrain, engine, drop }) => (
        <p key={i} className="text-ink-soft">
          <span className="font-semibold text-ink-strong">
            {rows.length > 1 ? t('flight.terrainStageLands', { stage: names[i] }) : t('flight.terrainLands')}
          </span>{' '}
          {where(onTerrain)}
          <span className="block text-ink-muted">
            {t('flight.terrainEngine', { where: where(engine) })}
            {drop > 0.5 && <> · {t('flight.terrainEstimated', { drop: alt.fmtSym(drop) })}</>}
          </span>
        </p>
      ))}
      {scale !== 1 && <p className="text-warn-400">{t('flight.terrainScaled', { n: scale })}</p>}
    </div>
  );
}
