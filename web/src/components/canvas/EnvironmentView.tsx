import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtDegrees, useUnits, type FieldUnit } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import type { ResultFlight } from '../../services/flight/simulations';
import { WeatherSourceLine } from '../sim/WeatherSourceLine';
import { EnvironmentLanding } from './EnvironmentLanding';
import { TermRow } from '../common/TermRow';
import {
  environmentProfile,
  type EnvironmentQuantity,
  type ProfileLegs,
  type ProfilePoint,
} from '../../services/flight/environmentProfile';
import { formatLat, formatLon } from '../../services/map/slippyMap';
import { fmtSiteTime } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { degToRad, radToDeg } from '../../prefs/units';
import { norm360 } from '../../services/flight/groundTrack';
import { polylinePath } from '../common/svgPath';
import { LegendSwatch } from '../sim/chartAxes';
import { token } from '../common/colorTokens';

const QUANTITY: Record<EnvironmentQuantity, Quantity> = {
  windSpeed: 'windspeed',
  windDirection: 'angle',
  temperature: 'temperature',
  pressure: 'pressure',
  density: 'density',
  speedOfSound: 'velocity',
};

/** Below this pad wind (m/s) there is no wind direction to report. */
const CALM_MS = 0.05;

const CHARTS: EnvironmentQuantity[] = ['windSpeed', 'windDirection', 'temperature', 'pressure'];
const PAD: EnvironmentQuantity[] = ['temperature', 'pressure', 'density', 'speedOfSound', 'windSpeed', 'windDirection'];

/** Significant figures, not decimals: density reads 1.225 kg/m³ and 0.001225 g/cm³ alike. */
function sig4(fu: FieldUnit, si: number): string {
  const ui = fu.toUi(si);
  if (!Number.isFinite(ui)) return NO_VALUE;
  if (ui === 0) return `${fu.fmtSym(si, 0)}`;
  const mag = Math.floor(Math.log10(Math.abs(ui)));
  return `${fu.fmtSym(si, Math.max(0, 3 - mag))}`;
}

export function EnvironmentView({ flight }: { flight: ResultFlight }) {
  const { t } = useTranslation();
  const u = useUnits();
  const env = useMemo(() => environmentProfile(flight.result.series), [flight.result.series]);
  const source = flight.launch.weatherSource;
  const validAt = source ? fmtSiteTime(source.validAt, source.timezone) : null;
  if (!env) return <p className="p-4 text-sm text-ink-muted">{t('env.noData')}</p>;

  const unit = (q: EnvironmentQuantity) => u.plain(QUANTITY[q]);
  const dist = u.plain('distance');
  const show = (q: EnvironmentQuantity, si: number) => {
    if (q !== 'windDirection') return sig4(unit(q), si);
    // Still air has no direction; the recorded angle of a zero vector is not one.
    return env.pad.windSpeed < CALM_MS ? NO_VALUE : fmtDegrees(u, compass(si));
  };

  return (
    <div
      role="region"
      aria-label={t('view.environment')}
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- the pane scrolls, and most of what it shows holds nothing focusable, so without a tab stop the keyboard cannot always scroll it
      tabIndex={0}
      className="h-full space-y-3 overflow-auto p-2"
    >
      <section className="rounded-xl bg-surface p-3 ring-1 ring-line/10">
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-4 gap-y-1 text-xs">
          {validAt && <TermRow label={t('env.when')}>{validAt}</TermRow>}
          <TermRow label={t('env.latitude')}>{latText(flight.launch.latitudeDeg)}</TermRow>
          <TermRow label={t('env.longitude')}>{lonText(flight.launch.longitudeDeg)}</TermRow>
          <TermRow label={t('env.elevation')}>{`${dist.fmtSym(flight.launch.launchAltitudeM ?? 0, 0)}`}</TermRow>
          {PAD.map((q) => (
            <TermRow key={q} label={t(`env.q.${q}`)}>
              {show(q, env.pad[q])}
            </TermRow>
          ))}
        </dl>
        {flight.launch.weatherSource && (
          <div className="mt-2">
            <WeatherSourceLine launch={flight.launch} summary={false} />
          </div>
        )}
      </section>
      <EnvironmentLanding flight={flight} />
      <p className="text-xs text-ink-muted">{t('env.note', { apogee: sig4(dist, env.apogee) })}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {CHARTS.map((q) => (
          <ProfileChart
            key={q}
            title={t(`env.q.${q}`)}
            legs={env.profiles[q]}
            apogee={env.apogee}
            x={q === 'windDirection' ? directionAxis(unit(q)) : unitAxis(unit(q))}
            xSym={unit(q).sym}
            y={dist}
            ascentLabel={t('env.ascent')}
            descentLabel={t('env.descent')}
          />
        ))}
      </div>
    </div>
  );
}

const latText = (v: number | null) => (v == null ? NO_VALUE : formatLat(v));
const lonText = (v: number | null) => (v == null ? NO_VALUE : formatLon(v));

const compass = (rad: number) => norm360(radToDeg(rad));

interface XAxis {
  coord: (si: number) => number;
  label: (c: number) => string;
  range?: [number, number];
  wrap?: number;
}

const directionAxis = (fu: FieldUnit): XAxis => ({
  coord: compass,
  label: (c) => fu.fmt(degToRad(c), fu.sym === '°' ? 0 : 2),
  range: [0, 360],
  wrap: 180,
});

const unitAxis = (fu: FieldUnit): XAxis => ({ coord: (si) => si, label: (si) => fu.fmt(si, 1) });

const W = 320;
const H = 240;
const PAD_L = 46;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 30;

function ProfileChart({
  title,
  legs,
  apogee,
  x,
  xSym,
  y,
  ascentLabel,
  descentLabel,
}: {
  title: string;
  legs: ProfileLegs;
  apogee: number;
  x: XAxis;
  xSym: string;
  y: FieldUnit;
  ascentLabel: string;
  descentLabel: string;
}) {
  const { t } = useTranslation();
  const all = [...legs.ascent, ...legs.descent].map((p) => x.coord(p.value));
  let [lo, hi] = x.range ?? [Math.min(...all), Math.max(...all)];
  if (!(hi > lo)) {
    const pad = Math.abs(lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;
  }
  const top = apogee > 0 ? apogee : 1;
  const px = (v: number) => PAD_L + ((v - lo) / (hi - lo)) * (W - PAD_L - PAD_R);
  const py = (alt: number) => H - PAD_B - (alt / top) * (H - PAD_T - PAD_B);

  const path = (pts: ProfilePoint[]) => {
    const vs = pts.map((p) => x.coord(p.value));
    const jump = (i: number) => i > 0 && x.wrap !== undefined && Math.abs(vs[i]! - vs[i - 1]!) > x.wrap;
    return polylinePath(
      pts.map((p, i) => [px(vs[i]!), py(p.altitude)]),
      'space',
      jump,
    );
  };

  const loUi = x.label(lo);
  const hiUi = x.label(hi);
  const label = t('env.chartAria', { title, lo: loUi, hi: hiUi, unit: xSym, top: y.fmtSym(apogee, 0) });

  return (
    <figure className="rounded-xl bg-surface p-2 ring-1 ring-line/10">
      <figcaption className="flex items-center justify-between px-1 pb-1 text-xs">
        <span className="font-semibold text-ink-soft">{title}</span>
        <span className="flex gap-3 text-ink-muted">
          <LegendSwatch color={token('accent-400')} width={16}>
            {ascentLabel}
          </LegendSwatch>
          <LegendSwatch color={token('warn-400')} width={16} opacity={0.6}>
            {descentLabel}
          </LegendSwatch>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="stroke-ink-dim" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="stroke-ink-dim" />
        <path d={path(legs.descent)} fill="none" strokeWidth={0.75} strokeOpacity={0.6} className="stroke-warn-400" />
        <path d={path(legs.ascent)} fill="none" strokeWidth={1.75} className="stroke-accent-400" />
        <text x={PAD_L - 4} y={PAD_T + 8} textAnchor="end" className="fill-ink-muted text-[10px]">
          {y.fmt(apogee, 0)}
        </text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="fill-ink-muted text-[10px]">
          0
        </text>
        <text x={4} y={(H - PAD_B + PAD_T) / 2} className="fill-ink-faint text-[10px]">
          {y.sym}
        </text>
        <text x={PAD_L} y={H - PAD_B + 13} textAnchor="start" className="fill-ink-muted text-[10px]">
          {loUi}
        </text>
        <text x={W - PAD_R} y={H - PAD_B + 13} textAnchor="end" className="fill-ink-muted text-[10px]">
          {hiUi}
        </text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} textAnchor="middle" className="fill-ink-faint text-[10px]">
          {xSym}
        </text>
      </svg>
    </figure>
  );
}
