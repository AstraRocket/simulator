import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { hasCurve, hasLocalCurve, type CatalogMotor } from '../../services/motors/motorDb';
import { parseDelays } from '../../services/motors/motorPicker';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { CatalogLoading, CatalogError } from '../common/CatalogLoading';
import { MotorDetail } from './MotorDetail';
import { keyOf } from '../../services/motors/motorKey';
import {
  ClassChips,
  DiameterRange,
  FitsMount,
  ImpulseRange,
  PerfFilters,
  ManufacturerMenu,
  PluggedFilter,
  SparkyFilter,
  OopFilter,
  UsedFilter,
} from './MotorFilterBar';
import type { useMotorFilter } from './useMotorFilter';
import type { useFilePick } from '../common/useFilePick';
import { ToggleButton } from '../common/ToggleButton';
import { ImportedStar } from './ImportedStar';
import { motorName } from '../../services/motors/motorName';
import { DialogButton } from '../common/DialogButton';
import { MotorSearch } from './MotorPanelParts';
import type { MotorChoice } from './useMotorChoice';

export function MotorFilters({
  filter,
  motorFile,
  hasUsed,
}: {
  filter: ReturnType<typeof useMotorFilter>;
  motorFile: ReturnType<typeof useFilePick>;
  hasUsed: boolean;
}) {
  const { t } = useTranslation();
  const { text, setText, cls, setCls, mfrs, setMfrs, dia, setDia, imp, setImp, perf, perfFields, setPerf } = filter;
  const { clearPerf, plugged, setPlugged, sparky, setSparky, fits, setFits, mount: fitMount } = filter;
  const { classes, manufacturers, hideOop, setHideOop, hideUsed, setHideUsed } = filter;
  return (
    <div className="space-y-2 p-3">
      <div className="flex gap-2">
        <MotorSearch value={text} onChange={setText} className="min-w-0 py-2" />
        <button
          onClick={motorFile.pick}
          className="shrink-0 rounded-lg bg-raised px-3 py-2 text-xs font-medium text-ink hover:bg-elevated"
        >
          {t('motor.import')}
        </button>
        {motorFile.input}
      </div>

      <div className="flex gap-2">
        <ManufacturerMenu manufacturers={manufacturers} mfrs={mfrs} onChange={setMfrs} className="min-w-0 flex-1" />
      </div>

      <div className="flex flex-wrap gap-1">
        <ClassChips classes={classes} cls={cls} onChange={setCls} />
      </div>

      <ImpulseRange imp={imp} onChange={setImp} />
      <DiameterRange dia={dia} onChange={setDia} />
      <PerfFilters perf={perf} onChange={setPerf} onClear={clearPerf} fields={perfFields} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {fitMount && <FitsMount mount={fitMount} fits={fits} onChange={setFits} />}
        <PluggedFilter plugged={plugged} onChange={setPlugged} />
        <SparkyFilter value={sparky} onChange={setSparky} />
        <OopFilter on={hideOop} onChange={setHideOop} />
        {hasUsed && <UsedFilter on={hideUsed} onChange={setHideUsed} />}
      </div>
    </div>
  );
}

export function MotorList({
  error,
  retry,
  loading,
  matches,
  fits,
  choice,
  selectedKey,
  onDelete,
}: {
  error: string | null;
  retry: () => void;
  loading: boolean;
  matches: CatalogMotor[];
  fits: boolean;
  choice: MotorChoice;
  selectedKey: string | null;
  onDelete: (m: CatalogMotor) => Promise<void>;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const { loadingKey, choose, pick } = choice;
  if (error) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <CatalogError message={`${t('catalog.failedMotors')} ${error}`} onRetry={retry} />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <CatalogLoading name="motors" label={t('motorDlg.loadingCatalog')} />
      </div>
    );
  }
  return (
    <ul className="min-h-0 flex-1 divide-y divide-line/5 overflow-y-auto">
      {matches.map((m) => {
        const k = keyOf(m);
        const isLoading = loadingKey === k;
        return (
          <li key={k} className="flex items-stretch">
            <button
              onClick={() => choose(m)}
              onDoubleClick={() => pick(m)}
              disabled={loadingKey !== null}
              aria-pressed={selectedKey === k}
              className={`flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:opacity-50 ${
                selectedKey === k ? 'bg-accent-600/25 ring-1 ring-inset ring-accent-500/50' : 'hover:bg-raised'
              }`}
            >
              <span className="min-w-0">
                {m.custom && <ImportedStar />}
                <span className="font-data font-medium text-ink-strong">{motorName(m)}</span>
                <span className="ml-2 text-xs text-ink-faint">{m.manufacturer}</span>
                {!m.custom && !hasCurve(m) && (
                  <span
                    className="ml-2 rounded bg-elevated px-1 py-0.5 text-[9px] uppercase tracking-wide text-ink-soft"
                    title={t('motorDlg.noBundledCurve')}
                  >
                    {t('dash.noCurve')}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                {isLoading
                  ? t('motorDlg.loading')
                  : `${u.fmtSym('impulse', m.impulse)} · ${u.fmtSym('motorDimensions', m.diameter / 1000)}`}
              </span>
            </button>
            {m.custom && (
              <button
                onClick={() => onDelete(m)}
                aria-label={t('motor.deleteTitle', { name: m.designation })}
                className="shrink-0 px-3 text-danger-400 hover:bg-raised"
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
      {matches.length === 0 && (
        <li className="px-3 py-8 text-center text-sm text-ink-faint">
          {t('motorDlg.noResults')}
          {fits && <div className="mt-1 text-xs text-ink-dim">{t('motorDlg.fitsMountHint')}</div>}
        </li>
      )}
    </ul>
  );
}

export function SelectedMotor({ shown, choice }: { shown: CatalogMotor; choice: MotorChoice }) {
  const { t } = useTranslation();
  const { delay, setDelay, setSelected, curveIdx, setCurveIdx, loadingKey, pick } = choice;
  return (
    <>
      <MotorDetail motor={shown} onBack={() => setSelected(null)} curveIndex={curveIdx} onCurveChange={setCurveIdx} />
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line/10 p-2">
        <DelayControl motor={shown} delay={delay} onDelay={setDelay} />
        <DialogButton
          variant="primary"
          size="sm"
          className="shrink-0"
          onClick={() => pick(shown, curveIdx)}
          disabled={loadingKey !== null || !hasLocalCurve(shown)}
          title={hasLocalCurve(shown) ? undefined : t('motorDlg.noBundledCurve')}
        >
          {loadingKey !== null ? t('motorDlg.loading') : t('motorDlg.select')}
        </DialogButton>
      </div>
    </>
  );
}

function DelayControl({ motor, delay, onDelay }: { motor: CatalogMotor; delay: number; onDelay: (d: number) => void }) {
  const { t } = useTranslation();
  const { delays, plugged } = parseDelays(motor.delays);
  if (plugged && delays.length === 0) return <span />;
  const chip = 'rounded px-1.5 py-0.5 text-xs font-medium';
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-ink-muted">
      <span className="text-ink-faint">{t('sims.delay')}</span>
      {delays.map((d) => (
        <ToggleButton key={d} active={delay === d} onClick={() => onDelay(d)} className={chip}>
          {d}
        </ToggleButton>
      ))}
      <ToggleButton active={delay >= PLUGGED_DELAY} onClick={() => onDelay(PLUGGED_DELAY)} className={chip}>
        {t('motor.plugged')}
      </ToggleButton>
      {/* A raw <input> would commit 0 s when cleared; above PLUGGED_DELAY means plugged. */}
      <NumberInput
        min={0}
        max={PLUGGED_DELAY}
        step={0.5}
        value={delay >= PLUGGED_DELAY ? null : delay}
        onChange={(v) => {
          if (v !== null) onDelay(v);
        }}
        placeholder={t('motorDlg.custom')}
        ariaLabel={t('sims.delay')}
        className="w-14 rounded bg-canvas px-1.5 py-0.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
      />
    </div>
  );
}
