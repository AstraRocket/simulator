import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchConditions, LaunchPatch } from '../../services/design/orkTree';
import { Dialog } from '../common/Dialog';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import { fetchWeather, forecastStart, sampleAt, todayYmd, type WeatherAnswer } from '../../services/weather/openMeteo';
import {
  hasGroup,
  PROPOSAL_GROUPS,
  proposalFor,
  proposalPatch,
  type ProposalGroup,
} from '../../services/weather/weatherProposal';
import { readWeatherKey } from '../../services/weather/weatherKey';
import { sameSite, sourceFor } from '../../services/weather/weatherSource';
import { formatLat, formatLon } from '../../services/map/slippyMap';
import { fmtPercent, fmtSiteTime } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { LAUNCH_SI } from '../../prefs/launchUnits';
import { OpenMeteoCredit } from '../common/OpenMeteoCredit';
import { Check } from '../common/Check';
import { WhenFields } from './WhenFields';
import { useOnline } from '../common/useOnline';
import { fmtNum, withUnit } from '../../i18n/format';
import { siToUi } from '../../prefs/units';
import { toggled } from '../../services/app/collections';
import { DialogButton } from '../common/DialogButton';
import { StatusLine } from '../common/StatusLine';
import { smallButton } from '../common/smallButton';
import { useForecastRequest, ForecastState } from '../common/useForecastRequest';

/**
 * Launch conditions from an Open-Meteo forecast for a date and hour at the
 * launch site. Desktop OpenRocket's "Use Current Conditions" is the
 * model: fetch, show every value with its time and source and a checkbox each,
 * and change nothing until Apply.
 *
 * Mounted only while open, so a closed dialog holds no request: unmounting
 * aborts one still running.
 *
 * Apply writes a `weatherSource` beside the values, so the Atmosphere card can
 * say where they came from. Opened from that card's Refresh, the dialog starts
 * from the recorded date, hour and groups and fetches at once; Apply is still
 * the only thing that writes.
 */

/** The large unit visibility reads in, by the user's distance unit: its own system's. */
const FAR_UNIT: Record<string, string> = { m: 'km', km: 'km', ft: 'mi', yd: 'mi', mi: 'mi' };

const btn = smallButton('sm', 'soft');

type State = ForecastState<{ answer: WeatherAnswer }>;

export function WeatherDialog({
  launch,
  diff,
  onChange,
  onCommit,
  onClose,
  refresh = false,
}: {
  launch: LaunchConditions;
  /** Launch keys the simulations being edited together disagree on (see LaunchPanel). */
  diff?: ReadonlySet<keyof LaunchConditions>;
  onChange: (patch: LaunchPatch) => void;
  onCommit?: () => void;
  onClose: () => void;
  /** Start from `launch.weatherSource` and fetch on opening. */
  refresh?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const u = useUnits();
  const prior = refresh ? launch.weatherSource : undefined;
  const [start] = useState(forecastStart);
  const [date, setDate] = useState(() => prior?.date ?? start.date);
  const [hour, setHour] = useState(() => prior?.hour ?? start.hour);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [useTerrain, setUseTerrain] = useState(prior?.elevationApplied ?? false);
  const [ticked, setTicked] = useState<Set<ProposalGroup>>(() => new Set(prior?.groups ?? PROPOSAL_GROUPS));
  const forecast = useForecastRequest();
  const online = useOnline();

  const lat = launch.latitudeDeg;
  const lon = launch.longitudeDeg;
  // A blank elevation is not sea level: the forecast is corrected to the
  // site's height, so the dialog asks for one rather than assume 0 m.
  const siteM = launch.launchAltitudeM ?? null;
  // Some of the simulations being edited launch from another site or elevation,
  // and Apply leaves those as they are.
  const elsewhere = !!(diff?.has('latitudeDeg') || diff?.has('longitudeDeg') || diff?.has('launchAltitudeM'));
  const hasSite = lat != null && lon != null;

  /** `force` asks Open-Meteo even when an answer under 30 minutes old is held. */
  const fetchNow = async (force = false) => {
    if (!hasSite || siteM === null) return;
    await forecast.run(
      setState,
      (signal) =>
        fetchWeather(
          {
            latitudeDeg: lat,
            longitudeDeg: lon,
            siteM,
            date,
            today: todayYmd(),
            apiKey: readWeatherKey(),
          },
          { signal, force },
        ),
      (answer) => ({ answer }),
    );
  };

  // A refresh fetches at once: its date, hour and groups are already chosen.
  // Once per opening, which the ref holds across a strict-mode double mount.
  const started = useRef(false);
  useEffect(() => {
    if (!refresh || started.current) return;
    started.current = true;
    void fetchNow();
  });

  // Held only while the elevation it was fetched for is still set.
  const answer = state.kind === 'ready' && siteM !== null ? state.answer : null;
  const variantIndex = answer && useTerrain && answer.variants.length > 1 ? 1 : 0;
  const variant = answer?.variants[variantIndex];
  const sample = answer && variant ? sampleAt(variant, answer.timezone, answer.date, hour) : null;
  const proposal = useMemo(
    () => (sample && variant ? proposalFor(sample, variant.elevationM) : null),
    [sample, variant],
  );
  const offered = proposal ? PROPOSAL_GROUPS.filter((g) => hasGroup(proposal, g)) : [];
  const chosen = new Set(offered.filter((g) => ticked.has(g)));

  const apply = () => {
    if (!proposal || !variant || !answer || !sample || !hasSite) return;
    const elevationApplied = useTerrain && answer.variants.length > 1;
    const patch = proposalPatch(
      proposal,
      chosen,
      elevationApplied ? { launchAltitudeM: variant.elevationM } : undefined,
    );
    const weatherSource = sourceFor({
      endpoint: answer.endpoint,
      date: answer.date,
      hour,
      timezone: answer.timezone,
      latitudeDeg: lat,
      longitudeDeg: lon,
      elevationM: variant.elevationM,
      validUnix: sample.unix,
      fetchedAtMs: answer.fetchedAtMs,
      groups: PROPOSAL_GROUPS.filter((g) => chosen.has(g)),
      elevationApplied,
      applied: patch,
    });
    // A forecast is for one place and one height: the pressure is corrected to
    // the site's elevation and the wind levels start above it. A simulation
    // being edited with this one that launches from another site or elevation
    // keeps its own conditions (the dialog says so; see `elsewhere`).
    onChange((l) =>
      sameSite(l.latitudeDeg, l.longitudeDeg, lat, lon) && l.launchAltitudeM === siteM
        ? { ...patch, weatherSource }
        : {},
    );
    onCommit?.();
    onClose();
  };

  const toggle = (g: ProposalGroup) => setTicked(toggled(ticked, g));

  const temp = (c: number) => `${u.fmtSym('temperature', LAUNCH_SI.degC.toSi(c), 1)}`;
  const pres = (hPa: number) => `${u.fmtSym('pressure', LAUNCH_SI.hPa.toSi(hPa), 1)}`;
  const wind = (ms: number) => `${u.fmtSym('windspeed', ms, 1)}`;
  const alt = (m: number) => `${u.fmtSym('distance', m, 0)}`;
  // Visibility runs to tens of kilometers, so it reads in km or miles: the
  // large unit of whichever system the distance unit belongs to.
  const farSym = FAR_UNIT[u.sym('distance')] ?? 'km';
  const far = (m: number) => withUnit(fmtNum(siToUi('distance', farSym, m), 1), farSym);

  const describe = (g: ProposalGroup): string => {
    const p = proposal!;
    switch (g) {
      case 'temperature':
        return temp(p.temperatureC!);
      case 'pressure':
        return pres(p.pressureHPa!);
      case 'humidity':
        return fmtPercent(p.relativeHumidity! * 100);
      case 'wind': {
        const w = p.wind!;
        const top = w.levels[w.levels.length - 1]!;
        return t('weather.windValue', {
          speed: wind(w.surfaceSpeed),
          from: fmtDegrees(u, w.surfaceFromDeg),
          gust: w.gust === null ? NO_VALUE : wind(w.gust),
          top: alt(top.altitudeM),
        });
      }
      case 'atmosphere': {
        const a = p.atmosphere!;
        return t('weather.atmosphereValue', { top: alt(a[a.length - 1]!.altitudeM) });
      }
    }
  };

  const validTime = sample && answer ? fmtSiteTime(sample.unix * 1000, answer.timezone) : null;

  return (
    <Dialog
      id="weather"
      title={t('weather.title')}
      onClose={onClose}
      layer="over"
      size="lg"
      footer={
        <div className="flex justify-end gap-2 p-3">
          <DialogButton size="sm" onClick={onClose}>
            {t('common.cancel')}
          </DialogButton>
          <DialogButton variant="primary" size="sm" disabled={!proposal || chosen.size === 0} onClick={apply}>
            {t('weather.apply')}
          </DialogButton>
        </div>
      }
    >
      <div className="space-y-3 p-3 text-sm">
        {!hasSite ? (
          <p className="text-warn-400">{t('weather.needSite')}</p>
        ) : siteM === null ? (
          <p className="text-warn-400">{t('weather.needElevation')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <WhenFields
                layout="inline"
                date={date}
                hour={hour}
                onDate={(d) => {
                  setDate(d);
                  // A new date is a new request; the old answer covers only its own
                  // days, and one still loading would land under the new date.
                  forecast.cancel();
                  setState({ kind: 'idle' });
                }}
                onHour={setHour}
              />
              <button
                className={btn}
                disabled={state.kind === 'loading' || !online}
                title={online ? undefined : t('common.needsConnection')}
                onClick={() => void fetchNow()}
              >
                {state.kind === 'loading' ? t('weather.fetching') : t('weather.fetch')}
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              {t('weather.siteLine', { lat: formatLat(lat, 3), lon: formatLon(lon, 3), alt: alt(siteM) })}
            </p>
          </>
        )}

        <StatusLine tone="warn">{state.kind === 'error' ? state.message : ''}</StatusLine>

        {answer && !sample && <p className="text-xs text-warn-400">{t('weather.noHour')}</p>}

        {answer && proposal && (
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              {t(answer.endpoint === 'archive' ? 'weather.validArchive' : 'weather.validForecast', { time: validTime })}
            </p>
            {answer.endpoint === 'archive' && <p className="text-xs text-ink-muted">{t('weather.archiveNoAloft')}</p>}
            {/* When the answer came from, and a way past the reuse window: a
                reused answer is not a fresh one, and the user may know a newer
                run is out. */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">
                {t(answer.reused ? 'weather.reused' : 'weather.fetchedAt', {
                  time: new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(
                    new Date(answer.fetchedAtMs),
                  ),
                })}
              </p>
              <button
                className={btn}
                disabled={!online}
                title={online ? undefined : t('common.needsConnection')}
                onClick={() => void fetchNow(true)}
              >
                {t('weather.fetchFresh')}
              </button>
            </div>
            {answer.variants.length > 1 && answer.terrainM !== null && siteM !== null && (
              <Check
                align="start"
                className="text-xs text-ink-soft"
                checked={useTerrain}
                onChange={setUseTerrain}
                label={t('weather.useTerrain', { terrain: alt(answer.terrainM), site: alt(siteM) })}
              />
            )}
            <ul className="space-y-1">
              {offered.map((g) => (
                <li key={g} className="flex items-center justify-between gap-3">
                  {/* The value sits outside the label, so the checkbox is named
                      by its group alone and the value is read after it. */}
                  <Check
                    className="text-xs text-ink-soft"
                    checked={ticked.has(g)}
                    onChange={() => toggle(g)}
                    label={t(`weather.group.${g}`)}
                  />
                  <span className="text-right text-xs tabular-nums text-ink-strong">{describe(g)}</span>
                </li>
              ))}
            </ul>
            {sample &&
              (sample.cloudCoverPct !== null || sample.cloudCoverLowPct !== null || sample.visibilityM !== null) && (
                <div className="rounded-md bg-raised/60 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t('weather.sky')}</p>
                  <dl className="mt-1 space-y-0.5 text-xs">
                    {(
                      [
                        ['weather.cloudCover', sample.cloudCoverPct, (v: number) => fmtPercent(v)],
                        ['weather.cloudCoverLow', sample.cloudCoverLowPct, (v: number) => fmtPercent(v)],
                        ['weather.visibility', sample.visibilityM, far],
                      ] as const
                    ).map(([key, value, fmt]) =>
                      value === null ? null : (
                        <div key={key} className="flex justify-between gap-3">
                          <dt className="text-ink-soft">{t(key)}</dt>
                          <dd className="tabular-nums text-ink-strong">{fmt(value)}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                </div>
              )}
            {elsewhere && <p className="text-xs text-warn-400">{t('weather.otherSitesNote')}</p>}
            <p className="text-xs text-ink-faint">{t('weather.forecastNote')}</p>
            <OpenMeteoCredit className="text-xs text-ink-faint" />
          </div>
        )}
      </div>
    </Dialog>
  );
}
