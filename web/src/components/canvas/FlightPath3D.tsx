import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlightEventType, FlightResult, RocketTree } from '../../engine/openRocketEngine';
import { useSettings } from '../../state/useSettings';
import { withFixedUnit } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { carrierAt, flightBodies } from '../../services/flight/flightBodies';
import { flightBranches } from '../../services/flight/flightColumns';
import { eventLabel, eventRows, type EventRow } from '../../services/flight/flightEvents';
import { windAt } from '../../services/flight/flightWind';
import { lerpAt } from '../../services/flight/interpolate';
import { buildFlightScene, eventPills } from './flightScene';
import type { Exhaust } from '../../services/motors/exhaust';
import type { MotorDims } from '../../tree/schematicGeometry';
import { TILE_SOURCES, type TileSourceId } from '../../services/map/slippyMap';
import { LAYERS } from '../common/map/mapStyle';
import { MapCredit, TileLayerButtons } from '../common/map/MapParts';
import { useSiteGround } from '../common/map/useTileVerdict';
import { ColorInput } from '../common/ColorInput';
import { FlightDial } from './FlightDial';
import { dialFace } from './flightDialFace';
import { FlightPathScene } from './FlightPathScene';
import { FlightLabels, TargetRingMark } from './FlightLabels';
import { FlightCountdown, FlightPlaybackBar } from './FlightPlaybackBar';
import { useFlightPlayback } from './useFlightPlayback';
import { useFlightRecorder } from './useFlightRecorder';
import { canRecordVideo, captionAt } from '../../services/exports/flightVideo';
import { exportFilename } from '../../services/files/saveFile';

// Seconds of video each event's caption stays up.
const CALLOUT_HOLD_S = 2.5;
const CALLOUT_MIN_ALT_M = 1;

// As the engine's, for a flight whose launch is unknown.
const DEFAULT_ROD_M = 1;

const MARKED: readonly string[] = [
  'LIFTOFF',
  'BURNOUT',
  'STAGE_SEPARATION',
  'APOGEE',
  'RECOVERY_DEVICE_DEPLOYMENT',
  'GROUND_HIT',
] satisfies FlightEventType[];

const markedEvents = (result: FlightResult, duration: number): EventRow[] =>
  eventRows(result).filter((e) => MARKED.includes(e.type) && e.time <= duration);

export function FlightPath3D({
  result,
  tree,
  motors,
  exhausts,
  rodLengthM,
  latitudeDeg,
  longitudeDeg,
}: {
  result: FlightResult;
  tree: RocketTree;
  motors?: MotorDims;
  exhausts?: Readonly<Record<string, Exhaust>>;
  rodLengthM?: number | null;
  latitudeDeg?: number | null;
  longitudeDeg?: number | null;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const altitudeUnit = u.at(unitScope('sim', 'apogee'), 'distance');
  const velocityUnit = u.at(unitScope('sim', 'maxSpeed'), 'velocity');
  const { settings, update, updateSection } = useSettings();
  const phase = settings.phaseColors;
  const controls = useFlightPlayback(settings.replaySpeed);
  const { progress } = controls;
  const { site, ground } = useSiteGround(latitudeDeg, longitudeDeg);

  const scene = useMemo(() => buildFlightScene(result, phase), [result, phase]);
  const bodies = useMemo(() => flightBodies(tree, result), [tree, result]);
  const names = useMemo(() => {
    const named = flightBranches(result).map((b, i) => b.name || t('flight.stageN', { n: i + 1 }));
    // Unnamed stages share the kernel's name.
    return named.map((name, i) => (named.indexOf(name) < i ? `${name} (${i + 1})` : name));
  }, [result, t]);
  // Another flight may have fewer.
  const playback = { ...controls, tracked: controls.tracked < bodies.length ? controls.tracked : 0 };
  const { duration } = scene;
  const events = useMemo(() => markedEvents(result, duration), [result, duration]);
  const nowT = progress * duration;
  const track = scene.tracks[playback.tracked] ?? scene;
  const carrier = bodies[carrierAt(bodies, playback.tracked, nowT)];
  const wind = carrier ? windAt(carrier.branch.series, nowT) : null;
  const roseRef = useRef<SVGGElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringLabelRef = useRef<HTMLDivElement>(null);
  const ringPlaceRef = useRef<HTMLDivElement>(null);
  // Liftoff and landing are at the ground: their height says nothing.
  const callouts = useMemo(
    () =>
      events.map((e) => {
        const name = eventLabel(t, e, names);
        const alt = e.altitude ?? 0;
        return { time: e.time, text: alt > CALLOUT_MIN_ALT_M ? `${name} ${altitudeUnit.fmtSym(alt)}` : name };
      }),
    [events, names, t, altitudeUnit],
  );
  const labels = settings.flightLabels;
  const pills = useMemo(
    () =>
      labels
        ? eventPills(
            scene,
            events.map((e) => ({ time: e.time, branch: e.branch, text: eventLabel(t, e, names) })),
          )
        : [],
    [labels, scene, events, names, t],
  );
  const ticks = useMemo(
    () => (duration > 0 ? [...new Set(events.map((e) => e.time))].map((time) => time / duration) : []),
    [events, duration],
  );
  const boxRef = useRef<HTMLDivElement>(null);
  // Read each video frame from the live clock: `nowT` lags by the HUD throttle.
  const recorder = useFlightRecorder(
    boxRef,
    controls,
    () => {
      const at = controls.progressRef.current * duration;
      const liveCarrier = bodies[carrierAt(bodies, playback.tracked, at)];
      const liveWind = liveCarrier ? windAt(liveCarrier.branch.series, at) : null;
      return {
        hud: [
          { label: t('flight.altitude'), value: altitudeUnit.fmtSym(lerpAt(track.times, track.alts, at) ?? 0) },
          { label: t('flight.velocity'), value: velocityUnit.fmtSym(lerpAt(track.times, track.vels, at) ?? 0) },
          { label: t('flight.time'), value: withFixedUnit(at, t('units.second')) },
        ],
        legend: [
          { color: phase.boost, label: t('flight.boost') },
          { color: phase.coast, label: t('flight.coast') },
          { color: phase.descent, label: t('flight.descent') },
        ],
        dial: dialFace(liveWind, roseRef.current, u, t('flight.north')),
        // Held for the same stretch of video whatever the playback speed.
        caption: captionAt(callouts, at, CALLOUT_HOLD_S * controls.speed),
        timeline: { progress: controls.progressRef.current, ticks },
        clock: { at, callouts },
      };
    },
    () => {
      const base = exportFilename([tree.name, 'flight'], '').slice(0, -1);
      return { base, title: tree.name?.trim() || base };
    },
  );
  const [canRecord] = useState(canRecordVideo);
  const handed = recorder.wrap(playback);

  // Every hook sits above the empty-state return so the hook count never changes.
  const setBoost = useCallback((c: string) => updateSection('phaseColors', { boost: c }), [updateSection]);
  const setCoast = useCallback((c: string) => updateSection('phaseColors', { coast: c }), [updateSection]);
  const setDescent = useCallback((c: string) => updateSection('phaseColors', { descent: c }), [updateSection]);

  const mapSource: TileSourceId | null = ground.imagery === 'unavailable' ? null : ground.source;

  if (scene.scenePts.length < 2) {
    return <div className="grid h-full place-items-center text-sm text-ink-faint">{t('sim.prompt')}</div>;
  }

  return (
    <div ref={boxRef} className="relative h-full overflow-hidden rounded-xl bg-canvas ring-1 ring-line/10">
      <FlightPathScene
        scene={scene}
        pills={pills}
        labelRefs={labelRefs}
        ringLabelRef={ringLabelRef}
        ringPlaceRef={ringPlaceRef}
        bodies={bodies}
        tree={tree}
        motors={motors}
        exhausts={exhausts}
        site={site}
        mapSource={mapSource}
        ground={ground}
        rodLengthM={rodLengthM ?? DEFAULT_ROD_M}
        effects={settings.flightEffects}
        roseRef={roseRef}
        nowT={nowT}
        playback={handed}
      />
      <FlightLabels pills={pills} nowT={nowT} labelRefs={labelRefs} />
      <TargetRingMark placeRef={ringPlaceRef} ringRef={ringLabelRef} />

      <div className="pointer-events-none absolute left-3 top-3 flex gap-3 rounded-lg bg-surface/80 px-3 py-2 text-xs ring-1 ring-line/10">
        <Hud label={t('flight.altitude')} value={altitudeUnit.fmtSym(lerpAt(track.times, track.alts, nowT) ?? 0)} />
        <Hud label={t('flight.velocity')} value={velocityUnit.fmtSym(lerpAt(track.times, track.vels, nowT) ?? 0)} />
        <Hud label={t('flight.time')} value={withFixedUnit(nowT, t('units.second'))} />
      </div>
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="flex flex-col gap-1 rounded-lg bg-surface/80 px-2 py-1.5 text-[10px] ring-1 ring-line/10">
          <Legend color={phase.boost} label={t('flight.boost')} onChange={setBoost} />
          <Legend color={phase.coast} label={t('flight.coast')} onChange={setCoast} />
          <Legend color={phase.descent} label={t('flight.descent')} onChange={setDescent} />
        </div>
        <FlightDial roseRef={roseRef} wind={wind} />
      </div>
      {site && (
        <TileLayerButtons
          layers={LAYERS}
          value={ground.layer}
          onPick={ground.pick}
          className="absolute left-3 top-16"
        />
      )}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-end gap-1">
        {mapSource && <MapCredit className="">{TILE_SOURCES[mapSource].attribution}</MapCredit>}
        {recorder.error && (
          <MapCredit warn className="">
            {t('flight.recordFailed', { message: recorder.error })}
          </MapCredit>
        )}
        {ground.source && ground.imagery === 'unavailable' && (
          <MapCredit warn className="">
            {t('map.offline')}
          </MapCredit>
        )}
        <FlightPlaybackBar
          playback={handed}
          nowT={nowT}
          duration={duration}
          bodies={names}
          events={events}
          effects={settings.flightEffects}
          onEffects={(v) => update({ flightEffects: v })}
          labels={labels}
          onLabels={(v) => update({ flightLabels: v })}
          recorder={canRecord ? recorder : undefined}
        />
      </div>
      <FlightCountdown countdown={playback.countdown} />
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
