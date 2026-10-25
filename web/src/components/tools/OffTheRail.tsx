import { useState } from 'react';
import { rememberedSlot, useForecastFields, useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { useSettings } from '../../state/SettingsProvider';
import type { MotorSpec } from '../../engine/openRocketEngine';
import { fmtNum, fmtSiteTime, withUnit } from '../../i18n/format';
import { todayYmd } from '../../services/weather/openMeteo';
import { readWeatherKey } from '../../services/weather/weatherKey';
import {
  maxDryMassKg,
  maxWindMs,
  MIN_THRUST_TO_WEIGHT,
  railExit,
  railNeededM,
  weathercockDeg,
  WEATHERCOCK_LIMIT_DEG,
} from '../../services/tools/railExit';
import { fetchSurfaceWind, type SurfaceWind } from '../../services/tools/surfaceWind';
import { MotorDialog } from '../sim/MotorDialog';
import { QNum } from '../sim/LaunchPanel';
import { SiteFields, toolBtn, type ToolSite } from './SiteFields';
import { WhenFields } from '../sim/WhenFields';
import { CardGroup } from '../common/CardGroup';
import { OpenMeteoCredit } from '../common/OpenMeteoCredit';
import { roundTo } from '../../services/app/numbers';
import { motorFullName } from '../../services/motors/motorName';
import { useEngineStore } from '../../state/engineStore';
import { useOnline } from '../common/useOnline';
import { StatusLine } from '../common/StatusLine';
import { useForecastRequest, ForecastState } from '../common/useForecastRequest';
import { ToolLayout, ToolForm, ToolResultCard } from './ToolLayout';

/**
 * Off the rail, for a rocket that has not been designed here: a motor from the
 * catalog, the rest of the rocket's mass and the rail give the thrust-to-weight,
 * the rail exit speed and, with a wind, the weathercock angle (services/tools).
 * An estimate without drag or rail friction, and it says so; a designed rocket
 * gets these from the engine, on its rail departure event.
 */

/** The site, time and wind field a fetched forecast belongs to. */
interface FetchedFor {
  latitudeDeg: number;
  longitudeDeg: number;
  launchAltitudeM: number | null;
  date: string;
  hour: number;
  windMs: number;
}

type Fetch = ForecastState<{ wind: SurfaceWind; for: FetchedFor }>;

interface Remembered {
  motor: MotorSpec | null;
  dryMassKg: number | null;
  railLengthM: number | null;
  windMs: number | null;
  site: ToolSite;
  date: string;
  hour: number;
  fetched: Fetch;
}
const remembered = rememberedSlot<Remembered>();

/** Clears the remembered inputs, so each test starts from the defaults. */
export function forgetOffTheRail(): void {
  remembered.forget();
}

export function OffTheRail() {
  const { t } = useTranslation();
  const online = useOnline();
  const u = useUnits();
  const { settings } = useSettings();
  const minExit = settings.simulation.railExitVelocityMin;
  const defaults = settings.launchDefaults;
  const [motor, setMotor] = useRemembered(remembered, 'motor', null);
  const [dryMassKg, setDryMassKg] = useRemembered(remembered, 'dryMassKg', 0.5);
  const [railLengthM, setRailLengthM] = useRemembered(remembered, 'railLengthM', defaults.launchRodLengthM ?? 1);
  const [windMs, setWindMs] = useRemembered(remembered, 'windMs', 4);
  const { site, setSite, date, setDate, hour, setHour } = useForecastFields(remembered, defaults);
  // A request still out when the tab closed was aborted, so it comes back idle.
  const [fetched, setFetched] = useRemembered(remembered, 'fetched', { kind: 'idle' }, (f): Fetch =>
    f.kind === 'loading' ? { kind: 'idle' } : f,
  );
  const [motorOpen, setMotorOpen] = useState(false);
  const [motorError, setMotorError] = useState<string | null>(null);
  const windRequest = useForecastRequest();
  // The average thrust to weight is the kernel's average thrust, null until the
  // engine has loaded; reading the phase re-renders the figures when it does.
  useEngineStore((s) => s.phase);

  const getWind = async () => {
    const { latitudeDeg, longitudeDeg, launchAltitudeM } = site;
    if (latitudeDeg == null || longitudeDeg == null) return;
    const wind = await windRequest.run(
      setFetched,
      (signal) =>
        fetchSurfaceWind(
          {
            latitudeDeg,
            longitudeDeg,
            siteM: launchAltitudeM,
            date,
            hour,
            today: todayYmd(),
            apiKey: readWeatherKey(),
          },
          { signal },
        ),
      (w) => ({
        wind: w,
        for: { latitudeDeg, longitudeDeg, launchAltitudeM, date, hour, windMs: roundTo(w.speedMs, 1) },
      }),
    );
    if (wind) setWindMs(roundTo(wind.speedMs, 1));
  };

  const ready = motor != null && dryMassKg != null && dryMassKg >= 0 && railLengthM != null && railLengthM > 0;
  const exit = ready ? railExit({ motor, dryMassKg, railLengthM }) : null;
  const ok = exit != null && typeof exit !== 'string' ? exit : null;
  const heaviest = ready && ok ? maxDryMassKg(motor, railLengthM, minExit) : null;
  // The rail that reaches the minimum exit speed, shown in the rail length field's own unit.
  const needed = ready && ok ? railNeededM(motor, dryMassKg, minExit) : null;
  const railUnit = u.at(unitScope('launch', 'railLength'), 'length');
  const angle = ok && windMs != null ? weathercockDeg(windMs, ok.exitSpeedMs) : null;
  // A forecast counts only while the site, time and wind field still hold what
  // it was fetched for; after any of them changes, its gust belongs to another
  // place, time or wind.
  const forecast =
    fetched.kind === 'ready' &&
    fetched.for?.latitudeDeg === site.latitudeDeg &&
    fetched.for.longitudeDeg === site.longitudeDeg &&
    fetched.for.launchAltitudeM === site.launchAltitudeM &&
    fetched.for.date === date &&
    fetched.for.hour === hour &&
    fetched.for.windMs === windMs
      ? fetched.wind
      : null;
  const gustAngle = ok && forecast?.gustMs != null ? weathercockDeg(forecast.gustMs, ok.exitSpeedMs) : null;

  const speed = u.plain('velocity');
  const wind = u.plain('windspeed');
  const mass = u.plain('mass');
  const fmtSpeed = (ms: number) => `${speed.fmtSym(ms, 1)}`;
  const fmtWind = (ms: number) => `${wind.fmtSym(ms, 1)}`;
  const fmtMass = (kg: number) => `${mass.fmtSym(kg)}`;
  const ratio = (r: number) => t('units.ratio', { ratio: fmtNum(r, 1) });
  const warn = 'text-warn-400';
  // An out-of-limit figure carries a word as well as the amber, so the verdict
  // is not told by color alone.
  const flagged = (out: boolean, text: string, word: string) =>
    out ? <span className={warn}>{`${text} · ${word}`}</span> : text;

  const validTime = forecast ? fmtSiteTime(forecast.validUnix * 1000, forecast.answer.timezone, { year: false }) : '';

  return (
    <ToolLayout>
      <ToolForm title={t('rail.title')} intro={t('rail.intro')}>
        <CardGroup title={t('rail.motor')}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-ink">
              {motor ? motorFullName(motor) : t('rail.noMotor')}
            </span>
            <button className={toolBtn} onClick={() => setMotorOpen(true)}>
              {motor ? t('sims.changeMotor') : t('rail.chooseMotor')}
            </button>
          </div>
          <StatusLine tone="danger">{motorError}</StatusLine>
        </CardGroup>

        <CardGroup title={t('rail.rocket')}>
          <QNum
            label={t('rail.dryMass')}
            hint={t('rail.dryMassHint')}
            field="railDryMass"
            kind="mass"
            u={u}
            stepSi={0.01}
            minSi={0}
            maxSi={1000}
            required
            missing={dryMassKg == null}
            value={dryMassKg}
            onChange={setDryMassKg}
          />
          <QNum
            label={t('launch.rodLengthName', { context: 'rail' })}
            field="railLength"
            kind="length"
            u={u}
            stepSi={0.1}
            minSi={0.1}
            maxSi={20}
            required
            missing={railLengthM == null}
            value={railLengthM}
            onChange={setRailLengthM}
          />
        </CardGroup>

        <CardGroup title={t('launch.wind')}>
          <QNum
            label={t('rail.wind')}
            field="railWind"
            kind="windspeed"
            u={u}
            stepSi={0.5}
            minSi={0}
            maxSi={60}
            value={windMs}
            onChange={setWindMs}
          />
          <details className="rounded-md bg-canvas/40 p-2" open={fetched.kind !== 'idle' || undefined}>
            <summary className="cursor-pointer text-xs font-medium text-accent-300">{t('rail.fromForecast')}</summary>
            <div className="mt-2 space-y-2">
              <SiteFields site={site} onChange={setSite} elevation />
              <WhenFields date={date} hour={hour} onDate={setDate} onHour={setHour} />
              <button
                className={`${toolBtn} w-full`}
                disabled={
                  site.latitudeDeg == null || site.longitudeDeg == null || fetched.kind === 'loading' || !online
                }
                title={online ? undefined : t('common.needsConnection')}
                onClick={() => void getWind()}
              >
                {fetched.kind === 'loading' ? t('rail.fetching') : t('rail.fetchWind')}
              </button>
              {/* The status line the other forecast tools use: always mounted, so
                  the failure is announced when it appears. */}
              <StatusLine tone="warn">{fetched.kind === 'error' ? fetched.message : null}</StatusLine>
              {forecast && (
                <>
                  <p className="text-xs text-ink-muted">
                    {t(forecast.gustMs != null ? 'rail.forecastWindGust' : 'rail.forecastWind', {
                      wind: fmtWind(forecast.speedMs),
                      gust: forecast.gustMs != null ? fmtWind(forecast.gustMs) : '',
                      when: validTime,
                    })}
                  </p>
                  <OpenMeteoCredit />
                </>
              )}
            </div>
          </details>
        </CardGroup>
      </ToolForm>

      <ToolResultCard label={t('rail.result')}>
        {!ready ? (
          <p className="text-xs text-ink-muted">{t('rail.empty')}</p>
        ) : exit === 'noLiftoff' ? (
          <p className={`text-sm ${warn}`}>{t('rail.noLiftoff')}</p>
        ) : exit === 'stalls' ? (
          <p className={`text-sm ${warn}`}>{t('rail.stalls')}</p>
        ) : ok ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <Stat label={t('rail.liftoffMass')}>{fmtMass(ok.liftoffMassKg)}</Stat>
              <Stat label={t('rail.twrAverage')}>
                {flagged(
                  ok.thrustToWeightAverage < MIN_THRUST_TO_WEIGHT,
                  ratio(ok.thrustToWeightAverage),
                  t('limits.belowMin'),
                )}
              </Stat>
              <Stat label={t('rail.twrPeak')}>{ratio(ok.thrustToWeightPeak)}</Stat>
              <Stat label={t('rail.twrAtExit')}>{ratio(ok.thrustToWeightAtExit)}</Stat>
              <Stat label={t('rail.exitSpeed')}>
                {flagged(ok.exitSpeedMs < minExit, fmtSpeed(ok.exitSpeedMs), t('limits.belowMin'))}
              </Stat>
              <Stat label={t('rail.exitTime')}>{withUnit(fmtNum(ok.exitS, 2), t('units.second'))}</Stat>
              <Stat label={t('rail.railNeeded', { speed: fmtSpeed(minExit) })}>
                {needed != null
                  ? flagged(needed > railLengthM, railUnit.fmtSym(needed, 2), t('limits.overRail'))
                  : t('rail.none')}
              </Stat>
              {angle != null && (
                <Stat label={t('rail.weathercock')}>
                  {flagged(angle > WEATHERCOCK_LIMIT_DEG, fmtDegrees(u, angle, 1), t('limits.aboveMax'))}
                </Stat>
              )}
              {gustAngle != null && (
                <Stat label={t('rail.weathercockGust')}>
                  {flagged(gustAngle > WEATHERCOCK_LIMIT_DEG, fmtDegrees(u, gustAngle, 1), t('limits.aboveMax'))}
                </Stat>
              )}
              <Stat label={t('rail.maxWind', { angle: fmtDegrees(u, WEATHERCOCK_LIMIT_DEG) })}>
                {fmtWind(maxWindMs(ok.exitSpeedMs))}
              </Stat>
              <Stat label={t('rail.maxDryMass')}>{heaviest != null ? fmtMass(heaviest) : t('rail.none')}</Stat>
            </dl>
            <p className="text-[11px] text-ink-faint">
              {t('rail.rules', {
                ratio: MIN_THRUST_TO_WEIGHT,
                speed: fmtSpeed(minExit),
                angle: fmtDegrees(u, WEATHERCOCK_LIMIT_DEG),
              })}
            </p>
            <p className="text-[11px] text-ink-faint">{t('rail.estimateNote')}</p>
          </div>
        ) : null}
      </ToolResultCard>

      {motorOpen && (
        <MotorDialog
          onClose={() => setMotorOpen(false)}
          onSelect={(m) => {
            setMotor(m);
            setMotorError(null);
            setMotorOpen(false);
          }}
          onError={setMotorError}
          mount={null}
          current={motor}
        />
      )}
    </ToolLayout>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right tabular-nums text-ink">{children}</dd>
    </>
  );
}
