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

/** Each simulation's wind as it stood before the speed box was edited, by row. */
export type SpeedEditBase = Map<string, { avg: number; sd: number }>;

/** The wind: a single average with its turbulence and heading, or an altitude-layered profile. */
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
  /** Passed through to the Wind Profile Editor; see `LaunchPanel`. */
  diff?: ReadonlySet<keyof LaunchConditions>;
  /**
   * The winds the speed box's current edit started from. Owned by the panel,
   * which clears it on blur: the box reports every keystroke, so retuning from
   * the previous keystroke would pass through whatever the user typed on the
   * way: "0" on the way to "0.5" sets the deviation to 0, and every later
   * keystroke rescales that 0. Desktop's `PinkNoiseWindModel.setAverage` only
   * ever sees the committed value, so the turbulence is carried from the value
   * the edit started on.
   */
  speedEditBase: RefObject<SpeedEditBase | null>;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const levels = launch.windLevels ?? [];
  const multilevel = levels.length > 0;

  // Gustiness the way OpenRocket states it and the way the hobby talks about
  // it: scatter over average, named. The stored value is still the m/s standard
  // deviation, so this and the deviation field are one number seen two ways.
  // The profile's per-level equivalent lives in the Wind Profile Editor.
  // Both halves have to be present for a ratio to exist. A blank reads as 0
  // here so the percentage field shows something rather than NaN; the blank
  // itself is reported by the required marker on the field it belongs to.
  const windAvg = isFilled(launch.windAverage) ? launch.windAverage : 0;
  const windSd = isFilled(launch.windStdDev) ? launch.windStdDev : 0;
  const intensity = turbulenceIntensity(windAvg, windSd);

  /**
   * Switch wind models. Multilevel is represented by having levels, which is
   * what `simConditions` keys the engine's choice on. As on the desktop, where
   * the type only picks between two models that both keep their values
   * (SimulationOptions.setWindModelType), turning Multilevel off keeps the
   * profile in `keptWindLevels` and turning it back on restores it. With no
   * profile to restore, one level is seeded from the single wind, so nothing
   * typed is lost. Each simulation is switched from its own conditions.
   */
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
              // Cleared means unset, not 0: 0 is a real wind speed, so
              // landing there makes emptying the field assert still air.
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
                // OpenRocket holds the turbulence intensity constant when the
                // average moves (`PinkNoiseWindModel.setAverage`), so wind that
                // was 15% gusty stays 15% gusty instead of quietly becoming 5%
                // because the wind picked up, each simulation at its own.
                // Skipped from a zero average, where the ratio is the 0-or-1
                // stand-in rather than a real fraction and rescaling would snap
                // the scatter to the whole wind speed.
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
          {/* The same scatter as a percentage of the wind, which is the number
              the hobby actually quotes. Editable, as the desktop has it: the
              two fields are one value seen two ways, so typing 10% here
              rewrites the deviation exactly as typing the deviation rewrites
              this. Its descriptive name sits under it, as OpenRocket does. */}
          <NumberRow
            label={t('launch.turbulenceIntensity')}
            unit="%"
            step={1}
            min={0}
            max={MAX_TURBULENCE_PERCENT}
            mixed={mixed('windStdDev')}
            value={Math.round(intensity * 100)}
            // Each simulation's deviation from its own average.
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
            // See the rod direction: an emptied box goes back to unset.
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
      {/* Mounted only while open: its error line and row keys reset by unmount. */}
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
