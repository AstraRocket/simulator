// Locale-aware number formatting, bound to the active i18n language. Use this
// for every displayed number (decimal separator + grouping differ per locale:
// "1,234.5" en-US vs "1.234,5" es-ES). Number <input> values stay canonical;
// the browser handles their locale separator, so inputs don't use this.
import { NO_VALUE } from './noValue';
import i18n from './index';
import { isDefaultComponentName } from '../services/app/warningText';

const cache = new Map<string, Intl.NumberFormat>();

/** Format `n` with a fixed number of fraction digits in the current locale. */
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

/**
 * A percentage in the current locale's own form: "12%" in English, "12 %" in
 * French and German. `pct` is in percent points (12 for 12%), as every caller
 * holds it. The one percent readout, so two figures side by side cannot be
 * spaced two ways.
 */
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

/**
 * `n` to `sig` significant figures in the current locale, for a figure that spans
 * orders of magnitude (an inertia tile). Scientific notation below 1e-4, where
 * fixed digits would be all leading zeros.
 */
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

/**
 * The magnitude ladder, defined beside `fmtSi` in prefs/units (which cannot
 * import this file: it is reached from here through the warning texts) and
 * offered here with the other display digits.
 */
export { ladderDigits } from '../prefs/units';

/** The short ladder for a small axis or scale figure: one decimal below 10, none from 10 up. */
export const shortDigits = (v: number): number => (Math.abs(v) < 10 ? 1 : 0);

/**
 * Decimals a tick label needs to read as itself: as many as `value` has (to
 * `maxDigits`), and never fewer than the axis's own `axisDigits`. Ticks on a
 * nice step all need the step's decimals, so a 2.5 step labels 2.5 and 7.5
 * rather than rounding them to 3 and 8. The schematic ruler and the Mach axis
 * both read it.
 */
export function tickDigits(value: number, axisDigits = 0, maxDigits = 2): number {
  const text = String(Number(value.toFixed(maxDigits)));
  const dot = text.indexOf('.');
  return Math.max(axisDigits, dot < 0 ? 0 : text.length - dot - 1);
}

/**
 * Format with up to `digits` decimals, trailing zeros dropped: `fmtSi`'s
 * behavior, but locale-aware.
 *
 * For a figure that is round in the unit it was authored in and not in the
 * one it is being shown in: a 15-20 ft/s descent band is "15-20 ft/s" but
 * "4.6-6.1 m/s", and a fixed decimal count gets one of those two wrong.
 */
export function fmtUpTo(v: number, digits: number): string {
  if (!Number.isFinite(v)) return NO_VALUE;
  const rounded = Number(v.toFixed(digits));
  return fmtNum(rounded, (String(rounded).split('.')[1] ?? '').length);
}

/**
 * A formatted value and its unit symbol. Degrees close up against the number
 * ("20°"); every other symbol takes a space ("8.94 m/s").
 */
export function withUnit(text: string, sym: string): string {
  return sym === '°' ? `${text}${sym}` : `${text} ${sym}`;
}

/**
 * A number with a fixed unit (seconds, a percent): "1.20 s", or the no-value
 * dash when absent, never a dash with the unit after it. Pass the translated
 * symbol (`t('units.second')`), so it is the reader's own.
 */
export const withFixedUnit = (v: number | null | undefined, unit: string, digits = 1): string =>
  v == null || !Number.isFinite(v) ? NO_VALUE : withUnit(fmtNum(v, digits), unit);

/**
 * A stage as every view labels it: its own name, else "Stage n" through one
 * interpolated key, so a language that puts the number first reads right. A
 * view passes the `t` it renders with; `index` is zero-based.
 *
 * A stage the user never named carries the kernel's default name, which is an
 * untranslated bundle key (`[Stage.Stage]`), so that counts as no name.
 */
export function stageLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  index: number,
  name?: unknown,
): string {
  const own = typeof name === 'string' ? name.trim() : '';
  return (isDefaultComponentName(own) ? '' : own) || t('flight.stageN', { n: index + 1 });
}

/**
 * A part as every view names it: its own name, trimmed, else its translated
 * type, else the raw type for one the locale does not know. A cleared Name field
 * writes `name: ''`, so an empty name falls back too.
 */
export function partLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  node: { name?: unknown; type: string },
): string {
  const own = typeof node.name === 'string' ? node.name.trim() : '';
  return own || t(`part.${node.type}`, { defaultValue: node.type });
}

/**
 * An instant on the launch site's clock, with the zone named so it cannot be
 * read as the viewer's. `year: false` drops the year; `timeOnly` gives just the
 * hour and minute (a table of hours on one known day). A zone the browser does
 * not know (it comes from Open-Meteo and from a saved weather source) falls back
 * to the viewer's clock rather than throwing in the middle of a render. An
 * instant that is not a date (a malformed stored value) reads as no value, for
 * the same reason.
 */
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
        // Explicit fields: dateStyle and timeStyle refuse a timeZoneName beside them.
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

/**
 * Bytes as megabytes, for the two download progress readouts (the engine-load
 * banner and the catalog loader), in the user's locale like every other displayed
 * number.
 */
export function fmtMb(bytes: number): string {
  return fmtNum(bytes / MB, 1);
}

/**
 * Items as one list in the current locale ("A, B, and C"; "A、B、C"), so a
 * sentence that names several things does not join them with English
 * punctuation.
 */
export function fmtList(items: readonly string[]): string {
  return new Intl.ListFormat(i18n.resolvedLanguage || 'en', { type: 'conjunction' }).format(items);
}
