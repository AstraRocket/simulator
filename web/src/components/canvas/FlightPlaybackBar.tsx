import { useTranslation } from 'react-i18next';
import { withFixedUnit } from '../../i18n/format';
import { EVENT_NAME, type EventRow } from '../../services/flight/flightEvents';
import { PLAYBACK_SPEEDS, playbackLabel } from '../../services/storage/settings';
import { ToggleButton } from '../common/ToggleButton';
import { smallButton } from '../common/smallButton';
import { CAMERA_CHOICES, type CameraChoice } from './flightCamera';
import type { FlightPlayback } from './useFlightPlayback';

const VIEW_LABEL = {
  overview: 'flight.viewOverview',
  follow: 'flight.follow',
  pad: 'flight.viewPad',
  chase: 'flight.viewChase',
  onboard: 'flight.viewOnboard',
  director: 'flight.viewDirector',
} as const satisfies Record<CameraChoice, string>;

const SELECT = 'shrink-0 rounded-md bg-raised px-1.5 py-1 text-xs text-ink ring-1 ring-line/10';
const ICON = 'shrink-0 rounded-md px-2 py-1 text-xs ring-1 ring-line/10';

export function FlightPlaybackBar({
  playback,
  nowT,
  duration,
  bodies,
  events,
  effects,
  onEffects,
}: {
  playback: FlightPlayback;
  nowT: number;
  duration: number;
  /** Each flying body's name, the sustainer's first. */
  bodies: readonly string[];
  events: readonly EventRow[];
  effects: boolean;
  onEffects: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const { progress, playing, setPlaying, speed, setSpeed, countdown, loop, setLoop } = playback;
  const { seek, handlePlay, handleReset, tracked, setTracked, view, setView, resetView } = playback;
  const eventName = (e: EventRow) => {
    const name = t(EVENT_NAME[e.type] ?? e.type);
    return bodies.length > 1 ? `${name} (${bodies[e.branch] ?? e.branchName})` : name;
  };
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-1.5 rounded-lg bg-surface/85 px-3 py-2 ring-1 ring-line/10">
      <div className="relative">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          aria-label={t('flight.time')}
          aria-valuetext={withFixedUnit(nowT, t('units.second'))}
          onChange={(e) => {
            setPlaying(false);
            seek(parseFloat(e.target.value));
          }}
          className="block w-full accent-accent-500"
        />
        {duration > 0 &&
          events.map((e) => (
            <span
              key={e.key}
              aria-hidden
              data-event-tick={e.type}
              className="pointer-events-none absolute top-0 h-1.5 w-0.5 -translate-x-1/2 bg-warn-300"
              // The thumb's center stops half its width short of each end.
              style={{ left: `calc(8px + (100% - 16px) * ${e.time / duration})` }}
            />
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handlePlay}
          aria-label={countdown !== null ? t('flight.cancel') : playing ? t('flight.pause') : t('flight.play')}
          className={smallButton('xs', 'ink', 'shrink-0')}
        >
          {countdown !== null ? '✕' : playing ? '⏸' : '▶'}
        </button>
        <button
          onClick={handleReset}
          title={t('flight.reset')}
          aria-label={t('flight.reset')}
          className={smallButton('xs', 'ink', 'shrink-0')}
        >
          ⟲
        </button>
        <ToggleButton
          active={loop}
          onClick={() => setLoop((l) => !l)}
          title={t('flight.loop')}
          label={t('flight.loop')}
          className={ICON}
        >
          ⟳
        </ToggleButton>
        <select
          value={speed}
          aria-label={t('flight.playbackSpeed')}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className={SELECT}
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {playbackLabel(s)}
            </option>
          ))}
        </select>
        {events.length > 0 && duration > 0 && (
          <select
            value=""
            aria-label={t('flight.jumpTo')}
            onChange={(e) => {
              const event = events.find((row) => row.key === e.target.value);
              if (event) seek(event.time / duration);
            }}
            className={`max-w-20 sm:max-w-36 ${SELECT}`}
          >
            <option value="" disabled>
              {t('flight.jumpTo')}
            </option>
            {events.map((e) => (
              <option key={e.key} value={e.key}>
                {eventName(e)} · {withFixedUnit(e.time, t('units.second'))}
              </option>
            ))}
          </select>
        )}
        <ToggleButton
          active={effects}
          onClick={() => onEffects(!effects)}
          title={t('flight.effectsTitle')}
          label={t('flight.effects')}
          className={ICON}
        >
          ✨
        </ToggleButton>
        <span className="flex-1" />
        {bodies.length > 1 && (
          <select
            value={tracked}
            aria-label={t('flight.tracked')}
            title={t('flight.tracked')}
            onChange={(e) => setTracked(Number(e.target.value))}
            className={`max-w-20 sm:max-w-32 ${SELECT}`}
          >
            {bodies.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          value={view}
          aria-label={t('flight.view')}
          title={t('flight.view')}
          onChange={(e) => setView(e.target.value as CameraChoice)}
          className={SELECT}
        >
          {CAMERA_CHOICES.map((v) => (
            <option key={v} value={v}>
              {t(VIEW_LABEL[v])}
            </option>
          ))}
        </select>
        <button
          onClick={resetView}
          title={t('flight.resetView')}
          aria-label={t('flight.resetView')}
          className={smallButton('xs', 'ink', 'shrink-0')}
        >
          ⊙
        </button>
      </div>
    </div>
  );
}

export function FlightCountdown({ countdown }: { countdown: number | null }) {
  return (
    <>
      {countdown !== null && countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            key={countdown}
            style={{ animation: 'fp-cd 0.9s ease-out' }}
            className="text-8xl font-black tabular-nums text-on-accent drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]"
          >
            {countdown}
          </span>
        </div>
      )}
      <style>
        {'@keyframes fp-cd{0%{transform:scale(1.9);opacity:0}25%{opacity:1}100%{transform:scale(1);opacity:.92}}'}
      </style>
    </>
  );
}
