// Data is CC BY 4.0: the dialog must show the credit. Free tier is non-commercial only.
// Use `surface_pressure`, never `pressure_msl`; `utc_offset_seconds` ignores DST, so local times come from `Intl`.

import { AnonymousFetchError, anonymousGet } from './anonymousFetch';
import { isFiniteNumber, roundTo, isRecord } from '../app/numbers';
import { geometricFromGeopotential } from '../map/geodesy';

const FREE = {
  forecast: 'https://api.open-meteo.com',
  archive: 'https://archive-api.open-meteo.com',
  geocoding: 'https://geocoding-api.open-meteo.com',
} as const;
const PAID = {
  forecast: 'https://customer-api.open-meteo.com',
  archive: 'https://customer-archive-api.open-meteo.com',
  geocoding: 'https://customer-geocoding-api.open-meteo.com',
} as const;

const REQUEST_TIMEOUT_MS = 12_000;

/** Keeps a busy user under the free tier's hourly limit, as desktop OpenRocket does. */
const REQUEST_SPACING_MS = 5_000;

const CACHE_TTL_MS = 30 * 60 * 1000;

/** Days. */
const FORECAST_DAYS_BACK = 92;
const FORECAST_DAYS_AHEAD = 15;
const ARCHIVE_FIRST_DATE = '1940-01-01';

const ELEVATION_AGREE_M = 30;

export const SURFACE_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
] as const;

export const SKY_VARS = ['cloud_cover', 'cloud_cover_low'] as const;
export const FORECAST_SKY_VARS = ['visibility'] as const;

/** Meters above ground. */
const WIND_HEIGHTS = [80, 120, 180] as const;

/** hPa, the same 19 desktop OpenRocket asks for. */
export const PRESSURE_LEVELS = [
  1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30,
] as const;

export const ALOFT_VARS = [
  ...WIND_HEIGHTS.flatMap((h) => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
  ...PRESSURE_LEVELS.flatMap((p) => [
    `temperature_${p}hPa`,
    `relative_humidity_${p}hPa`,
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]),
];

export function unitFor(variable: string): string {
  if (variable === 'time') return 'unixtime';
  if (variable.startsWith('temperature_')) return '°C';
  if (variable.startsWith('relative_humidity_')) return '%';
  if (variable === 'surface_pressure') return 'hPa';
  if (variable.startsWith('wind_direction_')) return '°';
  if (variable.startsWith('wind_')) return 'm/s';
  if (variable.startsWith('geopotential_height_')) return 'm';
  if (variable.startsWith('cloud_cover')) return '%';
  if (variable === 'visibility') return 'm';
  throw new Error(`no unit known for ${variable}`);
}

function partsInZone(
  ms: number,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatPart[] {
  const fmt = (tz: string | undefined) =>
    new Intl.DateTimeFormat('en-US', { ...options, timeZone: tz }).formatToParts(new Date(ms));
  try {
    return fmt(timeZone);
  } catch {
    return fmt(undefined);
  }
}

export function ymdInZone(ms: number, timeZone: string | undefined): string {
  const parts = partsInZone(ms, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const todayYmd = (): string => ymdInZone(Date.now(), undefined);

const nextHourMs = (): number => Date.now() + 3_600_000;

function hourInZone(ms: number, timeZone: string | undefined): number {
  const parts = partsInZone(ms, timeZone, { hour: '2-digit', hourCycle: 'h23' });
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
}

/** One instant for both, so near midnight the date and hour cannot disagree. */
export function forecastStart(): { date: string; hour: number } {
  const at = nextHourMs();
  return { date: ymdInZone(at, undefined), hour: hourInZone(at, undefined) };
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
}

function addDaysYmd(ymd: string, days: number): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export type Endpoint = 'forecast' | 'archive';
type DateRefusalReason = 'tooFarAhead' | 'tooEarly' | 'badDate';

export type DateWindow =
  { ok: true; endpoint: Endpoint; startDate: string; endDate: string } | { ok: false; reason: DateRefusalReason };

/** Asks for the day either side too, so every hour of the site's day is covered whatever the zone. */
export function planDateWindow(date: string, today: string): DateWindow {
  if (!parseYmd(date) || !parseYmd(today)) return { ok: false, reason: 'badDate' };
  const last = addDaysYmd(today, FORECAST_DAYS_AHEAD);
  const firstForecast = addDaysYmd(today, -FORECAST_DAYS_BACK);
  if (date > last) return { ok: false, reason: 'tooFarAhead' };
  const later = (a: string, b: string) => (a > b ? a : b);
  const earlier = (a: string, b: string) => (a < b ? a : b);
  if (date >= firstForecast) {
    return {
      ok: true,
      endpoint: 'forecast',
      startDate: later(addDaysYmd(date, -1), firstForecast),
      endDate: earlier(addDaysYmd(date, 1), last),
    };
  }
  if (date < ARCHIVE_FIRST_DATE) return { ok: false, reason: 'tooEarly' };
  const lastArchive = addDaysYmd(firstForecast, -1);
  return {
    ok: true,
    endpoint: 'archive',
    startDate: later(addDaysYmd(date, -1), ARCHIVE_FIRST_DATE),
    endDate: earlier(addDaysYmd(date, 1), lastArchive),
  };
}

const dp3 = (x: number) => x.toFixed(3);
const elev = (m: number) => String(roundTo(m, 1));

const keyParam = (apiKey: string | undefined) => (apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : '');

/** Two elevations repeat the point; Open-Meteo answers an array in request order. */
export function forecastUrl(q: {
  endpoint: Endpoint;
  latitudeDeg: number;
  longitudeDeg: number;
  elevationsM: readonly number[];
  startDate: string;
  endDate: string;
  apiKey?: string;
}): string {
  const host = (q.apiKey ? PAID : FREE)[q.endpoint];
  const path = q.endpoint === 'archive' ? '/v1/archive' : '/v1/forecast';
  const n = q.elevationsM.length;
  const rep = (s: string) => Array.from({ length: n }, () => s).join(',');
  const vars = [
    ...SURFACE_VARS,
    ...SKY_VARS,
    ...(q.endpoint === 'archive' ? [] : [...FORECAST_SKY_VARS, ...ALOFT_VARS]),
  ];
  return (
    `${host}${path}?latitude=${rep(dp3(q.latitudeDeg))}&longitude=${rep(dp3(q.longitudeDeg))}` +
    `&elevation=${q.elevationsM.map(elev).join(',')}` +
    `&hourly=${vars.join(',')}` +
    '&wind_speed_unit=ms&temperature_unit=celsius&timeformat=unixtime&timezone=auto' +
    `&start_date=${q.startDate}&end_date=${q.endDate}${keyParam(q.apiKey)}`
  );
}

function elevationUrl(points: readonly { latitudeDeg: number; longitudeDeg: number }[], apiKey?: string): string {
  const latitudes = points.map((p) => dp3(p.latitudeDeg)).join(',');
  const longitudes = points.map((p) => dp3(p.longitudeDeg)).join(',');
  return `${(apiKey ? PAID : FREE).forecast}/v1/elevation?latitude=${latitudes}&longitude=${longitudes}${keyParam(apiKey)}`;
}

const ok = (status: number): boolean => status >= 200 && status < 300;

export type WeatherErrorKind =
  'offline' | 'timeout' | 'aborted' | 'refused' | 'badKey' | 'quota' | 'http' | 'shape' | 'units' | 'noData';

/** `detail` for `shape` and `units` is an English log note, never shown. */
export class WeatherError extends Error {
  readonly kind: WeatherErrorKind;
  readonly detail: string | undefined;
  constructor(kind: WeatherErrorKind, detail?: string) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = 'WeatherError';
    this.kind = kind;
    this.detail = detail;
  }
}

const geometricOrNull = (z: number | null): number | null => (z === null ? null : geometricFromGeopotential(z));

const unitText = (u: unknown): string => (u === undefined ? 'no unit' : typeof u === 'string' ? u : JSON.stringify(u));

/** Null means missing, never zero. */
interface PressureLevelSample {
  pressureHPa: number;
  /** Geometric MSL, not geopotential: the kernel reads every altitude as geometric. */
  altitudeM: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeed: number | null;
  windFromDeg: number | null;
}

/** Null means missing, never zero. */
export interface HourSample {
  unix: number;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHPa: number | null;
  windSpeed: number | null;
  windGust: number | null;
  /** Compass degrees the wind blows from. */
  windFromDeg: number | null;
  heightWinds: { heightM: number; speed: number | null; fromDeg: number | null }[];
  levels: PressureLevelSample[];
  cloudCoverPct: number | null;
  cloudCoverLowPct: number | null;
  visibilityM: number | null;
}

export interface ForecastVariant {
  elevationM: number;
  timezone: string | null;
  samples: HourSample[];
}

const finiteOrNull = (x: unknown): number | null => (isFiniteNumber(x) ? x : null);

function refusalReason(body: unknown): string | null {
  const one: unknown = Array.isArray(body) ? body[0] : body;
  return isRecord(one) && one['error'] === true
    ? typeof one['reason'] === 'string'
      ? one['reason']
      : 'no reason given'
    : null;
}

/** Open-Meteo answers a single object, not an array, for one elevation. */
export function parseForecast(body: unknown, elevationsM: readonly number[]): ForecastVariant[] {
  const reason = refusalReason(body);
  if (reason !== null) throw new WeatherError('refused', reason);
  const items = Array.isArray(body) ? body : [body];
  if (items.length !== elevationsM.length) {
    throw new WeatherError('shape', `${items.length} answers for ${elevationsM.length} elevations`);
  }
  let anyValue = false;
  const variants = items.map((item, i): ForecastVariant => {
    if (!isRecord(item) || !isRecord(item['hourly_units']) || !isRecord(item['hourly'])) {
      throw new WeatherError('shape', 'no hourly data');
    }
    const units = item['hourly_units'];
    const h = item['hourly'];
    for (const v of ['time', ...SURFACE_VARS]) {
      if (units[v] !== unitFor(v)) throw new WeatherError('units', `${v} in ${unitText(units[v])}`);
    }
    const e = finiteOrNull(item['elevation']);
    if (e === null || Math.abs(e - elevationsM[i]!) > 0.5) {
      throw new WeatherError('shape', `answered for ${e ?? 'no'} m, not ${elevationsM[i]!} m`);
    }
    const time = h['time'];
    if (!Array.isArray(time) || time.some((t) => finiteOrNull(t) === null)) {
      throw new WeatherError('shape', 'no usable hours');
    }
    const series = (v: string, required: boolean): (number | null)[] => {
      const a = h[v];
      if (a === undefined && !required) return time.map(() => null);
      if (!Array.isArray(a) || a.length !== time.length)
        throw new WeatherError('shape', `${v} does not match its hours`);
      if (units[v] !== unitFor(v)) throw new WeatherError('units', `${v} in ${unitText(units[v])}`);
      return a.map(finiteOrNull);
    };
    const s = Object.fromEntries(SURFACE_VARS.map((v) => [v, series(v, true)])) as Record<
      (typeof SURFACE_VARS)[number],
      (number | null)[]
    >;
    const sky = Object.fromEntries([...SKY_VARS, ...FORECAST_SKY_VARS].map((v) => [v, series(v, false)]));
    const aloft = new Map<string, (number | null)[]>();
    for (const v of ALOFT_VARS) if (h[v] !== undefined) aloft.set(v, series(v, false));
    const at = (v: string, j: number) => aloft.get(v)?.[j] ?? null;
    const samples = (time as number[]).map((unix, j): HourSample => {
      const sample: HourSample = {
        unix,
        temperatureC: s.temperature_2m[j]!,
        humidityPct: s.relative_humidity_2m[j]!,
        pressureHPa: s.surface_pressure[j]!,
        windSpeed: s.wind_speed_10m[j]!,
        windGust: s.wind_gusts_10m[j]!,
        windFromDeg: s.wind_direction_10m[j]!,
        heightWinds: aloft.size
          ? WIND_HEIGHTS.map((m) => ({
              heightM: m,
              speed: at(`wind_speed_${m}m`, j),
              fromDeg: at(`wind_direction_${m}m`, j),
            }))
          : [],
        levels: aloft.size
          ? PRESSURE_LEVELS.map((p) => ({
              pressureHPa: p,
              altitudeM: geometricOrNull(at(`geopotential_height_${p}hPa`, j)),
              temperatureC: at(`temperature_${p}hPa`, j),
              humidityPct: at(`relative_humidity_${p}hPa`, j),
              windSpeed: at(`wind_speed_${p}hPa`, j),
              windFromDeg: at(`wind_direction_${p}hPa`, j),
            }))
          : [],
        cloudCoverPct: sky['cloud_cover']![j]!,
        cloudCoverLowPct: sky['cloud_cover_low']![j]!,
        visibilityM: sky['visibility']![j]!,
      };
      if (sample.temperatureC !== null || sample.pressureHPa !== null || sample.windSpeed !== null) anyValue = true;
      return sample;
    });
    return { elevationM: e, timezone: typeof item['timezone'] === 'string' ? item['timezone'] : null, samples };
  });
  if (!anyValue) throw new WeatherError('noData');
  return variants;
}

/** Open-Meteo refuses more points per elevation request. */
const ELEVATION_BATCH = 100;

function parseElevations(body: unknown, count: number): number[] | null {
  if (!isRecord(body) || !Array.isArray(body['elevation']) || body['elevation'].length !== count) return null;
  const out = body['elevation'].map(finiteOrNull);
  return out.every((e): e is number => e !== null) ? out : null;
}

function parseElevation(body: unknown): number | null {
  if (!isRecord(body) || !Array.isArray(body['elevation'])) return null;
  const e = finiteOrNull(body['elevation'][0]);
  return e === null ? null : Math.round(e);
}

export function requestElevations(siteM: number, terrainM: number | null): number[] {
  if (terrainM === null || Math.abs(siteM - terrainM) <= ELEVATION_AGREE_M) return [siteM];
  return [siteM, terrainM];
}

export interface FetchOpts {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  force?: boolean;
}

const REQUEST: RequestInit = { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };

/** Replaced only by tests: jsdom does not run the frame's script. */
let transport: ((url: string, signal: AbortSignal) => Promise<{ status: number; text: string }>) | null = null;

export function setWeatherTransport(fetchImpl: typeof fetch | null): void {
  transport = fetchImpl
    ? async (url, signal) => {
        const res = await fetchImpl(url, { ...REQUEST, signal });
        return { status: res.status, text: await res.text() };
      }
    : null;
}

async function getJson(url: string, o: FetchOpts): Promise<{ status: number; json: unknown }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('timeout'), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctl.abort('aborted');
  o.signal?.addEventListener('abort', onAbort);
  try {
    if (o.signal?.aborted) throw new WeatherError('aborted');
    let status: number;
    let text: string;
    if (o.fetchImpl) {
      const res = await o.fetchImpl(url, { ...REQUEST, signal: ctl.signal });
      status = res.status;
      text = await res.text();
    } else {
      ({ status, text } = await (transport ?? anonymousGet)(url, ctl.signal));
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status, json };
  } catch (err) {
    if (err instanceof WeatherError) throw err;
    if (err instanceof AnonymousFetchError && err.kind === 'tooLarge') throw new WeatherError('shape', 'too large');
    if (ctl.signal.aborted) throw new WeatherError(ctl.signal.reason === 'timeout' ? 'timeout' : 'aborted');
    throw new WeatherError('offline');
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}

function httpError(status: number, json: unknown): WeatherError {
  const reason =
    refusalReason(json) ?? (isRecord(json) && typeof json['reason'] === 'string' ? json['reason'] : undefined);
  if (status === 401 || status === 403) return new WeatherError('badKey', reason);
  if (status === 429) return new WeatherError('quota', reason);
  if (status === 400) return new WeatherError('refused', reason);
  return new WeatherError('http', `${status}${reason ? `: ${reason}` : ''}`);
}

const answers = new Map<string, { at: number; value: unknown }>();
let nextSlot = 0;

export function resetWeatherState(): void {
  answers.clear();
  nextSlot = 0;
}

async function cached<T>(url: string, o: FetchOpts, load: () => Promise<T>): Promise<T> {
  const now = o.now ?? Date.now;
  const hit = answers.get(url);
  if (hit && !o.force && now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  answers.set(url, { at: now(), value });
  return value;
}

async function spaced(o: FetchOpts): Promise<void> {
  const now = (o.now ?? Date.now)();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + REQUEST_SPACING_MS;
  if (slot > now) await (o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(slot - now);
  if (o.signal?.aborted) throw new WeatherError('aborted');
}

export async function fetchElevation(
  latitudeDeg: number,
  longitudeDeg: number,
  apiKey: string | undefined,
  o: FetchOpts = {},
): Promise<number | null> {
  const url = elevationUrl([{ latitudeDeg, longitudeDeg }], apiKey);
  try {
    return await cached(url, o, async () => {
      const a = await getJson(url, o);
      const e = ok(a.status) ? parseElevation(a.json) : null;
      if (e === null) throw new WeatherError('shape', 'no elevation');
      return e;
    });
  } catch (err) {
    if (err instanceof WeatherError && err.kind === 'aborted') throw err;
    return null;
  }
}

export interface PlaceMatch {
  name: string;
  region: string | null;
  country: string | null;
  latitudeDeg: number;
  longitudeDeg: number;
  elevationM: number | null;
}

const PLACE_MATCHES = 10;

/** Geocoding data is GeoNames, CC BY 4.0. */
export async function searchPlaces(
  query: string,
  language: string,
  apiKey: string | undefined,
  o: FetchOpts = {},
): Promise<PlaceMatch[]> {
  const url =
    `${(apiKey ? PAID : FREE).geocoding}/v1/search?name=${encodeURIComponent(query.trim())}` +
    `&count=${PLACE_MATCHES}&language=${encodeURIComponent(language)}&format=json${keyParam(apiKey)}`;
  return cached(url, o, async () => {
    const a = await getJson(url, o);
    if (!ok(a.status)) throw httpError(a.status, a.json);
    return parsePlaces(a.json);
  });
}

/** A missing `results` is Open-Meteo's "nothing found". */
function parsePlaces(json: unknown): PlaceMatch[] {
  if (!isRecord(json)) throw new WeatherError('shape', 'not an object');
  const results = json['results'];
  if (results === undefined) return [];
  if (!Array.isArray(results)) throw new WeatherError('shape', 'results is not a list');
  const text = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x : null);
  return results.flatMap((r): PlaceMatch[] => {
    if (!isRecord(r)) return [];
    const name = text(r['name']);
    const lat = r['latitude'];
    const lon = r['longitude'];
    if (!name || !(isFiniteNumber(lat) && isFiniteNumber(lon))) return [];
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    return [
      {
        name,
        region: text(r['admin1']),
        country: text(r['country']),
        latitudeDeg: lat,
        longitudeDeg: lon,
        elevationM: finiteOrNull(r['elevation']),
      },
    ];
  });
}

export async function fetchElevations(
  points: readonly { latitudeDeg: number; longitudeDeg: number }[],
  apiKey: string | undefined,
  o: FetchOpts = {},
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += ELEVATION_BATCH) {
    const batch = points.slice(i, i + ELEVATION_BATCH);
    const url = elevationUrl(batch, apiKey);
    const heights = await cached(url, o, async () => {
      const a = await getJson(url, o);
      if (!ok(a.status)) throw httpError(a.status, a.json);
      const e = parseElevations(a.json, batch.length);
      if (!e) throw new WeatherError('shape', 'elevation');
      return e;
    });
    out.push(...heights);
  }
  return out;
}

export interface WeatherAnswer {
  endpoint: Endpoint;
  date: string;
  terrainM: number | null;
  elevationsM: number[];
  variants: ForecastVariant[];
  timezone: string;
  fetchedAtMs: number;
  reused: boolean;
}

export async function fetchWeather(
  q: { latitudeDeg: number; longitudeDeg: number; siteM: number; date: string; today: string; apiKey?: string },
  o: FetchOpts = {},
): Promise<WeatherAnswer> {
  const w = planDateWindow(q.date, q.today);
  if (!w.ok) throw new WeatherError('refused', w.reason);
  const terrainM = await fetchElevation(q.latitudeDeg, q.longitudeDeg, q.apiKey, o);
  const elevationsM = requestElevations(q.siteM, terrainM);
  const url = forecastUrl({
    endpoint: w.endpoint,
    latitudeDeg: q.latitudeDeg,
    longitudeDeg: q.longitudeDeg,
    elevationsM,
    startDate: w.startDate,
    endDate: w.endDate,
    apiKey: q.apiKey,
  });
  let asked = false;
  const { variants, fetchedAtMs } = await cached(url, o, async () => {
    asked = true;
    await spaced(o);
    const a = await getJson(url, o);
    if (!ok(a.status)) throw httpError(a.status, a.json);
    return { variants: parseForecast(a.json, elevationsM), fetchedAtMs: (o.now ?? Date.now)() };
  });
  const timezone = variants[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { endpoint: w.endpoint, date: q.date, terrainM, elevationsM, variants, timezone, fetchedAtMs, reused: !asked };
}

export function sampleAt(variant: ForecastVariant, timezone: string, date: string, hour: number): HourSample | null {
  return (
    variant.samples.find(
      (s) => ymdInZone(s.unix * 1000, timezone) === date && hourInZone(s.unix * 1000, timezone) === hour,
    ) ?? null
  );
}

export const HOUR_OFFSETS = [-2, -1, 0, 1, 2] as const;

/** `unix` in seconds. */
export function sampleAtUnix(variant: ForecastVariant, unix: number): HourSample | null {
  return variant.samples.find((s) => s.unix === unix) ?? null;
}
