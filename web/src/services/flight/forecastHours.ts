import type { RocketTree } from '../../engine/openRocketEngine';
import { simulateInWorker } from '../../engine/simClient';
import type { WeatherSource } from '../design/orkTree';
import { fetchWeather, HOUR_OFFSETS, sampleAtUnix, ymdInZone, type FetchOpts } from '../weather/openMeteo';
import { proposalFor, proposalPatch } from '../weather/weatherProposal';
import type { FlightConfig } from './flightConfigs';
import { landingPoint, type GroundPoint } from './groundTrack';
import type { CompleteLaunch } from './requiredLaunch';
import { freshSeed, simConditions, type SimPrefs } from './simulations';
import { flightBranches } from './flightColumns';
import { launchLimitViolations, type LimitViolation } from './safetyLimits';
import type { PowerClass } from './powerClass';

export interface HourLanding {
  offset: number;
  /** Ms since the epoch. */
  validMs: number;
  landings: (GroundPoint | null)[];
  outsideLimits?: LimitViolation[];
}

export const refusalKeys = (h: HourLanding): string[] =>
  (h.outsideLimits ?? []).map((v) => (v.field === 'windSpeed' ? 'env.landing.overWind' : 'env.landing.overRodAngle'));

// One seed for every hour, so turbulence does not pass for the wind changing.
export async function flyForecastHours(
  q: {
    tree: RocketTree;
    config: FlightConfig;
    launch: CompleteLaunch;
    source: WeatherSource;
    prefs: SimPrefs;
    powerClass: PowerClass;
    apiKey?: string;
    onProgress?: (done: number, total: number) => void;
  },
  o: FetchOpts = {},
): Promise<HourLanding[]> {
  const { source } = q;
  const answer = await fetchWeather(
    {
      latitudeDeg: source.latitudeDeg,
      longitudeDeg: source.longitudeDeg,
      siteM: source.elevationM,
      date: source.date,
      today: ymdInZone((o.now ?? Date.now)(), source.timezone),
      apiKey: q.apiKey,
    },
    o,
  );
  const variant = answer.variants.find((v) => Math.abs(v.elevationM - source.elevationM) < 0.5) ?? answer.variants[0]!;
  const validUnix = Date.parse(source.validAt) / 1000;
  const groups = new Set(source.groups);
  const seed = q.prefs.randomSeed ?? freshSeed();

  const hours = HOUR_OFFSETS.flatMap((offset) => {
    const sample = sampleAtUnix(variant, validUnix + offset * 3600);
    return sample ? [{ offset, sample }] : [];
  });
  let done = 0;
  q.onProgress?.(0, hours.length);
  const ctl = new AbortController();
  const cancel = () => ctl.abort(o.signal?.reason);
  if (o.signal?.aborted) cancel();
  else o.signal?.addEventListener('abort', cancel, { once: true });
  const flyHour = async ({ offset, sample }: (typeof hours)[number]): Promise<HourLanding> => {
    const patch = proposalPatch(
      proposalFor(sample, variant.elevationM),
      groups,
      source.elevationApplied ? { launchAltitudeM: variant.elevationM } : undefined,
    );
    const { weatherSource: _source, ...launch } = { ...q.launch, ...patch } as CompleteLaunch;
    const validMs = sample.unix * 1000;
    const outsideLimits = launchLimitViolations(launch, q.powerClass);
    if (outsideLimits.length) {
      q.onProgress?.(++done, hours.length);
      return { offset, validMs, landings: [], outsideLimits };
    }
    const result = await simulateInWorker(
      {
        tree: q.tree,
        config: q.config,
        options: { ...simConditions(launch, { ...q.prefs, randomSeed: seed }), series: 'summary' },
        // The worker's unit must not depend on the main-thread build having caught up.
        lengthUnit: q.prefs.lengthUnit,
      },
      { signal: ctl.signal },
    );
    const branches = flightBranches(result);
    q.onProgress?.(++done, hours.length);
    return { offset, validMs, landings: branches.map((b) => landingPoint(b.series)) };
  };
  try {
    const out = await Promise.all(
      hours.map((h) =>
        flyHour(h).catch((e: unknown) => {
          ctl.abort();
          throw e;
        }),
      ),
    );
    return out.sort((a, b) => a.offset - b.offset);
  } finally {
    o.signal?.removeEventListener('abort', cancel);
  }
}
