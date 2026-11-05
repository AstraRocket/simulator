import { must } from '../../services/app/must';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Dialog } from '../common/Dialog';
import { CatalogLoading, CatalogError } from '../common/CatalogLoading';
import { useCatalog } from './useCatalog';
import {
  ClassChips,
  FitsMount,
  ImpulseRange,
  ManufacturerMenu,
  OopFilter,
  PerfFilters,
  PluggedFilter,
  SparkyFilter,
  useMotorFilter,
} from './MotorFilterBar';
import { MotorSearch } from './MotorPanelParts';
import { useUnits } from '../../prefs/useUnits';
import { useLauncherT } from '../common/useLauncher';
import { useSettings } from '../../state/SettingsProvider';
import {
  useWorkspaceStore,
  configOf,
  isMotorGuideStale,
  selectDesignName,
  selectMotorGuideFor,
} from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { findMounts, findNode } from '../../services/design/treeEdit';
import { liveMotors } from '../../services/flight/flightConfigs';
import { hasUsableCurve } from '../../services/motors/motorCurve';
import { mountFit } from '../../services/motors/motorPicker';
import { MAX_GUIDE_MOTORS, type GuideRow } from '../../services/flight/motorGuide';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { keyOf } from '../../services/motors/motorKey';
import { avgThrustOf } from '../../services/motors/motorMath';
import { effectivePrefs } from '../../services/flight/simulations';
import { sharedDeviceNames } from '../../services/flight/recoveryFlown';
import { delayString, motorName } from '../../services/motors/motorName';
import { warningText } from '../../services/app/warningText';
import { partName } from '../config/ConfigsTable';
import { useLiftoffFields } from './useLiftoffFields';
import { guideVerdict, verdictRank, type GuideIssue, type GuideVerdict } from './motorGuideIssues';
import { fmtNum } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { motorGuideCsv, CSV_MIME } from '../../services/exports/csvExport';
import { download, exportFilename } from '../../services/files/saveFile';
import { launcherKind } from '../../services/design/launcher';
import { useIsDesktop } from '../common/useMediaQuery';
import {
  GuideResults,
  GuideToolbar,
  GuideUseButton,
  motorCols,
  sortGuideRows,
  useGuideCandidates,
  type GuideCol,
  type GuideSort,
} from './GuideResults';

export function MotorGuideDialog({ simId, onClose }: { simId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const sim = useWorkspaceStore((s) => s.sims.find((x) => x.id === simId));
  const configs = useWorkspaceStore((s) => s.configs);
  const config = sim ? configOf(configs, sim) : null;

  const mounts = useMemo(() => findMounts(tree), [tree]);
  const [mountId, setMountId] = useState<string | null>(() => {
    if (!config) return mounts[0]?.id ?? null;
    const live = liveMotors(tree, config);
    return (live.find(([, m]) => hasUsableCurve(m.spec)) ?? live[0])?.[0] ?? mounts[0]?.id ?? null;
  });
  const mount = mounts.find((m) => m.id === mountId) ?? null;

  return (
    <Dialog
      id="motorGuide"
      title={t('guide.title')}
      onClose={onClose}
      size="6xl"
      layout="fill"
      height={760}
      fullBleed="xl"
    >
      {!sim || !mount ? (
        <div className="grid flex-1 place-items-center p-6 text-sm text-ink-faint">{t('guide.noMount')}</div>
      ) : (
        // Keyed on the mount: its bore seeds the fit filter.
        <GuideBody
          key={mount.id}
          simId={simId}
          mountId={mount.id as string}
          mountPicker={
            mounts.length > 1 ? (
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <span className="text-ink-faint">{t('guide.mount')}</span>
                <select
                  value={mount.id}
                  onChange={(e) => setMountId(e.target.value)}
                  className="rounded-md bg-raised px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10"
                >
                  {mounts.map((m, i) => (
                    <option key={m.id as string} value={m.id as string}>
                      {partName(m, i, t)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null
          }
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

const btn =
  'rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-line/10 disabled:cursor-not-allowed disabled:opacity-40';

function GuideBody({
  simId,
  mountId,
  mountPicker,
  onClose,
}: {
  simId: string;
  mountId: string;
  mountPicker: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const fit = useMemo(() => {
    const node = findNode(tree, mountId);
    return node ? mountFit(node) : null;
  }, [tree, mountId]);

  const { catalog, loading, error, retry } = useCatalog();
  const configId = useWorkspaceStore((s) => {
    const sim = s.sims.find((x) => x.id === simId);
    return sim ? configOf(s.configs, sim).id : null;
  });
  const liftoffFields = useLiftoffFields(configId ? { configId, mountId } : null);
  const f = useMotorFilter(catalog, { mount: fit, perfFields: liftoffFields });
  const { candidates, noCurve, dropped, setDropped, flying } = useGuideCandidates(f.matches);
  const leftOut = noCurve.length;

  const run = useWorkspaceStore((s) => s.motorGuideRun);
  const guide = useWorkspaceStore((s) => selectMotorGuideFor(s, simId));
  const shown = guide && guide.mountId === mountId ? guide : null;
  const stale = useWorkspaceStore((s) => shown !== null && isMotorGuideStale(s, shown));
  const runMotorGuide = useWorkspaceStore((s) => s.runMotorGuide);
  const cancelMotorGuide = useWorkspaceStore((s) => s.cancelMotorGuide);
  const busy = run !== null;
  const tooMany = flying.length > MAX_GUIDE_MOTORS;
  const desktop = useIsDesktop();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`space-y-2 border-b border-line/10 p-3 ${shown && !desktop ? 'hidden' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          {mountPicker}
          <MotorSearch value={f.text} onChange={f.setText} className="min-w-[140px] py-1.5" />
          <ManufacturerMenu manufacturers={f.manufacturers} mfrs={f.mfrs} onChange={f.setMfrs} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ClassChips classes={f.classes} cls={f.cls} onChange={f.setCls} />
          <ImpulseRange imp={f.imp} onChange={f.setImp} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {f.mount && <FitsMount mount={f.mount} fits={f.fits} onChange={f.setFits} />}
          <PluggedFilter plugged={f.plugged} onChange={f.setPlugged} />
          <SparkyFilter value={f.sparky} onChange={f.setSparky} />
          <OopFilter on={f.hideOop} onChange={f.setHideOop} />
        </div>
        <PerfFilters perf={f.perf} onChange={f.setPerf} onClear={f.clearPerf} fields={f.perfFields} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {busy ? (
            <>
              <button onClick={cancelMotorGuide} className={`${btn} bg-raised text-ink hover:bg-elevated`}>
                {t('common.cancel')}
              </button>
              <span className="text-xs tabular-nums text-ink-muted" role="status">
                {t('guide.progress', { done: run.done, total: run.total })}
              </span>
            </>
          ) : (
            <button
              onClick={() => fireAction(runMotorGuide(simId, mountId, flying))}
              disabled={loading || !!error || flying.length === 0 || tooMany}
              className={`${btn} bg-accent-600 text-on-accent hover:bg-accent-700`}
            >
              {tooMany || flying.length === 0 ? t('guide.flyIdle') : t('guide.fly', { count: flying.length })}
            </button>
          )}
          {!busy && !loading && (
            <span className="text-xs">
              <span className={tooMany ? 'text-warn-400' : 'text-ink-faint'}>
                {tooMany ? t('guide.tooMany', { count: flying.length, max: MAX_GUIDE_MOTORS }) : t('guide.cost')}
              </span>
              {leftOut > 0 && (
                <span className="text-ink-faint">{` ${t('guide.noCurveLeftOut', { count: leftOut })}`}</span>
              )}
            </span>
          )}
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
      ) : shown ? (
        <GuideTable simId={simId} guide={shown} stale={stale} cards={!desktop} onClose={onClose} />
      ) : (
        <CandidateList
          candidates={candidates}
          noCurve={noCurve}
          dropped={dropped}
          onDropped={setDropped}
          disabled={busy}
        />
      )}
    </div>
  );
}

export function CandidateList({
  candidates,
  noCurve,
  dropped,
  onDropped,
  disabled,
  hint,
}: {
  candidates: CatalogMotor[];
  noCurve: CatalogMotor[];
  dropped: ReadonlySet<string>;
  onDropped: (next: ReadonlySet<string>) => void;
  disabled: boolean;
  hint?: string;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const ticked = candidates.filter((m) => !dropped.has(keyOf(m))).length;
  const all = candidates.length > 0 && ticked === candidates.length;
  const toggle = (m: CatalogMotor) => {
    const next = new Set(dropped);
    const k = keyOf(m);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onDropped(next);
  };
  const toggleAll = () => onDropped(all ? new Set(candidates.map(keyOf)) : new Set());
  const box = 'accent-accent-500 disabled:opacity-30';
  const pick = 'rounded bg-raised px-2 py-1 text-xs text-ink hover:bg-elevated disabled:opacity-40';

  if (!candidates.length && !noCurve.length) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-ink-faint">
        {t('motorDlg.noResults')}
      </div>
    );
  }
  const row = (m: CatalogMotor, flyable: boolean) => {
    const k = keyOf(m);
    const name = motorName(m);
    return (
      <tr
        key={k}
        onClick={flyable && !disabled ? () => toggle(m) : undefined}
        className={`border-t border-line/5 ${flyable ? 'cursor-pointer hover:bg-raised/50' : 'text-ink-faint'}`}
      >
        <td className="px-2 py-1.5">
          {flyable && (
            <input
              type="checkbox"
              checked={!dropped.has(k)}
              disabled={disabled}
              onChange={() => toggle(m)}
              onClick={(e) => e.stopPropagation()}
              aria-label={t('guide.tickNamed', { motor: name })}
              className={box}
            />
          )}
        </td>
        <th
          scope="row"
          className={`whitespace-nowrap px-2 py-1.5 text-left font-medium ${flyable ? 'text-ink-strong' : ''}`}
        >
          {name}
          <span className="ml-1.5 font-normal text-ink-faint">{m.manufacturer}</span>
          {!flyable && (
            <span
              className="ml-2 rounded bg-elevated px-1 py-0.5 text-[9px] uppercase tracking-wide text-ink-soft"
              title={t('motorDlg.noBundledCurve')}
            >
              {t('dash.noCurve')}
            </span>
          )}
        </th>
        <td className="px-2 py-1.5 text-center">{m.class}</td>
        <td className="px-2 py-1.5 text-right">{u.fmt('impulse', m.impulse)}</td>
        <td className="hidden px-2 py-1.5 text-right sm:table-cell">{u.fmt('force', avgThrustOf(m), 0)}</td>
        <td className="hidden px-2 py-1.5 text-right sm:table-cell">{fmtNum(m.burn, 1)}</td>
        <td className="px-2 py-1.5 text-center">{m.delays ?? NO_VALUE}</td>
      </tr>
    );
  };
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <p className="mr-auto text-xs text-ink-faint">{hint ?? t('guide.hint')}</p>
        <button
          onClick={() => onDropped(new Set())}
          disabled={disabled || !candidates.length || ticked === candidates.length}
          className={pick}
        >
          {t('csv.selectAll')}
        </button>
        <button
          onClick={() => onDropped(new Set(candidates.map(keyOf)))}
          disabled={disabled || ticked === 0}
          className={pick}
        >
          {t('csv.selectNone')}
        </button>
      </div>
      <table className="w-full text-xs tabular-nums text-ink-soft">
        <thead className="sticky top-0 bg-surface text-ink-muted">
          <tr>
            <th scope="col" className="w-6 px-2 py-1.5">
              <input
                type="checkbox"
                checked={all}
                disabled={disabled || !candidates.length}
                onChange={toggleAll}
                aria-label={t('guide.tickAll')}
                className={box}
              />
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              {t('guide.colMotor')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-center font-medium">
              {t('dash.colClass')}
            </th>
            <th
              scope="col"
              className="px-2 py-1.5 text-right font-medium"
            >{`${t('dash.colImpulse')} ${u.sym('impulse')}`}</th>
            <th
              scope="col"
              className="hidden px-2 py-1.5 text-right font-medium sm:table-cell"
            >{`${t('dash.colAvg')} ${u.sym('force')}`}</th>
            <th scope="col" className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">
              {t('dash.colBurn')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-center font-medium">
              {t('dash.colDelays')}
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((m) => row(m, true))}
          {noCurve.map((m) => row(m, false))}
        </tbody>
      </table>
    </div>
  );
}

const COLS: GuideCol<GuideRow>[] = [
  ...motorCols<GuideRow>(),
  { id: 'burn', label: 'guide.colBurn', value: (r) => r.motor.burn, digits: 1 },
  { id: 'apogee', label: 'sim.apogee', quantity: 'distance', value: (r) => r.apogee },
  { id: 'maxVelocity', label: 'sim.maxSpeed', quantity: 'velocity', value: (r) => r.maxVelocity },
  { id: 'maxAcceleration', label: 'sim.maxAccel', quantity: 'acceleration', value: (r) => r.maxAcceleration },
  { id: 'railExit', label: 'sim.rodExit', quantity: 'velocity', value: (r) => r.railExit },
  { id: 'railMargin', label: 'guide.colMargin', value: (r) => r.railMargin, digits: 2 },
  { id: 'railTwr', label: 'guide.colTwr', value: (r) => r.railTwr, digits: 1 },
  { id: 'timeToApogee', label: 'guide.colToApogee', value: (r) => r.timeToApogee, digits: 1 },
  { id: 'optimumDelay', label: 'guide.colOptimum', value: (r) => r.optimumDelay, digits: 1 },
  { id: 'deployVelocity', label: 'sim.deployVelocity', quantity: 'velocity', value: (r) => r.deployVelocity },
  { id: 'landingVelocity', label: 'sim.landing', quantity: 'velocity', value: (r) => r.landingVelocity },
];

const ISSUE_KEY: Record<GuideIssue, string> = {
  slowExit: 'guide.issue.slowExit',
  railMarginal: 'guide.issue.railMarginal',
  railUnstable: 'guide.issue.railUnstable',
  deployFast: 'guide.issue.deployFast',
  deploySlow: 'guide.issue.deploySlow',
};

function verdictText(v: GuideVerdict, t: TFunction): string {
  const parts = v.issues.map((i) => t(ISSUE_KEY[i]));
  if (v.warnings) parts.push(t('guide.issue.warnings', { count: v.warnings }));
  return parts.join(', ');
}

const descFirst = (key: string) => key !== 'motor' && key !== 'status';

function GuideTable({
  simId,
  guide,
  stale,
  cards,
  onClose,
}: {
  simId: string;
  guide: NonNullable<ReturnType<typeof selectMotorGuideFor>>;
  stale: boolean;
  cards: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const lt = useLauncherT();
  const u = useUnits();
  const { settings } = useSettings();
  const tree = useWorkspaceStore((s) => s.tree);
  const simPrefs = useWorkspaceStore((s) => s.sims.find((x) => x.id === simId)?.prefs);
  const designName = useWorkspaceStore(selectDesignName);
  const promote = useWorkspaceStore((s) => s.promoteGuideRow);
  const clearMotorGuide = useWorkspaceStore((s) => s.clearMotorGuide);
  const sharedNames = useMemo(() => sharedDeviceNames(tree.components), [tree]);

  // Judged at render, not when flown, so changed thresholds re-read every row.
  const { railExitVelocityMin } = settings.simulation;
  const { deploymentSpeedWarn } = effectivePrefs(settings.simulation, simPrefs);
  const verdicts = useMemo(
    () =>
      new Map(
        guide.rows.map((r) => [r.key, guideVerdict(r, { railExitVelocityMin, deploymentSpeedWarn, sharedNames })]),
      ),
    [guide.rows, railExitVelocityMin, deploymentSpeedWarn, sharedNames],
  );

  const [sort, setSort] = useState<GuideSort>({ key: 'apogee', desc: true });
  const rows = useMemo(() => {
    const val = (r: GuideRow): number | string => {
      if (sort.key === 'motor') return motorName(r.motor);
      if (sort.key === 'delay') return r.delay;
      if (sort.key === 'status') return verdictRank(must(verdicts.get(r.key), 'guide verdict'));
      return COLS.find((c) => c.id === sort.key)?.value(r) ?? NaN;
    };
    return sortGuideRows(guide.rows, val, sort.desc);
  }, [guide.rows, sort, verdicts]);

  const colLabel = (c: GuideCol<GuideRow>) => (c.quantity ? `${lt(c.label)} (${u.sym(c.quantity)})` : lt(c.label));
  const pickButton = (r: GuideRow, name: string, size: string) => (
    <GuideUseButton
      name={name}
      size={size}
      disabled={stale}
      title={stale ? t('guide.useStale') : t('guide.useHint')}
      onClick={() => {
        if (promote(r.key)) onClose();
      }}
    />
  );
  const status = (r: GuideRow) => {
    const v = must(verdicts.get(r.key), 'guide verdict');
    const clean = !v.issues.length && !v.warnings;
    return (
      <span
        className={clean ? 'text-ok-400' : 'text-warn-400'}
        title={r.warnings.map((w) => warningText(w.message, lt)).join('\n') || undefined}
      >
        {clean ? t('guide.ok') : verdictText(v, t)}
      </span>
    );
  };

  const exportCsv = () => {
    download(
      exportFilename([designName, 'motor-guide'], 'csv'),
      motorGuideCsv(
        rows.map((r) => ({
          motor: motorName(r.motor),
          manufacturer: r.motor.manufacturer,
          delay: delayString(r.delay),
          status: verdictText(must(verdicts.get(r.key), 'guide verdict'), t),
          row: r,
        })),
        u.all,
        t,
        launcherKind(tree),
      ),
      CSV_MIME,
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GuideToolbar
        guide={guide}
        onCsv={exportCsv}
        onClear={clearMotorGuide}
        staleText={stale ? t('guide.stale') : null}
      />
      <GuideResults
        rows={rows}
        failed={guide.failed}
        cols={COLS}
        colLabel={colLabel}
        sort={sort}
        onSort={setSort}
        descFirst={descFirst}
        delay={(r) => ({ text: delayString(r.delay), title: r.motor.delays ?? undefined })}
        statusSorts
        status={status}
        pick={pickButton}
        cards={cards}
      />
    </div>
  );
}
