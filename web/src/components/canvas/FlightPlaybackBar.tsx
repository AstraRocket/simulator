import { useTranslation } from 'react-i18next';
import { withFixedUnit } from '../../i18n/format';
import { PLAYBACK_SPEEDS, playbackLabel } from '../../services/storage/settings';
import { ToggleButton } from '../common/ToggleButton';
import { smallButton } from '../common/smallButton';
import type { FlightPlayback } from './useFlightPlayback';

export function FlightPlaybackBar({ playback, nowT }: { playback: FlightPlayback; nowT: number }) {
  const { t } = useTranslation();
  const { progress, playing, setPlaying, speed, setSpeed, follow, setFollow, countdown, loop, setLoop } = playback;
  const { seek, handlePlay, handleReset } = playback;
  return (
    <>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-surface/85 px-3 py-2 ring-1 ring-line/10">
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
          className="shrink-0 rounded-md px-2 py-1 text-xs ring-1 ring-line/10"
        >
          ⟳
        </ToggleButton>
        <ToggleButton
          active={follow}
          onClick={() => setFollow((f) => !f)}
          title={t('flight.follow')}
          className="shrink-0 rounded-md px-2 py-1 text-xs ring-1 ring-line/10"
        >
          ⊙ {t('flight.follow')}
        </ToggleButton>
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
          className="min-w-0 flex-1 accent-accent-500"
        />
        <select
          value={speed}
          aria-label={t('flight.playbackSpeed')}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="shrink-0 rounded-md bg-raised px-1.5 py-1 text-xs text-ink ring-1 ring-line/10"
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {playbackLabel(s)}
            </option>
          ))}
        </select>
      </div>

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
