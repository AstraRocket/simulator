import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchConditions, LaunchPatch } from '../../services/design/orkTree';
import { Dialog } from '../common/Dialog';
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
import { toggled } from '../../services/app/collections';
import { DialogButton } from '../common/DialogButton';
import { StatusLine } from '../common/StatusLine';
import { useForecastRequest, ForecastState } from '../common/useForecastRequest';
import { ForecastRequest, WeatherOffer } from './WeatherParts';

/** Modeled on desktop OpenRocket's "Use Current Conditions": nothing changes until Apply. */

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
  diff?: ReadonlySet<keyof LaunchConditions>;
  onChange: (patch: LaunchPatch) => void;
  onCommit?: () => void;
  onClose: () => void;
  refresh?: boolean;
}) {
  const { t } = useTranslation();
  const prior = refresh ? launch.weatherSource : undefined;
  const [start] = useState(forecastStart);
  const [date, setDate] = useState(() => prior?.date ?? start.date);
  const [hour, setHour] = useState(() => prior?.hour ?? start.hour);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [useTerrain, setUseTerrain] = useState(prior?.elevationApplied ?? false);
  const [ticked, setTicked] = useState<Set<ProposalGroup>>(() => new Set(prior?.groups ?? PROPOSAL_GROUPS));
  const forecast = useForecastRequest();

  const lat = launch.latitudeDeg;
  const lon = launch.longitudeDeg;
  // A blank elevation is not sea level: the forecast is corrected to the site's height.
  const siteM = launch.launchAltitudeM ?? null;
  const elsewhere = !!(diff?.has('latitudeDeg') || diff?.has('longitudeDeg') || diff?.has('launchAltitudeM'));
  const hasSite = lat != null && lon != null;

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

  // A refresh fetches at once; the ref keeps it to once across a strict-mode double mount.
  const started = useRef(false);
  useEffect(() => {
    if (!refresh || started.current) return;
    started.current = true;
    void fetchNow();
  });

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
    onChange((l) =>
      sameSite(l.latitudeDeg, l.longitudeDeg, lat, lon) && l.launchAltitudeM === siteM
        ? { ...patch, weatherSource }
        : {},
    );
    onCommit?.();
    onClose();
  };

  const toggle = (g: ProposalGroup) => setTicked(toggled(ticked, g));

  const changeDate = (d: string) => {
    setDate(d);
    // Cancel, or a request still loading would land under the new date.
    forecast.cancel();
    setState({ kind: 'idle' });
  };

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
          <ForecastRequest
            date={date}
            hour={hour}
            onDate={changeDate}
            onHour={setHour}
            loading={state.kind === 'loading'}
            onFetch={() => void fetchNow()}
            lat={lat}
            lon={lon}
            siteM={siteM}
          />
        )}

        <StatusLine tone="warn">{state.kind === 'error' ? state.message : ''}</StatusLine>

        {answer && !sample && <p className="text-xs text-warn-400">{t('weather.noHour')}</p>}

        {answer && proposal && (
          <WeatherOffer
            answer={answer}
            proposal={proposal}
            sample={sample}
            siteM={siteM}
            useTerrain={useTerrain}
            onUseTerrain={setUseTerrain}
            offered={offered}
            ticked={ticked}
            onToggle={toggle}
            elsewhere={elsewhere}
            onFetchFresh={() => void fetchNow(true)}
          />
        )}
      </div>
    </Dialog>
  );
}
