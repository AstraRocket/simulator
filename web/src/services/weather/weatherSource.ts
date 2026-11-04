import type { LaunchConditions, WeatherSource } from '../design/orkTree';
import { stableJson } from '../app/stableJson';

export const STALE_AFTER_MS = 3 * 3_600_000;

/** Requests round to 3 dp. */
const SAME_SITE_DEG = 0.0005;

export const sameSite = (
  lat: number | null | undefined,
  lon: number | null | undefined,
  siteLat: number,
  siteLon: number,
) => lat != null && lon != null && Math.abs(lat - siteLat) <= SAME_SITE_DEG && Math.abs(lon - siteLon) <= SAME_SITE_DEG;

const GROUP_FIELDS: Record<WeatherSource['groups'][number], (keyof LaunchConditions)[]> = {
  temperature: ['temperatureC'],
  pressure: ['pressureHPa'],
  humidity: ['relativeHumidity'],
  wind: ['windAverage', 'windStdDev', 'windDirectionDeg', 'windLevels', 'windAltitudeReference'],
  atmosphere: ['atmosphereLevels'],
};

export function sourceFields(source: WeatherSource): (keyof LaunchConditions)[] {
  const fields = source.groups.flatMap((g) => GROUP_FIELDS[g]);
  return source.elevationApplied ? [...fields, 'launchAltitudeM'] : fields;
}

export function sourceFor(q: {
  endpoint: WeatherSource['endpoint'];
  date: string;
  hour: number;
  timezone: string;
  latitudeDeg: number;
  longitudeDeg: number;
  elevationM: number;
  validUnix: number;
  fetchedAtMs: number;
  groups: WeatherSource['groups'];
  elevationApplied: boolean;
  applied: Partial<LaunchConditions>;
}): WeatherSource {
  return {
    provider: 'open-meteo',
    endpoint: q.endpoint,
    date: q.date,
    hour: q.hour,
    timezone: q.timezone,
    latitudeDeg: q.latitudeDeg,
    longitudeDeg: q.longitudeDeg,
    elevationM: q.elevationM,
    validAt: new Date(q.validUnix * 1000).toISOString(),
    fetchedAt: new Date(q.fetchedAtMs).toISOString(),
    groups: q.groups,
    elevationApplied: q.elevationApplied,
    applied: q.applied,
  };
}

export interface SourceStatus {
  edited: boolean;
  otherSite: boolean;
  old: boolean;
}

const same = (a: unknown, b: unknown) => stableJson(a ?? null) === stableJson(b ?? null);

export function sourceStatus(launch: LaunchConditions, nowMs: number): SourceStatus | null {
  const s = launch.weatherSource;
  if (!isWeatherSource(s)) return null;
  const edited =
    s.edited === true ||
    (s.applied !== undefined && sourceFields(s).some((k) => k in s.applied! && !same(launch[k], s.applied![k])));
  const otherSite = !sameSite(launch.latitudeDeg, launch.longitudeDeg, s.latitudeDeg, s.longitudeDeg);
  const validMs = Date.parse(s.validAt);
  const old = s.endpoint === 'forecast' && validMs > nowMs && nowMs - Date.parse(s.fetchedAt) > STALE_AFTER_MS;
  return { edited, otherSite, old };
}

export function restoredSource(source: Omit<WeatherSource, 'applied'>, launch: LaunchConditions): WeatherSource {
  if (source.edited) return source;
  const applied: Partial<LaunchConditions> = {};
  const fields = sourceFields(source);
  for (const k of fields) (applied as Record<string, unknown>)[k] = launch[k];
  return { ...source, applied };
}

export function isWeatherSource(x: unknown): x is WeatherSource {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return (
    s['provider'] === 'open-meteo' &&
    (s['endpoint'] === 'forecast' || s['endpoint'] === 'archive') &&
    typeof s['date'] === 'string' &&
    Number.isInteger(s['hour']) &&
    typeof s['timezone'] === 'string' &&
    Number.isFinite(s['latitudeDeg']) &&
    Number.isFinite(s['longitudeDeg']) &&
    Number.isFinite(s['elevationM']) &&
    typeof s['validAt'] === 'string' &&
    !Number.isNaN(Date.parse(s['validAt'])) &&
    typeof s['fetchedAt'] === 'string' &&
    !Number.isNaN(Date.parse(s['fetchedAt'])) &&
    Array.isArray(s['groups']) &&
    (s['groups'] as unknown[]).every((g) => typeof g === 'string' && Object.hasOwn(GROUP_FIELDS, g)) &&
    typeof s['elevationApplied'] === 'boolean'
  );
}
