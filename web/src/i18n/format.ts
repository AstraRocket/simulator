import { NO_VALUE } from './noValue';
import i18n from './index';
import { isDefaultComponentName } from '../services/app/warningText';

const cache = new Map<string, Intl.NumberFormat>();

export function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return NO_VALUE;
  const lng = i18n.resolvedLanguage || 'en';
  const key = `${lng}:${digits}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lng, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(key, f);
  }
  return f.format(n);
}

const percentCache = new Map<string, Intl.NumberFormat>();

/** `pct` is in percent points (12 for 12%). */
export function fmtPercent(pct: number, digits = 0): string {
  if (!Number.isFinite(pct)) return NO_VALUE;
  const lng = i18n.resolvedLanguage || 'en';
  const key = `${lng}:${digits}`;
  let f = percentCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lng, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits });
    percentCache.set(key, f);
  }
  return f.format(pct / 100);
}

export function fmtSig(n: number, sig: number): string {
  if (!Number.isFinite(n)) return NO_VALUE;
  if (n === 0) return '0';
  const lng = i18n.resolvedLanguage || 'en';
  const tiny = Math.abs(n) < 1e-4;
  return new Intl.NumberFormat(lng, {
    maximumSignificantDigits: sig,
    ...(tiny ? { notation: 'scientific', minimumSignificantDigits: sig } : {}),
  }).format(n);
}

// Lives in prefs/units, which cannot import this file (import cycle via the warning texts).
export { ladderDigits } from '../prefs/units';

export const shortDigits = (v: number): number => (Math.abs(v) < 10 ? 1 : 0);

export function tickDigits(value: number, axisDigits = 0, maxDigits = 2): number {
  const text = String(Number(value.toFixed(maxDigits)));
  const dot = text.indexOf('.');
  return Math.max(axisDigits, dot < 0 ? 0 : text.length - dot - 1);
}

export function fmtUpTo(v: number, digits: number): string {
  if (!Number.isFinite(v)) return NO_VALUE;
  const rounded = Number(v.toFixed(digits));
  return fmtNum(rounded, (String(rounded).split('.')[1] ?? '').length);
}

export function withUnit(text: string, sym: string): string {
  return sym === '°' ? `${text}${sym}` : `${text} ${sym}`;
}

/** Pass the translated symbol. */
export const withFixedUnit = (v: number | null | undefined, unit: string, digits = 1): string =>
  v == null || !Number.isFinite(v) ? NO_VALUE : withUnit(fmtNum(v, digits), unit);

/** `index` is zero-based. The kernel's default name (`[Stage.Stage]`) is an untranslated key, so it counts as none. */
export function stageLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  index: number,
  name?: unknown,
): string {
  const own = typeof name === 'string' ? name.trim() : '';
  return (isDefaultComponentName(own) ? '' : own) || t('flight.stageN', { n: index + 1 });
}

export function partLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  node: { name?: unknown; type: string },
): string {
  const own = typeof node.name === 'string' ? node.name.trim() : '';
  return own || t(`part.${node.type}`, { defaultValue: node.type });
}

/** `stageName` is '' for an unnamed stage and undefined for a part outside any stage. */
export function stagePrefixed(
  t: (key: string, opts?: Record<string, unknown>) => string,
  stageName: string | undefined,
  text: string,
): string {
  return stageName === undefined ? text : `${partLabel(t, { name: stageName, type: 'stage' })} · ${text}`;
}

export function fmtSiteTime(
  at: string | number | Date,
  timeZone: string | undefined,
  opts: { year?: boolean; timeOnly?: boolean } = {},
): string {
  const lng = i18n.resolvedLanguage || 'en';
  const fields: Intl.DateTimeFormatOptions = opts.timeOnly
    ? { hour: '2-digit', minute: '2-digit' }
    : {
        ...(opts.year === false ? {} : { year: 'numeric' }),
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        // Not dateStyle/timeStyle: Intl refuses a timeZoneName beside them.
        timeZoneName: 'short',
      };
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return NO_VALUE;
  try {
    return new Intl.DateTimeFormat(lng, { ...fields, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(lng, fields).format(date);
  }
}

const MB = 1024 * 1024;

export function fmtMb(bytes: number): string {
  return fmtNum(bytes / MB, 1);
}

export function fmtList(items: readonly string[]): string {
  return new Intl.ListFormat(i18n.resolvedLanguage || 'en', { type: 'conjunction' }).format(items);
}
