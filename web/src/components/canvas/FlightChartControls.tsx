import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { withFixedUnit } from '../../i18n/format';
import { minWindow } from './flightChartAxis';
import { SERIES, pairKey, traceLabel } from './flightChartTraces';
import { ToggleButton } from '../common/ToggleButton';
import { smallButton } from '../common/smallButton';
import type { ChartSeries } from './useChartSeries';

const PAIR = '__pair';

export function FlightChartHeader({
  hoverT,
  maxT,
  announcement,
  t0,
  t1,
  zoomed,
  zoomAt,
  onZoomReset,
  centerT,
  onCsv,
}: {
  hoverT: number | null;
  maxT: number;
  announcement: string;
  t0: number;
  t1: number;
  zoomed: boolean;
  zoomAt: (factor: number, center: number) => void;
  onZoomReset: () => void;
  centerT: () => number;
  onCsv: () => void;
}) {
  const { t } = useTranslation();
  const zBtn = smallButton('chip', 'ink');
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('flight.title')}</h2>
      <div className="flex items-center gap-2">
        <span className="text-xs tabular-nums text-ink-muted">
          {t('flight.time')} {withFixedUnit(hoverT ?? maxT, t('units.second'), hoverT != null ? 2 : 1)}
        </span>
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomAt(0.6, centerT())}
            disabled={t1 - t0 <= minWindow(maxT) + 1e-9}
            title={t('flight.zoomIn')}
            aria-label={t('flight.zoomIn')}
            className={zBtn}
          >
            +
          </button>
          <button
            onClick={() => zoomAt(1 / 0.6, centerT())}
            disabled={!zoomed}
            title={t('flight.zoomOut')}
            aria-label={t('flight.zoomOut')}
            className={zBtn}
          >
            −
          </button>
          <button
            onClick={onZoomReset}
            disabled={!zoomed}
            title={t('flight.zoomReset')}
            aria-label={t('flight.zoomReset')}
            className={zBtn}
          >
            ⤢
          </button>
        </div>
        <button
          onClick={onCsv}
          title={t('flight.exportCsv')}
          aria-label={t('flight.exportCsv')}
          className={smallButton('chip', 'ink')}
        >
          <span aria-hidden>⬇</span> CSV
        </button>
      </div>
    </div>
  );
}

export function StageToggles({ series }: { series: ChartSeries }) {
  const { t } = useTranslation();
  const { branches, isOn, toggleStage, selectedBranches } = series;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        {t('flight.stages')}
      </span>
      {branches.map((b) => {
        const active = isOn(b.key);
        // aria-disabled, not disabled: it stays focusable so its reason can be read.
        const locked = active && selectedBranches.length === 1;
        return (
          <button
            key={b.key}
            onClick={() => toggleStage(b.key)}
            aria-pressed={active}
            aria-disabled={locked || undefined}
            title={locked ? t('flight.lastStageShown') : undefined}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 aria-disabled:cursor-not-allowed ${active ? 'bg-elevated text-ink-strong ring-line/20' : 'bg-raised text-ink-muted ring-line/10'}`}
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: b.color, opacity: active ? 1 : 0.4 }}
            />
            {b.name}
          </button>
        );
      })}
    </div>
  );
}

export function SeriesPicker({ series }: { series: ChartSeries }) {
  const { t } = useTranslation();
  const { extras, plain, pairs, on, saved, toggle } = series;
  const openExtras = extras.filter((m) => on.includes(m.key));
  const addable = extras.filter((m) => !on.includes(m.key));
  const [pairing, setPairing] = useState<{ y: string; x: string } | null>(null);
  const pairReady = !!pairing?.y && !!pairing.x && pairing.y !== pairing.x;
  const pill =
    'rounded-full bg-raised px-2.5 py-1 text-[11px] font-medium text-ink-muted ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        {[...SERIES, ...openExtras, ...pairs].map((m) => {
          const active = on.includes(m.key);
          return (
            <ToggleButton
              key={m.key}
              active={active}
              onClick={() => toggle(m.key)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-line/10"
            >
              {traceLabel(m, t)}
            </ToggleButton>
          );
        })}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value === PAIR) setPairing({ y: '', x: '' });
            else if (e.target.value) toggle(e.target.value);
          }}
          aria-label={t('flight.addSeries')}
          className={`max-w-48 ${pill}`}
        >
          <option value="">{t('flight.addSeries')}</option>
          <option value={PAIR}>{t('flight.addPair')}</option>
          {addable.map((m) => (
            <option key={m.key} value={m.key}>
              {traceLabel(m, t)}
            </option>
          ))}
        </select>
      </div>
      {pairing && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {(['y', 'x'] as const).map((axis) => (
            <select
              key={axis}
              value={pairing[axis]}
              onChange={(e) => setPairing({ ...pairing, [axis]: e.target.value })}
              aria-label={t(axis === 'y' ? 'flight.pairY' : 'flight.pairX')}
              className={`max-w-48 ${pill}`}
            >
              <option value="">{t(axis === 'y' ? 'flight.pairY' : 'flight.pairX')}</option>
              {plain.map((m) => (
                <option key={m.key} value={m.key}>
                  {traceLabel(m, t)}
                </option>
              ))}
            </select>
          ))}
          <button
            type="button"
            disabled={!pairReady}
            onClick={() => {
              const key = pairKey(pairing.y, pairing.x);
              if (!saved.includes(key)) toggle(key);
              setPairing(null);
            }}
            className={smallButton('chip', 'ink')}
          >
            {t('flight.pairAdd')}
          </button>
          <button type="button" onClick={() => setPairing(null)} className={smallButton('chip', 'ink')}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </>
  );
}
