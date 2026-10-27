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
  useMotorFilter,
} from './MotorFilterBar';
import { MotorSearch } from './MotorPanelParts';
import { useUnits, type Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
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
import { hasLocalCurve, type CatalogMotor } from '../../services/motors/motorDb';
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

/**
 * The motor guide: pick candidate motors with the motor filters, fly each one in
 * a mount of this simulation, and read the flights as one sortable table. The
 * question thrustcurve.org's Motor Guide answers, flown on the design itself.
 *
 * Opened from the Simulations toolbar for the active simulation, because a
 * guide is a question about that row: its launch conditions, its configuration
 * (every other mount stays as it is) and its settings. The flights are
 * throwaway (services/flight/motorGuide); "Use" keeps one as a configuration
 * and a simulation of its own.
 *
 * Mounted only while open, which also defers the catalog download.
 */
export function MotorGuideDialog({ simId, onClose }: { simId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const sim = useWorkspaceStore((s) => s.sims.find((x) => x.id === simId));
  const configs = useWorkspaceStore((s) => s.configs);
  const config = sim ? configOf(configs, sim) : null;

  const mounts = useMemo(() => findMounts(tree), [tree]);
  // The mount the run gate judges, which is the one with a motor that flies;
  // on a single-mount rocket the only one there is.
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
        // Keyed on the mount: its bore is what the fit filter starts from, and a
        // different mount is a different set of candidates.
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
  // Only motors with a curve to fly; the rest are listed for their specs alone.
  const candidates = useMemo(() => f.matches.filter(hasLocalCurve), [f.matches]);
  const uncurved = useMemo(() => f.matches.filter((m) => !hasLocalCurve(m)), [f.matches]);
  const leftOut = uncurved.length;
  // The motors unticked in the list, by key. Kept as exclusions rather than a
  // ticked set, so a motor a filter change brings in arrives ticked.
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const flying = useMemo(() => candidates.filter((m) => !dropped.has(keyOf(m))), [candidates, dropped]);

  const run = useWorkspaceStore((s) => s.motorGuideRun);
  const guide = useWorkspaceStore((s) => selectMotorGuideFor(s, simId));
  const shown = guide && guide.mountId === mountId ? guide : null;
  const stale = useWorkspaceStore((s) => shown !== null && isMotorGuideStale(s, shown));
  const runMotorGuide = useWorkspaceStore((s) => s.runMotorGuide);
  const cancelMotorGuide = useWorkspaceStore((s) => s.cancelMotorGuide);
  const busy = run !== null;
  const tooMany = flying.length > MAX_GUIDE_MOTORS;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-line/10 p-3">
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
              {/* A count on the button only when it is what will fly: "Fly 25
                  motors" on a disabled button reads as an offer it will not keep. */}
              {tooMany || flying.length === 0 ? t('guide.flyIdle') : t('guide.fly', { count: flying.length })}
            </button>
          )}
          {/* The bill, and the ceiling, before it is run: each motor is up to
              two flights, and the filters above are how the list gets short. */}
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
        <GuideTable simId={simId} guide={shown} stale={stale} onClose={onClose} />
      ) : (
        <CandidateList
          candidates={candidates}
          uncurved={uncurved}
          dropped={dropped}
          onDropped={setDropped}
          disabled={busy}
        />
      )}
    </div>
  );
}

/**
 * The motors a Fly would fly, before it is pressed: every match with a curve,
 * each with a box to leave it out, and below them the matches with no curve,
 * which are listed so the count beside the button can be checked but cannot be
 * ticked. Without this the guide flies a set the user has only ever seen as a
 * number.
 */
function CandidateList({
  candidates,
  uncurved,
  dropped,
  onDropped,
  disabled,
}: {
  candidates: CatalogMotor[];
  uncurved: CatalogMotor[];
  dropped: ReadonlySet<string>;
  onDropped: (next: ReadonlySet<string>) => void;
  disabled: boolean;
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

  if (!candidates.length && !uncurved.length) {
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
      <tr key={k} className={`border-t border-line/5 ${flyable ? 'hover:bg-raised/50' : 'text-ink-faint'}`}>
        <td className="px-2 py-1.5">
          {flyable && (
            <input
              type="checkbox"
              checked={!dropped.has(k)}
              disabled={disabled}
              onChange={() => toggle(m)}
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
        <td className="px-2 py-1.5 text-right">{u.fmt('force', avgThrustOf(m), 0)}</td>
        <td className="px-2 py-1.5 text-right">{fmtNum(m.burn, 1)}</td>
        <td className="px-2 py-1.5 text-center">{m.delays ?? NO_VALUE}</td>
      </tr>
    );
  };
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      <p className="py-2 text-xs text-ink-faint">{t('guide.hint')}</p>
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
              className="px-2 py-1.5 text-right font-medium"
            >{`${t('dash.colAvg')} ${u.sym('force')}`}</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              {t('dash.colBurn')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-center font-medium">
              {t('dash.colDelays')}
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((m) => row(m, true))}
          {uncurved.map((m) => row(m, false))}
        </tbody>
      </table>
    </div>
  );
}

/** One table column: a figure off the row, in SI, and the unit it is shown in. */
interface GuideCol {
  id: string;
  label: string;
  /** Unit group; absent for a figure with one unit, which the label then names. */
  quantity?: Quantity;
  value: (r: GuideRow) => number | null;
  /** Fixed decimals for a unitless figure. */
  digits?: number;
}

const COLS: GuideCol[] = [
  // The motor's own figures first, as the list before the flight shows them,
  // so how much motor it is sits beside what it did.
  { id: 'impulse', label: 'motorDlg.totalImpulse', quantity: 'impulse', value: (r) => r.motor.impulse },
  { id: 'avgThrust', label: 'motorDlg.avgThrust', quantity: 'force', value: (r) => avgThrustOf(r.motor) },
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

/** 'motor', 'delay', 'status', or a column id. */
type SortKey = string;

const cellText = (c: GuideCol, r: GuideRow, u: Units): string => {
  const v = c.value(r);
  if (v == null || !Number.isFinite(v)) return NO_VALUE;
  return c.quantity ? u.fmt(c.quantity, v) : fmtNum(v, c.digits ?? 1);
};

/** The status cell's words, in the order the issues are judged. */
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

function GuideTable({
  simId,
  guide,
  stale,
  onClose,
}: {
  simId: string;
  guide: NonNullable<ReturnType<typeof selectMotorGuideFor>>;
  stale: boolean;
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

  // Judged at render, not when flown, so a changed rail-exit minimum re-reads
  // every row the way it re-reads the results tiles.
  const { railExitVelocityMin } = settings.simulation;
  const { deploymentSpeedWarn } = effectivePrefs(settings.simulation, simPrefs);
  const verdicts = useMemo(
    () =>
      new Map(
        guide.rows.map((r) => [r.key, guideVerdict(r, { railExitVelocityMin, deploymentSpeedWarn, sharedNames })]),
      ),
    [guide.rows, railExitVelocityMin, deploymentSpeedWarn, sharedNames],
  );

  // Highest apogee first: the column a guide is most often read by.
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'apogee', desc: true });
  const rows = useMemo(() => {
    const val = (r: GuideRow): number | string => {
      if (sort.key === 'motor') return motorName(r.motor);
      if (sort.key === 'delay') return r.delay;
      if (sort.key === 'status') return verdictRank(verdicts.get(r.key)!);
      return COLS.find((c) => c.id === sort.key)?.value(r) ?? NaN;
    };
    return [...guide.rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      // Unknown figures sort last whichever way the column runs.
      const xn = typeof x === 'number' && !Number.isFinite(x);
      const yn = typeof y === 'number' && !Number.isFinite(y);
      if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1;
      const c = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
      return sort.desc ? -c : c;
    });
  }, [guide.rows, sort, verdicts]);

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
        // Headers wrap, onto two lines at most for these labels: held to one
        // line, "Thrust/weight at exit" and its neighbors set the column
        // widths, and fourteen columns then scroll sideways in a dialog that
        // has room for every figure in them.
        className={`px-1.5 py-1.5 align-bottom font-medium leading-tight ${align === 'left' ? 'text-left' : 'text-right'}`}
      >
        <button
          onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'motor' && key !== 'status' }))}
          className={`hover:text-ink-strong ${align === 'left' ? 'text-left' : 'text-right'} ${active ? 'text-ink-strong' : ''}`}
        >
          {label}
          {active && <span aria-hidden="true">{sort.desc ? ' ▾' : ' ▴'}</span>}
        </button>
      </th>
    );
  };
  const colLabel = (c: GuideCol) => (c.quantity ? `${lt(c.label)} (${u.sym(c.quantity)})` : lt(c.label));

  const exportCsv = () => {
    download(
      exportFilename([designName, 'motor-guide'], 'csv'),
      motorGuideCsv(
        rows.map((r) => ({
          motor: motorName(r.motor),
          manufacturer: r.motor.manufacturer,
          delay: delayString(r.delay),
          status: verdictText(verdicts.get(r.key)!, t),
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
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
        <span className="text-ink-muted">
          {t(guide.partial ? 'guide.flownPartial' : 'guide.flown', { flown: guide.rows.length, asked: guide.asked })}
        </span>
        <button onClick={exportCsv} disabled={!rows.length} className={`${btn} bg-raised text-ink hover:bg-elevated`}>
          <span aria-hidden>⬇ CSV</span>
          <span className="sr-only">{t('guide.exportCsv')}</span>
        </button>
        <button onClick={clearMotorGuide} className={`${btn} bg-raised text-ink-soft hover:bg-elevated`}>
          {t('guide.clear')}
        </button>
        {/* The rows stay on screen and say so, as a stale drift sweep does: they
            are still the honest answer for the rocket that flew them. */}
        {stale && <span className="text-warn-400">{t('guide.stale')}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 bg-surface text-ink-muted">
            <tr>
              {header('motor', t('guide.colMotor'), 'left')}
              {header('delay', t('guide.colDelay'))}
              {COLS.map((c) => header(c.id, colLabel(c)))}
              {header('status', t('guide.colStatus'), 'left')}
              <th scope="col" className="px-1.5 py-1.5 align-bottom">
                <span className="sr-only">{t('guide.colUse')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/5">
            {rows.map((r) => {
              const v = verdicts.get(r.key)!;
              const clean = !v.issues.length && !v.warnings;
              const name = motorName(r.motor);
              return (
                <tr key={r.key} className="hover:bg-raised/50">
                  <th scope="row" className="whitespace-nowrap px-1.5 py-1.5 text-left font-medium text-ink-strong">
                    {name}
                    <span className="ml-1.5 font-normal text-ink-faint">{r.motor.manufacturer}</span>
                  </th>
                  <td className="px-1.5 py-1.5 text-right" title={r.motor.delays ?? undefined}>
                    {delayString(r.delay)}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.id} className="whitespace-nowrap px-1.5 py-1.5 text-right text-ink-soft">
                      {cellText(c, r, u)}
                    </td>
                  ))}
                  <td
                    className={`px-1.5 py-1.5 ${clean ? 'text-ok-400' : 'text-warn-400'}`}
                    // The warnings themselves, as the warnings card words them.
                    title={r.warnings.map((w) => warningText(w.message, lt)).join('\n') || undefined}
                  >
                    {clean ? t('guide.ok') : verdictText(v, t)}
                  </td>
                  <td className="px-1.5 py-1.5 text-right">
                    <button
                      onClick={() => {
                        if (promote(r.key)) onClose();
                      }}
                      disabled={stale}
                      title={stale ? t('guide.useStale') : t('guide.useHint')}
                      aria-label={t('guide.useNamed', { motor: name })}
                      className="rounded-md bg-raised px-2 py-0.5 text-[11px] font-medium text-ink ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('guide.use')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {guide.failed.length > 0 && (
          <div className="mt-3 space-y-1 text-xs">
            <h3 className="font-medium text-ink-muted">{t('guide.notFlown', { count: guide.failed.length })}</h3>
            <ul className="space-y-0.5 text-ink-faint">
              {guide.failed.map((x) => (
                <li key={x.key}>
                  <span className="font-medium text-ink-soft">{motorName(x.motor)}</span> {x.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
