import { useState, type RefObject } from 'react';
import { FieldLabel } from '../common/FieldMark';
import { CardGroup } from '../common/CardGroup';
import { NumberRow } from '../common/NumberRow';
import { RadioGroup } from '../common/RadioGroup';
import { degToRad } from '../../prefs/units';
import { LIMIT_FIELD } from '../../prefs/launchUnits';
import { MAX_TURBULENCE_PERCENT, MAX_WIND_SPEED_MS } from '../../services/flight/safetyLimits';
import { isFilled } from '../../services/flight/requiredLaunch';
import {
  hasIntensity,
  retuneStdDev,
  stdDevForIntensity,
  turbulenceIntensity,
  turbulenceLevel,
} from '../../services/flight/windTurbulence';
import { DEFAULT_HEADING_DEG, levelFromAverage } from '../../services/flight/windLevels';
import type { LaunchConditions } from '../../services/design/orkTree';
import { WindProfileDialog } from './WindProfileDialog';
import { QNum } from './QNum';
import { capFor, type LaunchSectionProps } from './launchSection';

export type SpeedEditBase = Map<string, { avg: number; sd: number }>;

export function WindSection({
  launch,
  onChange,
  onCommit,
  t,
  u,
  mixed,
  req,
  diff,
  speedEditBase,
}: LaunchSectionProps & {
  diff?: ReadonlySet<keyof LaunchConditions>;
  /** Retuning per keystroke would pass through the "0" of "0.5" and zero the deviation. */
  speedEditBase: RefObject<SpeedEditBase | null>;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const levels = launch.windLevels ?? [];
  const multilevel = levels.length > 0;

  // Stored as the m/s deviation; the percentage is the same value as a ratio.
  const windAvg = isFilled(launch.windAverage) ? launch.windAverage : 0;
  const windSd = isFilled(launch.windStdDev) ? launch.windStdDev : 0;
  const intensity = turbulenceIntensity(windAvg, windSd);

  /** As SimulationOptions.setWindModelType, turning it off parks the profile in `keptWindLevels`. */
  const setWindModel = (model: 'average' | 'multilevel') => {
    if (model === 'average') {
      return onChange((l) =>
        l.windLevels?.length ? { windLevels: undefined, keptWindLevels: l.windLevels } : { windLevels: undefined },
      );
    }
    onChange((l) => {
      if (l.windLevels?.length) return {};
      if (l.keptWindLevels?.length) return { windLevels: l.keptWindLevels, keptWindLevels: undefined };
      return { windLevels: [levelFromAverage(l)] };
    });
  };

  return (
    <CardGroup title={t('launch.wind')}>
      <RadioGroup
        className="pb-1"
        legend={t('launch.windModel')}
        label={<FieldLabel text={t('launch.windModel')} mixed={mixed('windLevels')} />}
        options={['average', 'multilevel'] as const}
        value={multilevel ? 'multilevel' : 'average'}
        onChange={(m) => {
          setWindModel(m);
          onCommit?.();
        }}
        fmt={(m) => t(`launch.windModel_${m}`)}
      />

      {!multilevel ? (
        <>
          <QNum
            label={t('launch.speed')}
            field={LIMIT_FIELD.windSpeed}
            kind="windspeed"
            u={u}
            stepSi={0.5}
            minSi={0}
            maxSi={MAX_WIND_SPEED_MS}
            hint={t('launch.windLimit', { limit: capFor(u, 'windspeed', LIMIT_FIELD.windSpeed, MAX_WIND_SPEED_MS) })}
            mixed={mixed('windAverage')}
            {...req('windAverage')}
            value={launch.windAverage}
            onChange={(v) => {
              // Cleared means unset, not 0: 0 would assert still air.
              if (v == null) return onChange({ windAverage: null });
              const bases = (speedEditBase.current ??= new Map<string, { avg: number; sd: number }>());
              onChange((l, row) => {
                let base = bases.get(row);
                if (!base) {
                  base = {
                    avg: isFilled(l.windAverage) ? l.windAverage : 0,
                    sd: isFilled(l.windStdDev) ? l.windStdDev : 0,
                  };
                  bases.set(row, base);
                }
                // Holds turbulence intensity constant, as `PinkNoiseWindModel.setAverage`.
                if (!hasIntensity(base.avg)) return { windAverage: v };
                return { windAverage: v, windStdDev: retuneStdDev(base.avg, base.sd, v) };
              });
            }}
          />
          <QNum
            label={t('launch.stdDev')}
            chipLabel={t('launch.stdDevName')}
            field="gusts"
            kind="windspeed"
            u={u}
            stepSi={0.5}
            minSi={0}
            maxSi={MAX_WIND_SPEED_MS}
            mixed={mixed('windStdDev')}
            {...req('windStdDev')}
            value={launch.windStdDev}
            onChange={(v) => onChange({ windStdDev: v })}
          />
          <NumberRow
            label={t('launch.turbulenceIntensity')}
            unit="%"
            step={1}
            min={0}
            max={MAX_TURBULENCE_PERCENT}
            mixed={mixed('windStdDev')}
            value={Math.round(intensity * 100)}
            onChange={(v) =>
              onChange((l) => ({
                windStdDev: stdDevForIntensity(isFilled(l.windAverage) ? l.windAverage : 0, (v ?? 0) / 100),
              }))
            }
          />
          <p className="-mt-1 pr-24 text-right text-xs text-ink-muted">
            {t(`launch.turbulenceLevel.${turbulenceLevel(intensity)}`)}
          </p>
          <QNum
            label={t('launch.direction')}
            chipLabel={t('launch.windDirectionName')}
            field="direction"
            kind="deg"
            u={u}
            stepSi={degToRad(5)}
            mixed={mixed('windDirectionDeg')}
            value={launch.windDirectionDeg ?? DEFAULT_HEADING_DEG}
            onChange={(v) => onChange({ windDirectionDeg: v ?? undefined })}
          />
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">
            {t('launch.levelCount', { count: levels.length })}
            {' · '}
            {t(`windProfile.${launch.windAltitudeReference ?? 'msl'}Short`)}
          </p>
          <button
            onClick={() => setProfileOpen(true)}
            className="w-full rounded-md bg-raised py-1.5 text-xs font-medium text-accent-300 ring-1 ring-line/10 hover:bg-elevated"
          >
            {t('launch.editProfile')}
          </button>
        </div>
      )}
      {profileOpen && (
        <WindProfileDialog
          launch={launch}
          diff={diff}
          onChange={onChange}
          onCommit={onCommit}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </CardGroup>
  );
}
