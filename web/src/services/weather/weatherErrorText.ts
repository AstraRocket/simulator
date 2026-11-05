import { WeatherError } from './openMeteo';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const DATE_REFUSALS = new Set(['tooFarAhead', 'tooEarly', 'badDate']);

// Other kinds' detail is an English log note, kept out of translated text.
const QUOTED_DETAIL = new Set(['refused', 'http']);

export function weatherErrorText(err: unknown, t: Translate, fallbackKey = 'weather.error.offline'): string {
  if (!(err instanceof WeatherError)) return t(fallbackKey);
  if (err.kind === 'refused' && err.detail && DATE_REFUSALS.has(err.detail)) {
    return t(`weather.dateRefusal.${err.detail}`);
  }
  return QUOTED_DETAIL.has(err.kind)
    ? t(`weather.error.${err.kind}`, { detail: err.detail ?? '' })
    : t(`weather.error.${err.kind}`);
}
