import { useTranslation } from 'react-i18next';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import type { sampleAt, WeatherAnswer } from '../../services/weather/openMeteo';
import type { proposalFor, ProposalGroup } from '../../services/weather/weatherProposal';
import { formatLat, formatLon } from '../../services/map/slippyMap';
import { fmtDateTime, fmtPercent, fmtSiteTime } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { LAUNCH_SI, LIMIT_FIELD } from '../../prefs/launchUnits';
import { OpenMeteoCredit } from '../common/OpenMeteoCredit';
import { Check } from '../common/Check';
import { WhenFields } from './WhenFields';
import { useOnline } from '../common/useOnline';
import { fmtNum, withUnit } from '../../i18n/format';
import { FAR_DISTANCE_UNIT, siToUi, unitScope, type Quantity } from '../../prefs/units';
import { smallButton } from '../common/smallButton';
import { siteAltitudeUnit } from './launchSection';

const btn = smallButton('sm', 'soft');

type Proposal = NonNullable<ReturnType<typeof proposalFor>>;
type Sample = NonNullable<ReturnType<typeof sampleAt>>;

function useWeatherFormats() {
  const { t } = useTranslation();
  const u = useUnits();
  // In the unit of the Launch field each proposal fills.
  const field = (name: string, q: Quantity) => u.at(unitScope('launch', name), q);
  const temp = (c: number) => field('temperature', 'temperature').fmtSym(LAUNCH_SI.degC.toSi(c), 1);
  const pres = (hPa: number) => field('pressure', 'pressure').fmtSym(LAUNCH_SI.hPa.toSi(hPa), 1);
  const wind = (ms: number) => field(LIMIT_FIELD.windSpeed, 'windspeed').fmtSym(ms, 1);
  const alt = (m: number) => `${u.fmtSym('distance', m, 0)}`;
  const site = (m: number) => siteAltitudeUnit(u).fmtSym(m, 0);
  const farSym = FAR_DISTANCE_UNIT[u.sym('distance')] ?? 'km';
  const far = (m: number) => withUnit(fmtNum(siToUi('distance', farSym, m), 1), farSym);

  const describe = (g: ProposalGroup, p: Proposal): string => {
    switch (g) {
      case 'temperature':
        return p.temperatureC === undefined ? NO_VALUE : temp(p.temperatureC);
      case 'pressure':
        return p.pressureHPa === undefined ? NO_VALUE : pres(p.pressureHPa);
      case 'humidity':
        return p.relativeHumidity === undefined ? NO_VALUE : fmtPercent(p.relativeHumidity * 100);
      case 'wind': {
        const w = p.wind;
        if (!w) return NO_VALUE;
        const top = w.levels[w.levels.length - 1]!;
        return t('weather.windValue', {
          speed: wind(w.surfaceSpeed),
          from: fmtDegrees(u, w.surfaceFromDeg),
          gust: w.gust === null ? NO_VALUE : field('gusts', 'windspeed').fmtSym(w.gust, 1),
          top: alt(top.altitudeM),
        });
      }
      case 'atmosphere': {
        const a = p.atmosphere;
        if (!a) return NO_VALUE;
        return t('weather.atmosphereValue', { top: alt(a[a.length - 1]!.altitudeM) });
      }
    }
  };

  return { alt, site, far, describe };
}

export function ForecastRequest({
  date,
  hour,
  onDate,
  onHour,
  loading,
  onFetch,
  lat,
  lon,
  siteM,
}: {
  date: string;
  hour: number;
  onDate: (date: string) => void;
  onHour: (hour: number) => void;
  loading: boolean;
  onFetch: () => void;
  lat: number;
  lon: number;
  siteM: number;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const { site } = useWeatherFormats();
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <WhenFields layout="inline" date={date} hour={hour} onDate={onDate} onHour={onHour} />
        <button
          className={btn}
          disabled={loading || !online}
          title={online ? undefined : t('common.needsConnection')}
          onClick={onFetch}
        >
          {loading ? t('weather.fetching') : t('weather.fetch')}
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        {t('weather.siteLine', { lat: formatLat(lat, 3), lon: formatLon(lon, 3), alt: site(siteM) })}
      </p>
    </>
  );
}

function SkyConditions({ sample }: { sample: Sample }) {
  const { t } = useTranslation();
  const { far } = useWeatherFormats();
  return (
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
  );
}

export function WeatherOffer({
  answer,
  proposal,
  sample,
  siteM,
  useTerrain,
  onUseTerrain,
  offered,
  ticked,
  onToggle,
  elsewhere,
  onFetchFresh,
}: {
  answer: WeatherAnswer;
  proposal: Proposal;
  sample: Sample | null;
  siteM: number | null;
  useTerrain: boolean;
  onUseTerrain: (on: boolean) => void;
  offered: ProposalGroup[];
  ticked: ReadonlySet<ProposalGroup>;
  onToggle: (g: ProposalGroup) => void;
  elsewhere: boolean;
  onFetchFresh: () => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const { site, describe } = useWeatherFormats();
  const validTime = sample && answer ? fmtSiteTime(sample.unix * 1000, answer.timezone) : null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        {t(answer.endpoint === 'archive' ? 'weather.validArchive' : 'weather.validForecast', { time: validTime })}
      </p>
      {answer.endpoint === 'archive' && <p className="text-xs text-ink-muted">{t('weather.archiveNoAloft')}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {t(answer.reused ? 'weather.reused' : 'weather.fetchedAt', {
            time: fmtDateTime(answer.fetchedAtMs, { hour: '2-digit', minute: '2-digit' }),
          })}
        </p>
        <button
          className={btn}
          disabled={!online}
          title={online ? undefined : t('common.needsConnection')}
          onClick={onFetchFresh}
        >
          {t('weather.fetchFresh')}
        </button>
      </div>
      {answer.variants.length > 1 && answer.terrainM !== null && siteM !== null && (
        <Check
          align="start"
          className="text-xs text-ink-soft"
          checked={useTerrain}
          onChange={onUseTerrain}
          label={t('weather.useTerrain', { terrain: site(answer.terrainM), site: site(siteM) })}
        />
      )}
      <ul className="space-y-1">
        {offered.map((g) => (
          <li key={g} className="flex items-center justify-between gap-3">
            <Check
              className="text-xs text-ink-soft"
              checked={ticked.has(g)}
              onChange={() => onToggle(g)}
              label={t(`weather.group.${g}`)}
            />
            <span className="text-right text-xs tabular-nums text-ink-strong">{describe(g, proposal)}</span>
          </li>
        ))}
      </ul>
      {sample && (sample.cloudCoverPct !== null || sample.cloudCoverLowPct !== null || sample.visibilityM !== null) && (
        <SkyConditions sample={sample} />
      )}
      {elsewhere && <p className="text-xs text-warn-400">{t('weather.otherSitesNote')}</p>}
      <p className="text-xs text-ink-faint">{t('weather.forecastNote')}</p>
      <OpenMeteoCredit className="text-xs text-ink-faint" />
    </div>
  );
}
