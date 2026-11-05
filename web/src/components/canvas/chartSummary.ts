import { fmtList, fmtNum, withUnit } from '../../i18n/format';

// Values arrive already in display units.

type T = (key: string, options?: Record<string, unknown>) => string;

export interface SummaryStage {
  name: string;
  xs: readonly number[];
  ys: readonly number[];
}

// Largest magnitude, sign kept.
export function peakOf(xs: readonly number[], ys: readonly number[]): { value: number; at: number } | null {
  let best = -1;
  for (let i = 0; i < ys.length; i++) {
    if (best < 0 || Math.abs(ys[i]!) > Math.abs(ys[best]!)) best = i;
  }
  return best < 0 ? null : { value: ys[best]!, at: xs[best]! };
}

export function peakAcross(
  lines: readonly { xs: readonly number[]; ys: readonly number[] }[],
): { value: number; at: number } | null {
  let best: { value: number; at: number } | null = null;
  for (const l of lines) {
    const p = peakOf(l.xs, l.ys);
    if (p && (!best || Math.abs(p.value) > Math.abs(best.value))) best = p;
  }
  return best;
}

export function rangeOf(ys: readonly number[]): { min: number; max: number } | null {
  if (!ys.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const y of ys) {
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

const valueIn = (v: number, digits: number, unit: string) =>
  unit ? withUnit(fmtNum(v, digits), unit) : fmtNum(v, digits);

export function crosshairReadout(
  at: string,
  items: readonly { label: string; value: number | null; digits: number; unit: string }[],
): string {
  const values = items.flatMap((it) =>
    it.value != null && Number.isFinite(it.value) ? [`${it.label} ${valueIn(it.value, it.digits, it.unit)}`] : [],
  );
  return values.length ? `${at}: ${fmtList(values)}` : at;
}

const perStage = <S extends { name: string }>(stages: readonly S[], part: (s: S) => string): string =>
  stages.length === 1 ? part(stages[0]!) : fmtList(stages.map((s) => `${s.name}: ${part(s)}`));

export function timeSeriesSummary(
  t: T,
  label: string,
  unit: string,
  digits: number,
  level: boolean,
  stages: readonly SummaryStage[],
): string {
  const part = (s: SummaryStage): string => {
    if (level) {
      const r = rangeOf(s.ys);
      return r
        ? t('flight.summaryRange', { min: valueIn(r.min, digits, unit), max: valueIn(r.max, digits, unit) })
        : t('flight.summaryNoData');
    }
    const p = peakOf(s.xs, s.ys);
    return p
      ? t('flight.summaryPeak', { value: valueIn(p.value, digits, unit), time: fmtNum(p.at, 1) })
      : t('flight.summaryNoData');
  };
  return `${label}: ${perStage(stages, part)}`;
}

// Deduplicated: clustered stages can carry the same event at the same moment.
export function eventsSummary(
  t: T,
  events: readonly { type: string; time: number }[],
  eventLabel: (type: string) => string,
): string | null {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const e of [...events].sort((a, b) => a.time - b.time)) {
    const time = fmtNum(e.time, 1);
    const key = `${e.type}@${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(t('flight.summaryEventAt', { event: eventLabel(e.type), time }));
  }
  return items.length ? t('flight.summaryEvents', { list: fmtList(items) }) : null;
}

export function xySummary(
  t: T,
  label: string,
  stages: readonly { name: string; xs: readonly number[]; ys: readonly number[] }[],
  fmt: { y: (v: number) => string; x: (v: number) => string },
): string {
  const part = (s: { xs: readonly number[]; ys: readonly number[] }) => {
    const p = peakOf(s.xs, s.ys);
    return p ? t('flight.summaryPeakAtX', { y: fmt.y(p.value), x: fmt.x(p.at) }) : t('flight.summaryNoData');
  };
  return `${label}: ${perStage(stages, part)}`;
}

export function machSeriesSummary(
  t: T,
  title: string,
  unit: string,
  digits: number,
  machs: readonly number[],
  series: readonly { name: string; values: readonly number[] }[],
): string {
  const part = (se: { values: readonly number[] }) => {
    const xs: number[] = [];
    const ys: number[] = [];
    se.values.forEach((v, i) => {
      if (Number.isFinite(v) && machs[i] != null) {
        xs.push(machs[i]);
        ys.push(v);
      }
    });
    const p = peakOf(xs, ys);
    return p
      ? t('aero.summaryPeakMach', { value: valueIn(p.value, digits, unit), mach: fmtNum(p.at, 2) })
      : t('flight.summaryNoData');
  };
  return `${title}: ${perStage(series, part)}`;
}
