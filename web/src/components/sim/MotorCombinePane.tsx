import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { combineCurves, impulseClass, type Sample } from '../../services/motors/motorCombine';
import { useUnits } from '../../prefs/useUnits';
import { SpecItem } from './MotorDetail';
import { keyOf } from '../../services/motors/motorKey';
import { inUserUnit } from './motorFormat';
import { withFixedUnit } from '../../i18n/format';
import {
  ChartAxes,
  CHART_HEADROOM,
  chartScales,
  linePath,
  baselineArea,
  LegendSwatch,
  SeriesPath,
  seriesFor,
  MotorSeries,
} from './chartAxes';
import { token } from '../common/colorTokens';
import { fmtList } from '../../i18n/format';
import { motorStatistics } from '../../engine/openRocketEngine';
import { useEngineReady } from '../../state/engineStore';
import { motorName } from '../../services/motors/motorName';
import { MotorHeading } from './MotorPanelParts';

function CombineChart({ combined, series }: { combined: Sample[]; series: MotorSeries[] }) {
  const { t } = useTranslation();
  const u = useUnits();
  // Per instance: `url(#id)` resolves to the first match in the document.
  const fillId = `combFill${useId()}`;
  const usable = series.filter((s) => s.pts.length >= 2);
  const dims = { width: 560, height: 220, padL: 40, padR: 12, padT: 12, padB: 24 };
  const { width: W, height: H } = dims;
  const tMax = Math.max(1, combined[combined.length - 1]?.[0] ?? 0, ...usable.flatMap((s) => s.pts.map((p) => p[0])));
  const fMax = Math.max(1, ...combined.map((s) => s[1])) * CHART_HEADROOM;
  const { X, Y } = chartScales(dims, tMax, fMax);
  const area = baselineArea(combined, X, Y, tMax);
  const labelDirect = usable.length <= 4;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="mt-2 block max-w-2xl"
        role="img"
        aria-label={t('dash.combineChartAria', { names: fmtList(usable.map((s) => motorName(s.m))) })}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={token('thrust')} stopOpacity="0.28" />
            <stop offset="100%" stopColor={token('thrust')} stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <ChartAxes dims={dims} tMax={tMax} fMax={fMax} X={X} Y={Y} fScale={u.factor('force')} />
        <path d={area} fill={`url(#${fillId})`} />
        {usable.map((s) => (
          <SeriesPath
            key={keyOf(s.m)}
            pts={s.pts}
            X={X}
            Y={Y}
            color={s.color}
            strokeWidth={1.5}
            label={labelDirect ? motorName(s.m) : undefined}
            labelLift={4}
            labelClass="text-[8px] font-semibold"
          />
        ))}
        <path d={linePath(combined, X, Y)} fill="none" stroke={token('thrust')} strokeWidth="2.5" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-soft">
        <LegendSwatch color={token('thrust')} width={12} strokeWidth={2.5}>
          {t('dash.total')}
        </LegendSwatch>
        {usable.map((s) => (
          <LegendSwatch key={keyOf(s.m)} color={s.color} width={12}>
            <span className="font-data">{motorName(s.m)}</span>
          </LegendSwatch>
        ))}
      </div>
    </div>
  );
}

/** `motors` must be referentially stable so the combine memo holds. */
export function MotorCombinePane({ motors }: { motors: CatalogMotor[] }) {
  const { t } = useTranslation();
  const u = useUnits();
  const combined = useMemo(
    () => combineCurves(motors.map((m) => (m.curves?.[0]?.samples ?? []) as Sample[])),
    [motors],
  );
  // Burn time and average thrust are the kernel's (ThrustCurveMotor.computeStatistics).
  const engineReady = useEngineReady();
  const kernel = useMemo(
    () => (engineReady && combined.samples.length >= 2 ? motorStatistics(combined.samples) : null),
    [engineReady, combined.samples],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-3">
      <MotorHeading
        kicker={t('dash.combined')}
        impulseClass={impulseClass(combined.totalImpulse)}
        title={t('dash.cluster', { n: combined.motorCount })}
      />
      <div className="mt-0.5 font-data text-sm text-ink-muted">{motors.map((m) => m.designation).join(' + ')}</div>
      {combined.samples.length >= 2 && <CombineChart combined={combined.samples} series={seriesFor(motors)} />}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <SpecItem label={t('dash.motors')} value={String(combined.motorCount)} />
        <SpecItem label={t('motorDlg.totalImpulse')} value={inUserUnit(u, 'impulse', combined.totalImpulse, 1, 1)} />
        <SpecItem label={t('motorDlg.maxThrust')} value={inUserUnit(u, 'force', combined.peakThrust, 1, 1)} />
        <SpecItem label={t('motorDlg.avgThrust')} value={inUserUnit(u, 'force', kernel?.averageThrust ?? null, 1, 1)} />
        <SpecItem
          label={t('motorDlg.burnTime')}
          value={withFixedUnit(kernel?.burnTime ?? null, t('units.second'), 2)}
        />
      </dl>
      <p className="mt-2 text-[11px] leading-snug text-ink-faint">{t('dash.combineNote')}</p>
    </div>
  );
}
