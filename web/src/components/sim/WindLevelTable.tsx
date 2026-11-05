import { useTranslation } from 'react-i18next';
import type { WindLevel } from '../../services/design/orkTree';
import { NumberInput } from '../common/NumberInput';
import { markRing } from '../common/markRing';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { MAX_TURBULENCE_PERCENT } from '../../services/flight/safetyLimits';
import { stdDevForIntensity, turbulenceIntensity, turbulenceLevel } from '../../services/flight/windTurbulence';
import { degToRad, radToDeg } from '../../prefs/units';
import type { WindLevels } from './useWindLevels';

const cell = 'rounded bg-raised px-1 py-1 text-right text-xs tabular-nums text-ink-strong ring-1 ring-line/10';

function WindLevelRow({
  l,
  i,
  wind: { windCap, dupeRows, patchLevel, removeLevel, setSpeed },
  onCommit,
}: {
  l: WindLevel;
  i: number;
  wind: WindLevels;
  onCommit: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const intensity = turbulenceIntensity(l.speed, l.stddev);
  return (
    <div className="flex items-center gap-1">
      <NumberInput
        step={u.step('distance', 50)}
        min={0}
        ariaLabel={t('windProfile.levelField', { field: t('windProfile.altitude'), n: i + 1 })}
        value={u.toUi('distance', l.altitudeM)}
        // No `?? 0`: an emptied box must not move the layer onto the pad.
        onChange={onSi(u.plain('distance'), (si) => si !== null && patchLevel(i, { altitudeM: si }))}
        invalid={dupeRows.has(i)}
        // `markRing`: Tailwind's emit order, not string order, decides which ring wins.
        className={markRing(`${cell} w-20`, dupeRows.has(i))}
      />
      <NumberInput
        step={u.step('windspeed', 0.5)}
        min={0}
        max={windCap(i)}
        ariaLabel={t('windProfile.levelField', { field: t('launch.speed'), n: i + 1 })}
        value={u.toUi('windspeed', l.speed)}
        // A cleared box writes nothing rather than still air.
        onChange={onSi(u.plain('windspeed'), (si) => si !== null && setSpeed(i, si))}
        className={`${cell} w-16`}
      />
      <NumberInput
        step={u.step('angle', degToRad(5))}
        ariaLabel={t('windProfile.levelField', { field: t('launch.direction'), n: i + 1 })}
        value={u.toUi('angle', degToRad(l.directionDeg))}
        onChange={onSi(
          u.plain('angle'),
          (si) => patchLevel(i, { directionDeg: si ?? 0 }),
          // Stored in degrees, like the `.ork`'s wind direction.
          (si) => radToDeg(si),
        )}
        className={`${cell} w-14`}
      />
      <NumberInput
        step={u.step('windspeed', 0.5)}
        min={0}
        max={windCap(i)}
        ariaLabel={t('windProfile.levelField', { field: t('windProfile.deviation'), n: i + 1 })}
        value={u.toUi('windspeed', l.stddev)}
        onChange={onSi(u.plain('windspeed'), (si) => patchLevel(i, { stddev: si ?? 0 }))}
        className={`${cell} w-16`}
      />
      <NumberInput
        step={1}
        min={0}
        max={MAX_TURBULENCE_PERCENT}
        ariaLabel={t('windProfile.levelField', { field: t('windProfile.turbulence'), n: i + 1 })}
        value={Math.round(intensity * 100)}
        onChange={(v) => patchLevel(i, { stddev: stdDevForIntensity(l.speed, (v ?? 0) / 100) })}
        className={`${cell} w-14`}
      />
      <span className="w-20 truncate text-[11px] text-ink-muted">
        {t(`launch.turbulenceLevel.${turbulenceLevel(intensity)}`)}
      </span>
      <button
        onClick={() => {
          removeLevel(i);
          onCommit?.();
        }}
        title={t('launch.removeLevel')}
        aria-label={t('windProfile.removeLevelN', { n: i + 1 })}
        className="w-6 rounded bg-danger-500/15 py-1 text-xs text-danger-300 ring-1 ring-danger-500/30"
      >
        ×
      </button>
    </div>
  );
}

export function WindLevelTable({
  wind,
  reference,
  onCommit,
}: {
  wind: WindLevels;
  reference: string;
  onCommit: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const { levels, rowKey } = wind;
  return (
    <>
      <div className="flex gap-1 px-1 pb-1 text-[10px] uppercase tracking-wide text-ink-faint">
        <span className="w-20">
          {t('windProfile.altitude')} {t(`windProfile.${reference}Short`)} ({u.sym('distance')})
        </span>
        <span className="w-16">
          {t('launch.speed')} ({u.sym('windspeed')})
        </span>
        <span className="w-14">
          {t('launch.direction')} ({u.sym('angle')})
        </span>
        <span className="w-16">
          {t('windProfile.deviation')} ({u.sym('windspeed')})
        </span>
        <span className="w-14">{t('windProfile.turbulence')} (%)</span>
        <span className="w-20">{t('windProfile.intensity')}</span>
        <span className="w-6" />
      </div>

      {!levels.length && <p className="px-1 py-3 text-xs text-ink-faint">{t('windProfile.noLevels')}</p>}

      <div className="max-h-[320px] space-y-1 overflow-y-auto">
        {levels.map((l, i) => (
          <WindLevelRow key={rowKey(i)} l={l} i={i} wind={wind} onCommit={onCommit} />
        ))}
      </div>
    </>
  );
}
