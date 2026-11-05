import { useRef } from 'react';
import { rememberedSlot, useForecastFields, useRemembered } from './remembered';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/SettingsProvider';
import { todayYmd } from '../../services/weather/openMeteo';
import { readWeatherKey } from '../../services/weather/weatherKey';
import { runLandingEstimate, type LandingRun } from '../../services/landing/landingEstimate';
import type { DescentPlan } from '../../services/landing/descentDrift';
import { SiteFields, type ToolSite } from './SiteFields';
import { WhenFields } from '../sim/WhenFields';
import { CardGroup } from '../common/CardGroup';
import { useOnline } from '../common/useOnline';
import { StatusLine } from '../common/StatusLine';
import { useForecastRequest, ForecastState } from '../common/useForecastRequest';
import { ToolLayout, ToolForm } from './ToolLayout';
import { LandingFlightCard, LandingResult } from './LandingParts';

type Recovery = 'single' | 'dual';

interface EstimateInputs {
  latitudeDeg: number;
  longitudeDeg: number;
  padElevationM: number | null;
  date: string;
  hour: number;
  plan: DescentPlan;
}

const sameInputs = (a: EstimateInputs, b: EstimateInputs | null): boolean =>
  b !== null &&
  a.latitudeDeg === b.latitudeDeg &&
  a.longitudeDeg === b.longitudeDeg &&
  a.padElevationM === b.padElevationM &&
  a.date === b.date &&
  a.hour === b.hour &&
  a.plan.apogeeAglM === b.plan.apogeeAglM &&
  a.plan.firstRateMs === b.plan.firstRateMs &&
  a.plan.main?.rateMs === b.plan.main?.rateMs &&
  a.plan.main?.aglM === b.plan.main?.aglM;

type State = ForecastState<{ run: LandingRun; inputs: EstimateInputs }>;

interface Remembered {
  site: ToolSite;
  date: string;
  hour: number;
  apogee: number | null;
  recovery: Recovery;
  singleRate: number | null;
  drogueRate: number | null;
  mainRate: number | null;
  mainAgl: number | null;
  state: State;
}
const remembered = rememberedSlot<Remembered>();

export function forgetLandingEstimator(): void {
  remembered.forget();
}

function descentPlan(
  apogee: number | null,
  dual: boolean,
  firstRate: number | null,
  mainRate: number | null,
  mainAgl: number | null,
): DescentPlan | null {
  return apogee != null && apogee > 0 && firstRate != null && firstRate > 0
    ? dual
      ? mainRate != null && mainRate > 0 && mainAgl != null && mainAgl > 0 && mainAgl < apogee
        ? { apogeeAglM: apogee, firstRateMs: firstRate, main: { rateMs: mainRate, aglM: mainAgl } }
        : null
      : { apogeeAglM: apogee, firstRateMs: firstRate }
    : null;
}

function estimateInputs(site: ToolSite, date: string, hour: number, plan: DescentPlan | null): EstimateInputs | null {
  return site.latitudeDeg != null && site.longitudeDeg != null && plan !== null && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? {
        latitudeDeg: site.latitudeDeg,
        longitudeDeg: site.longitudeDeg,
        padElevationM: site.launchAltitudeM,
        date,
        hour,
        plan,
      }
    : null;
}

function useLandingForm() {
  const { settings } = useSettings();
  const defaults = settings.launchDefaults;
  const { site, setSite, date, setDate, hour, setHour } = useForecastFields(remembered, defaults);
  const [apogee, setApogee] = useRemembered(remembered, 'apogee', 300);
  const [recovery, setRecovery] = useRemembered(remembered, 'recovery', 'single');
  // Separate values so switching to dual does not hand the drogue a main's 6 m/s.
  const [singleRate, setSingleRate] = useRemembered(remembered, 'singleRate', 6);
  const [drogueRate, setDrogueRate] = useRemembered(remembered, 'drogueRate', 25);
  const [mainRate, setMainRate] = useRemembered(remembered, 'mainRate', 6);
  const [mainAgl, setMainAgl] = useRemembered(remembered, 'mainAgl', 150);
  const dual = recovery === 'dual';
  const firstRate = dual ? drogueRate : singleRate;
  const setFirstRate = dual ? setDrogueRate : setSingleRate;
  return {
    site,
    setSite,
    date,
    setDate,
    hour,
    setHour,
    apogee,
    setApogee,
    recovery,
    setRecovery,
    dual,
    firstRate,
    setFirstRate,
    mainRate,
    setMainRate,
    mainAgl,
    setMainAgl,
  };
}

export type LandingForm = ReturnType<typeof useLandingForm>;

export function LandingEstimator() {
  const { t } = useTranslation();
  const online = useOnline();
  const form = useLandingForm();
  const { site, setSite, date, setDate, hour, setHour, apogee, dual, firstRate, mainRate, mainAgl } = form;
  const [state, setState] = useRemembered(remembered, 'state', { kind: 'idle' }, (s): State =>
    s.kind === 'loading' ? { kind: 'idle' } : s,
  );
  const forecast = useForecastRequest();
  const resultRef = useRef<HTMLDivElement>(null);
  const plan = descentPlan(apogee, dual, firstRate, mainRate, mainAgl);
  const hasSite = site.latitudeDeg != null && site.longitudeDeg != null;
  const inputs = estimateInputs(site, date, hour, plan);
  const ready = inputs !== null;

  const estimate = async () => {
    if (!inputs) return;
    const asked = inputs;
    const run = await forecast.run(
      setState,
      (signal) => runLandingEstimate({ ...asked, today: todayYmd(), apiKey: readWeatherKey() }, { signal }),
      (r) => ({ run: r, inputs: asked }),
    );
    if (run) requestAnimationFrame(() => resultRef.current?.scrollIntoView?.({ block: 'nearest' }));
  };

  const ran = state.kind === 'ready' ? state : null;
  const e = ran?.run.estimate;
  const outdated = ran !== null && !sameInputs(ran.inputs, inputs);
  return (
    <ToolLayout wide>
      <ToolForm title={t('landing.title')} intro={t('landing.intro')}>
        <CardGroup title={t('landing.site')}>
          <SiteFields site={site} onChange={setSite} elevation />
        </CardGroup>

        <CardGroup title={t('landing.when')}>
          <WhenFields date={date} hour={hour} onDate={setDate} onHour={setHour} />
        </CardGroup>

        <LandingFlightCard form={form} />

        <button
          className="w-full rounded-md bg-accent-600 px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-700 disabled:opacity-50"
          disabled={!ready || state.kind === 'loading' || !online}
          title={online ? undefined : t('common.needsConnection')}
          onClick={() => void estimate()}
        >
          {state.kind === 'loading' ? t('landing.estimating') : t('landing.estimate')}
        </button>
        {!hasSite && <p className="text-xs text-warn-400">{t('weather.needSite')}</p>}
        <StatusLine tone="warn">{state.kind === 'error' ? state.message : ''}</StatusLine>
      </ToolForm>

      <div ref={resultRef} className="min-w-0 space-y-3">
        {ran && e ? (
          <LandingResult
            run={ran.run}
            estimate={e}
            latitudeDeg={ran.inputs.latitudeDeg}
            longitudeDeg={ran.inputs.longitudeDeg}
            outdated={outdated}
          />
        ) : (
          <p className="p-4 text-sm text-ink-faint">{t('landing.empty')}</p>
        )}
      </div>
    </ToolLayout>
  );
}
