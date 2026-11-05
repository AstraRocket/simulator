import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlightResult, RocketTree } from '../../engine/openRocketEngine';
import { useSettings } from '../../state/useSettings';
import { withFixedUnit } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import { buildFlightScene, indexForProgress } from './flightScene';
import type { Exhaust } from '../../services/motors/exhaust';
import type { MotorDims } from '../../tree/schematicGeometry';
import { TILE_SOURCES, type TileSourceId } from '../../services/map/slippyMap';
import { LAYERS } from '../common/map/mapStyle';
import { MapCredit, TileLayerButtons } from '../common/map/MapParts';
import { useGroundLayer } from '../common/map/useTileVerdict';
import { ColorInput } from '../common/ColorInput';
import { FlightPathScene } from './FlightPathScene';
import { FlightPlaybackBar } from './FlightPlaybackBar';
import { useFlightPlayback } from './useFlightPlayback';

export function FlightPath3D({
  result,
  tree,
  motors,
  exhausts,
  latitudeDeg,
  longitudeDeg,
}: {
  result: FlightResult;
  tree: RocketTree;
  motors?: MotorDims;
  exhausts?: readonly Exhaust[];
  latitudeDeg?: number | null;
  longitudeDeg?: number | null;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const { settings, update } = useSettings();
  const phase = settings.phaseColors;
  const playback = useFlightPlayback(settings.playbackSpeed);
  const { progress } = playback;
  const site = latitudeDeg != null && longitudeDeg != null ? { lat: latitudeDeg, lon: longitudeDeg } : null;
  const ground = useGroundLayer(site !== null);

  const scene = useMemo(() => buildFlightScene(result, phase), [result, phase]);
  const { scenePts, times, alts, vels } = scene;
  const n = scenePts.length;

  // Every hook sits above the empty-state return so the hook count never changes.
  const idx = useMemo(() => indexForProgress(times, progress), [times, progress]);
  const nowT = times[idx] ?? 0;

  const setBoost = useCallback((c: string) => update({ phaseColors: { ...phase, boost: c } }), [update, phase]);
  const setCoast = useCallback((c: string) => update({ phaseColors: { ...phase, coast: c } }), [update, phase]);
  const setDescent = useCallback((c: string) => update({ phaseColors: { ...phase, descent: c } }), [update, phase]);

  const mapSource: TileSourceId | null = ground.imagery === 'unavailable' ? null : ground.source;

  if (n < 2) {
    return <div className="grid h-full place-items-center text-sm text-ink-faint">{t('sim.prompt')}</div>;
  }

  return (
    <div className="relative h-full overflow-hidden rounded-xl bg-canvas ring-1 ring-line/10">
      <FlightPathScene
        scene={scene}
        tree={tree}
        motors={motors}
        exhausts={exhausts}
        site={site}
        mapSource={mapSource}
        ground={ground}
        idx={idx}
        playback={playback}
      />

      <div className="pointer-events-none absolute left-3 top-3 flex gap-3 rounded-lg bg-surface/80 px-3 py-2 text-xs ring-1 ring-line/10">
        <Hud label={t('flight.altitude')} value={`${u.fmtSym('distance', alts[idx] ?? 0)}`} />
        <Hud label={t('flight.velocity')} value={`${u.fmtSym('velocity', vels[idx] ?? 0)}`} />
        <Hud label={t('flight.time')} value={withFixedUnit(nowT, t('units.second'))} />
      </div>
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1 rounded-lg bg-surface/80 px-2 py-1.5 text-[10px] ring-1 ring-line/10">
        <Legend color={phase.boost} label={t('flight.boost')} onChange={setBoost} />
        <Legend color={phase.coast} label={t('flight.coast')} onChange={setCoast} />
        <Legend color={phase.descent} label={t('flight.descent')} onChange={setDescent} />
      </div>
      {site && (
        <TileLayerButtons
          layers={LAYERS}
          value={ground.layer}
          onPick={ground.pick}
          className="absolute left-3 top-16"
        />
      )}
      {mapSource && <MapCredit className="absolute bottom-16 right-3">{TILE_SOURCES[mapSource].attribution}</MapCredit>}
      {ground.source && ground.imagery === 'unavailable' && (
        <MapCredit warn className="absolute bottom-16 right-3">
          {t('map.offline')}
        </MapCredit>
      )}

      <FlightPlaybackBar playback={playback} nowT={nowT} />
    </div>
  );
}

function Hud({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink-strong">{value}</span>
    </span>
  );
}

// `pointer-events-auto` overrides the legend box's inherited `pointer-events-none`.
function Legend({ color, label, onChange }: { color: string; label: string; onChange: (c: string) => void }) {
  return (
    <label className="pointer-events-auto flex cursor-pointer items-center gap-1.5 text-ink-soft" title={label}>
      <ColorInput
        value={color}
        onCommit={onChange}
        className="h-3 w-3 cursor-pointer appearance-none rounded-sm border border-line/20 bg-transparent p-0"
        style={{ background: color }}
      />
      {label}
    </label>
  );
}
