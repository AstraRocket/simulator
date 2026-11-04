import { useLatest } from '../common/useLatest';
import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import {
  hasCurve,
  hasLocalCurve,
  importCustomMotors,
  deleteCustomMotor,
  type CatalogMotor,
} from '../../services/motors/motorDb';
import { catalogMotorSpec } from '../../services/motors/motorSpec';
import { MAX_IDX, parseDelays, type MountFit } from '../../services/motors/motorPicker';
import { PLUGGED_DELAY, type MotorSpec } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { Dialog } from '../common/Dialog';
import { CatalogLoading, CatalogError } from '../common/CatalogLoading';
import { MotorDetail } from './MotorDetail';
import { keyOf } from '../../services/motors/motorKey';
import { useCatalog } from './useCatalog';
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
  useMotorFilter,
} from './MotorFilterBar';
import { loadDia, loadMfrs, saveDia, saveMfrs } from './motorPrefs';
import { errorText } from '../../i18n/keyedError';
import { listWriteErrorText } from '../../services/storage/jsonListStore';
import { fmtList } from '../../i18n/format';
import { useFilePick } from '../common/useFilePick';
import { ToggleButton } from '../common/ToggleButton';
import { confirm } from '../../state/confirmStore';
import { ImportedStar } from './ImportedStar';
import { motorName } from '../../services/motors/motorName';
import { roundTo } from '../../services/app/numbers';
import { toCatalogMm } from '../../services/motors/catalogUnits';
import { DialogButton } from '../common/DialogButton';
import { useLiftoffFields, type LiftoffAt } from './useLiftoffFields';
import { MotorSearch, useCatalogInfo } from './MotorPanelParts';

const DEFAULT_DELAY = 3;

/** A designation is shared (F67W, F67C), so same-name matches narrow by bore and curve source. */
export function findSeated(catalog: CatalogMotor[], cur: MotorSpec): CatalogMotor | undefined {
  const named = catalog.filter(
    (m) => m.manufacturer === cur.manufacturer && (m.designation === cur.designation || m.code === cur.designation),
  );
  if (named.length <= 1) return named[0];
  // The catalog states diameters to 0.1 mm (the 10.5 mm Apogee motors).
  const mm = roundTo(toCatalogMm(cur.diameter), 1);
  const byBore = named.filter((m) => m.diameter === mm);
  const pool = byBore.length ? byBore : named;
  return (cur.curveSrc && pool.find((m) => m.curves?.some((c) => c.src === cur.curveSrc))) || pool[0];
}

export function MotorDialog({
  onClose,
  onSelect,
  onError,
  mount,
  current,
  used = [],
  liftoff,
}: {
  onClose: () => void;
  onSelect: (m: MotorSpec) => void;
  onError: (msg: string | null) => void;
  /** Bore and room in mm. */
  mount?: MountFit | null;
  current?: MotorSpec | null;
  used?: MotorSpec[];
  liftoff?: LiftoffAt | null;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const [delay, setDelay] = useState(DEFAULT_DELAY);
  const [selected, setSelected] = useState<CatalogMotor | null>(null);
  const [curveIdx, setCurveIdx] = useState(0);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const pickWrite = useLatest();

  const updated = useCatalogInfo()?.updated;
  // Restores the seated motor when the catalog lands, before any click can conflict.
  const { catalog, setCatalog, loading, error, retry } = useCatalog({
    onLoaded: (c) => {
      const m = current && findSeated(c, current);
      if (!m) return;
      setSelected(m);
      setDelay(current.ejectionDelay);
      const ci = m.curves?.findIndex((cv) => cv.src === current.curveSrc) ?? -1;
      setCurveIdx(ci >= 0 ? ci : 0);
    },
  });
  const usedKeys = useMemo(
    () =>
      new Set(
        used.flatMap((spec) => {
          const m = findSeated(catalog, spec);
          return m ? [keyOf(m)] : [];
        }),
      ),
    [used, catalog],
  );
  // Never defaulted from the mount, or it would follow the user to a larger mount.
  const liftoffFields = useLiftoffFields(liftoff);
  const [filterInit] = useState(() => ({
    mfrs: loadMfrs(),
    dia: loadDia() ?? ([0, MAX_IDX] as [number, number]),
    mount: mount && mount.bore > 0 ? mount : null,
  }));
  const {
    text,
    setText,
    cls,
    setCls,
    mfrs,
    setMfrs,
    dia,
    setDia,
    diaSaved,
    imp,
    setImp,
    perf,
    perfFields,
    setPerf,
    clearPerf,
    plugged,
    setPlugged,
    sparky,
    setSparky,
    fits,
    setFits,
    mount: fitMount,
    classes,
    manufacturers,
    matches,
    hideOop,
    setHideOop,
    hideUsed,
    setHideUsed,
  } = useMotorFilter(catalog, { ...filterInit, perfFields: liftoffFields }, usedKeys);

  useEffect(() => {
    saveMfrs(mfrs);
  }, [mfrs]);
  // `diaSaved`, not the displayed range, which shows the mount's ceiling while fit is ticked.
  useEffect(() => {
    saveDia(diaSaved);
  }, [diaSaved]);

  // In the handler, not an effect, so the seeded values above are never stomped.
  const choose = (m: CatalogMotor) => {
    setSelected(m);
    setCurveIdx(0);
    const { delays, plugged } = parseDelays(m.delays);
    if (delays.length) setDelay(delays[Math.floor(delays.length / 2)]!);
    else if (plugged) setDelay(PLUGGED_DELAY);
    else setDelay(DEFAULT_DELAY);
  };

  const pick = async (m: CatalogMotor, curveIndex = 0) => {
    if (!hasLocalCurve(m)) return;
    const mine = pickWrite.claim();
    setLoadingKey(keyOf(m));
    onError(null);
    try {
      const spec = await catalogMotorSpec(m, delay, curveIndex);
      if (!mine()) return;
      onSelect(spec);
      onClose();
    } catch (e) {
      if (!mine()) return;
      onError(errorText(e, t));
    } finally {
      if (mine()) setLoadingKey(null);
    }
  };

  const [note, setNote] = useState<string | null>(null);
  // Separate from `pickWrite`, so an import and a pick do not cancel each other.
  const catalogWrite = useLatest();

  const onImport = async (files: File[]) => {
    onError(null);
    setNote(null);
    const mine = catalogWrite.claim();
    try {
      const { catalog, imported, failed } = await importCustomMotors(files.map((f) => ({ name: f.name, blob: f })));
      if (!mine()) return;
      setCatalog(catalog);
      const done = t('motor.importedN', { count: imported });
      setNote(failed.length ? `${done} ${t('motor.importSkipped', { files: fmtList(failed) })}` : done);
    } catch (err) {
      if (!mine()) return;
      onError(listWriteErrorText(err, t));
    }
  };
  const motorFile = useFilePick({ accept: '.eng,.ENG,.rse,.RSE', onFiles: (f) => void onImport(f) });

  const onDelete = async (m: CatalogMotor) => {
    if (!m.id) return;
    const ok = await confirm({
      message: t('motor.deleteConfirm', { name: m.designation }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    onError(null);
    const mine = catalogWrite.claim();
    try {
      const catalog = await deleteCustomMotor(m.id);
      if (!mine()) return;
      setCatalog(catalog);
    } catch (err) {
      if (!mine()) return;
      onError(listWriteErrorText(err, t));
    }
  };

  // Derived, not cleared: Select must not apply a hidden motor, but the highlight returns with the row.
  const selectedKey = selected ? keyOf(selected) : null;
  const shown = selected && matches.some((m) => keyOf(m) === selectedKey) ? selected : null;

  return (
    <Dialog
      id="motorPicker"
      fullBleed="xl"
      title={t('motorDlg.title')}
      onClose={onClose}
      size="6xl"
      layout="fill"
      height={800}
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          className={`flex min-h-0 flex-col md:w-[440px] md:shrink-0 md:border-r md:border-line/10 ${shown ? 'hidden md:flex' : 'flex'}`}
        >
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
              <ManufacturerMenu
                manufacturers={manufacturers}
                mfrs={mfrs}
                onChange={setMfrs}
                className="min-w-0 flex-1"
              />
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
              {usedKeys.size > 0 && <UsedFilter on={hideUsed} onChange={setHideUsed} />}
            </div>
          </div>

          {error ? (
            <div className="grid min-h-0 flex-1 place-items-center p-6">
              <CatalogError message={`${t('catalog.failedMotors')} ${error}`} onRetry={retry} />
            </div>
          ) : loading ? (
            <div className="grid min-h-0 flex-1 place-items-center p-6">
              <CatalogLoading name="motors" label={t('motorDlg.loadingCatalog')} />
            </div>
          ) : (
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
          )}

          <div className="border-t border-line/10 p-2 text-center text-[11px] uppercase tracking-wide text-ink-faint">
            {loading ? '' : (note ?? t('motor.count', { total: matches.length }))}
            {!loading && updated && (
              <div className="normal-case tracking-normal">{t('catalog.updatedOn', { date: updated })}</div>
            )}
          </div>
        </div>

        <div className={`min-h-0 min-w-0 flex-1 flex-col ${shown ? 'flex' : 'hidden md:flex'}`}>
          {shown ? (
            <>
              <MotorDetail
                motor={shown}
                onBack={() => setSelected(null)}
                curveIndex={curveIdx}
                onCurveChange={setCurveIdx}
              />
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
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-ink-faint">
              {t('motorDlg.pickHint')}
            </div>
          )}
        </div>
      </div>
    </Dialog>
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
