import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { unitScope } from '../../prefs/units';
import { useWorkspaceStore, selectDriftSweepFor, isDriftSweepStale } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { smallButton } from '../common/smallButton';
import { MAX_WIND_SPEED_MS } from '../../services/flight/safetyLimits';
import {
  defaultSweepSpec,
  normalizeSweepSpec,
  sweepFlightCount,
  type WindSweepSpec,
} from '../../services/flight/windSweep';
import type { LaunchConditions } from '../../services/design/orkTree';
import { surfaceWind } from '../../services/flight/windLevels';

/** Degrees. */
const SPANS = [360, 180, 90, 45] as const;

const numCls =
  'w-16 rounded bg-raised px-1 py-0.5 text-right text-[11px] tabular-nums text-ink-strong ring-1 ring-line/10';

export function DriftSweepPanel({ simId, launch }: { simId: string; launch: LaunchConditions }) {
  const { t } = useTranslation();
  const u = useUnits();
  const wind = u.at(unitScope('launch', 'speed'), 'windspeed');

  const mine = useWorkspaceStore((s) => selectDriftSweepFor(s, simId));
  const run = useWorkspaceStore((s) => s.driftSweepRun);
  const runDriftSweep = useWorkspaceStore((s) => s.runDriftSweep);
  const cancelDriftSweep = useWorkspaceStore((s) => s.cancelDriftSweep);
  const clearDriftSweep = useWorkspaceStore((s) => s.clearDriftSweep);

  const [spec, setSpec] = useState<WindSweepSpec>(() => defaultSweepSpec(surfaceWind(launch).speedMs));
  const flights = useMemo(() => sweepFlightCount(spec), [spec]);

  const busy = run !== null;
  const stale = useWorkspaceStore((s) => mine !== null && isDriftSweepStale(s, mine));

  const patch = (p: Partial<WindSweepSpec>) => setSpec((cur) => ({ ...cur, ...p }));
  const settle = () => setSpec((cur) => normalizeSweepSpec(cur));

  const speedRow = (key: 'speedMinMs' | 'speedMaxMs', label: string) => (
    <label key={key} className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-ink-muted">{label}</span>
      <span className="flex items-center gap-1">
        <NumberInput
          value={wind.toUi(spec[key])}
          onChange={onSi(wind, (si) => patch({ [key]: si ?? 0 }))}
          onCommit={settle}
          step={wind.step(0.5)}
          min={0}
          max={wind.toUi(MAX_WIND_SPEED_MS)}
          disabled={busy}
          ariaLabel={label}
          className={numCls}
        />
        <span className="w-8 text-[10px] text-ink-faint">{wind.sym}</span>
      </span>
    </label>
  );

  const stepsRow = (key: 'speedSteps' | 'headingSteps', label: string, max: number) => (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-ink-muted">{label}</span>
      <NumberInput
        value={spec[key]}
        onChange={(v) => patch({ [key]: v ?? 1 })}
        onCommit={settle}
        step={1}
        min={1}
        max={max}
        disabled={busy}
        ariaLabel={label}
        className={numCls}
      />
    </label>
  );

  // `min-h-0` + scroll: on a phone the clipping plot box would hide the Run button.
  return (
    <div className="min-h-0 w-60 overflow-y-auto rounded-lg bg-surface/95 p-2.5 text-ink-soft ring-1 ring-line/10">
      <div className="mb-2 flex items-baseline gap-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('sweep.title')}</h3>
        <span className="rounded bg-warn-400/15 px-1 text-[9px] font-medium uppercase tracking-wide text-warn-300 ring-1 ring-warn-400/30">
          {t('sweep.experimental')}
        </span>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-ink-faint">{t('sweep.experimentalNote')}</p>

      <div className="space-y-1.5">
        {speedRow('speedMinMs', t('sweep.speedFrom'))}
        {speedRow('speedMaxMs', t('sweep.speedTo'))}
        {stepsRow('speedSteps', t('sweep.speedSteps'), 12)}
        {stepsRow('headingSteps', t('sweep.headingSteps'), 36)}
        <label className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-ink-muted">{t('sweep.headingSpan')}</span>
          <select
            value={spec.headingSpanDeg}
            onChange={(e) => setSpec((cur) => normalizeSweepSpec({ ...cur, headingSpanDeg: Number(e.target.value) }))}
            disabled={busy}
            aria-label={t('sweep.headingSpan')}
            className="w-[76px] rounded bg-raised px-1 py-0.5 text-right text-[11px] tabular-nums text-ink-strong ring-1 ring-line/10"
          >
            {SPANS.map((d) => (
              <option key={d} value={d}>
                {d === 360 ? t('sweep.spanAll') : `±${fmtDegrees(u, d / 2)}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-[10px] text-ink-faint">{t('sweep.flights', { count: flights })}</p>

      <div className="mt-2 flex items-center gap-1.5">
        {busy ? (
          <>
            <button onClick={cancelDriftSweep} className={smallButton('chip', 'ink')}>
              {t('common.cancel')}
            </button>
            <span className="text-[10px] tabular-nums text-ink-muted">
              {t('sweep.progress', { done: run.done, total: run.total })}
            </span>
          </>
        ) : (
          <>
            <button
              onClick={() => fireAction(runDriftSweep(simId, spec))}
              className="rounded-md bg-accent-600 px-2 py-1 text-[11px] font-medium text-on-accent hover:bg-accent-700"
            >
              {t('sweep.run')}
            </button>
            {mine && (
              <button onClick={clearDriftSweep} className={smallButton('chip', 'soft')}>
                {t('sweep.clear')}
              </button>
            )}
          </>
        )}
      </div>

      {mine && !busy && (
        <p className="mt-2 text-[10px] leading-snug text-ink-muted">
          {t('sweep.landed', { flown: mine.flown, asked: mine.asked })}
        </p>
      )}
      {stale && <p className="mt-1 text-[10px] leading-snug text-warn-400">{t('sweep.stale')}</p>}
    </div>
  );
}
