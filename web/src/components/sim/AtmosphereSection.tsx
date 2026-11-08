import { useMemo, useState } from 'react';
import { CardGroup } from '../common/CardGroup';
import { NumberRow } from '../common/NumberRow';
import { smallButton } from '../common/smallButton';
import { LAUNCH_SI } from '../../prefs/launchUnits';
import { LAUNCH_SITE_LIMITS } from '../../services/storage/launchLocationStore';
import { useEngineReady } from '../../state/engineStore';
import { standardPressurePa } from '../../engine/openRocketEngine';
import { seaLevelExcessPa } from '../../services/flight/sitePressure';
import { WeatherDialog } from './WeatherDialog';
import { WeatherSourceLine } from './WeatherSourceLine';
import { WeatherKeyField } from './WeatherKeyField';
import { QNum } from './QNum';
import { capFor, type LaunchSectionProps } from './launchSection';
import type { LaunchConditions } from '../../services/design/orkTree';

export function AtmosphereSection({
  launch,
  onChange,
  onCommit,
  t,
  u,
  mixed,
  diff,
  weather,
  weatherKey,
}: LaunchSectionProps & {
  diff?: ReadonlySet<keyof LaunchConditions>;
  weather: boolean;
  weatherKey: boolean;
}) {
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [weatherRefresh, setWeatherRefresh] = useState(false);
  const atmosphereLevels = launch.atmosphereLevels ?? [];
  const engineReady = useEngineReady();
  const pressureExcess = useMemo(() => {
    if (!engineReady || launch.pressureHPa == null || launch.launchAltitudeM == null) return null;
    const standard = standardPressurePa(launch.launchAltitudeM);
    return standard == null ? null : seaLevelExcessPa(LAUNCH_SI.hPa.toSi(launch.pressureHPa), standard);
  }, [engineReady, launch.pressureHPa, launch.launchAltitudeM]);

  return (
    <CardGroup title={t('launch.atmosphere')}>
      {weather && (
        <button
          onClick={() => {
            setWeatherRefresh(false);
            setWeatherOpen(true);
          }}
          className={smallButton('row', 'accent', 'w-full')}
        >
          {t('launch.getWeather')}
        </button>
      )}
      <WeatherSourceLine
        launch={launch}
        onRefresh={
          weather
            ? () => {
                setWeatherRefresh(true);
                setWeatherOpen(true);
              }
            : undefined
        }
      />
      <QNum
        label={t('launch.temperature')}
        field="temperature"
        kind="degC"
        // QNum bounds are SI (kelvin): raw -90 and 70 would cap entries at 70 K.
        minSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.min)}
        maxSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.max)}
        u={u}
        stepSi={1}
        placeholder={t('launch.isa')}
        mixed={mixed('temperatureC')}
        value={launch.temperatureC}
        onChange={(v) => onChange({ temperatureC: v })}
      />
      <QNum
        label={t('launch.pressure')}
        field="pressure"
        kind="hPa"
        u={u}
        stepSi={100}
        // Stored in hPa; bounds are SI (Pa).
        minSi={30_000}
        maxSi={110_000}
        placeholder={t('launch.isa')}
        mixed={mixed('pressureHPa')}
        caution={
          pressureExcess == null
            ? undefined
            : t('launch.pressureSeaLevel', {
                excess: capFor(u, 'hPa', 'pressure', pressureExcess),
                altitude: capFor(u, 'distance', 'altitude', launch.launchAltitudeM ?? 0),
              })
        }
        value={launch.pressureHPa}
        onChange={(v) => onChange({ pressureHPa: v })}
      />
      {/* Stored as a 0..1 fraction, typed as a percent. */}
      <NumberRow
        label={t('launch.humidity')}
        unit="%"
        step={5}
        min={0}
        max={100}
        placeholder={t('launch.isa')}
        mixed={mixed('relativeHumidity')}
        value={launch.relativeHumidity == null ? null : Math.round(launch.relativeHumidity * 100)}
        onChange={(v) => onChange({ relativeHumidity: v == null ? null : v / 100 })}
      />
      {atmosphereLevels.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">
            {t('launch.forecastProfile', {
              top: `${u.fmtSym('distance', atmosphereLevels[atmosphereLevels.length - 1]!.altitudeM, 0)}`,
            })}
          </span>
          <button
            onClick={() => {
              onChange({ atmosphereLevels: undefined });
              onCommit?.();
            }}
            className={smallButton('xs', 'soft')}
          >
            {t('launch.clearForecastProfile')}
          </button>
        </div>
      )}
      {weatherKey && <WeatherKeyField />}
      {weatherOpen && (
        <WeatherDialog
          launch={launch}
          diff={diff}
          onChange={onChange}
          onCommit={onCommit}
          onClose={() => setWeatherOpen(false)}
          refresh={weatherRefresh}
        />
      )}
    </CardGroup>
  );
}
