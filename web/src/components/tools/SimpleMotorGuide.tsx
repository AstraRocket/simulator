import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { CatalogLoading, CatalogError } from '../common/CatalogLoading';
import { useCatalog } from '../sim/useCatalog';
import {
  ClassChips,
  FitsMount,
  ImpulseRange,
  ManufacturerMenu,
  OopFilter,
  PerfFilters,
  PluggedFilter,
  useMotorFilter,
} from '../sim/MotorFilterBar';
import { MotorSearch } from '../sim/MotorPanelParts';
import { CandidateList } from '../sim/MotorGuideDialog';
import {
  GuideResults,
  GuideToolbar,
  GuideUseButton,
  motorCols,
  sortGuideRows,
  useGuideCandidates,
  type GuideCol,
  type GuideSort,
} from '../sim/GuideResults';
import { useUnits } from '../../prefs/useUnits';
import { useSettings } from '../../state/SettingsProvider';
import { PERF_FIELDS, twrField } from '../../services/motors/motorPerf';
import { catalogMotorSpec } from '../../services/motors/motorSpec';
import { keyOf } from '../../services/motors/motorKey';
import { delayString, motorName } from '../../services/motors/motorName';
import { nearestDelay, probeDelay } from '../../services/flight/motorGuide';
import { SimCanceledError } from '../../engine/simClient';
import { errorText } from '../../i18n/keyedError';
import {
  SIMPLE_GUIDE_MAX,
  SIMPLE_MACH_CAUTION,
  SIMPLE_STABILITY_MIN,
  simpleMountFit,
  type SimpleFigures,
  type SimpleGuide,
  type SimpleGuideFailure,
  type SimpleGuideRow,
  type SimpleInputs,
  type SimpleLaunch,
} from '../../services/flight/simpleRocket';
import { flySimple } from './simpleFlight';
import { useIsDesktop } from '../common/useMediaQuery';
import { MAIN_BAND } from '../../services/flight/recoverySizing';
import { simpleGuideCsv, CSV_MIME } from '../../services/exports/csvExport';
import { download, exportFilename } from '../../services/files/saveFile';

/**
 * The motor guide for the simple rocket: the design guide's filters and
 * candidate list, each ticked motor flown once in the simple rocket built
 * around it, and the flights as one sortable table. "Use" puts a row's motor
 * and figures back on the tool.
 *
 * The finished guide belongs to the tool (it is remembered with the tool's
 * inputs), so closing and reopening the dialog shows it again. A run in
 * progress belongs to the dialog: closing it cancels the flights.
 */
export function SimpleMotorGuide({
  inputs,
  launch,
  flownKey,
  guide,
  onGuide,
  onUse,
  onClose,
}: {
  inputs: SimpleInputs;
  launch: SimpleLaunch;
  /** What the current inputs are (`simpleKey`), to tell a stale guide. */
  flownKey: string;
  guide: SimpleGuide | null;
  onGuide: (g: SimpleGuide | null) => void;
  onUse: (row: SimpleGuideRow) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fit = useMemo(() => simpleMountFit(inputs), [inputs]);
  const perfFields = useMemo(
    () => [...PERF_FIELDS, twrField({ dryKg: inputs.dryMassKg, otherMotorsKg: 0, count: 1 })],
    [inputs.dryMassKg],
  );
  const { catalog, loading, error, retry } = useCatalog();
  const f = useMotorFilter(catalog, { mount: fit, perfFields });
  const { candidates, noCurve, dropped, setDropped, flying } = useGuideCandidates(f.matches);
  const tooMany = flying.length > SIMPLE_GUIDE_MAX;

  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Closing the dialog takes its flights with it.
  useEffect(() => () => abort.current?.abort(), []);

  const fly = async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const key = flownKey;
    const asked = flying;
    onGuide(null);
    setRun({ done: 0, total: asked.length });
    const rows: SimpleGuideRow[] = [];
    const failed: SimpleGuideFailure[] = [];
    await Promise.all(
      asked.map(async (motor) => {
        const k = keyOf(motor);
        try {
          const spec = await catalogMotorSpec(motor, probeDelay(motor));
          if (ac.signal.aborted) throw new SimCanceledError();
          const first = await flySimple(inputs, launch, spec, ac.signal);
          const nearest = nearestDelay(motor, first.optimumDelay);
          // Seated at the charge to fly, so "Use" carries the right delay.
          const seated = { ...spec, ejectionDelay: nearest ?? spec.ejectionDelay };
          // With a parachute the charge decides the deployment speed, so a
          // motor whose nearest charge is not the one probed flies again at it,
          // as a design's guide does. Without one, the climb is the same.
          const again = inputs.chute != null && nearest != null && nearest !== spec.ejectionDelay;
          const figures = again ? await flySimple(inputs, launch, seated, ac.signal) : first;
          rows.push({ key: k, motor, spec: seated, figures, nearest });
        } catch (e) {
          if (!ac.signal.aborted) failed.push({ key: k, motor, reason: errorText(e, t) });
        } finally {
          if (abort.current === ac) setRun((r) => (r ? { ...r, done: r.done + 1 } : r));
        }
      }),
    );
    if (abort.current !== ac) return;
    abort.current = null;
    setRun(null);
    const order = new Map(asked.map((m, i) => [keyOf(m), i]));
    const byAsked = (a: { key: string }, b: { key: string }) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0);
    onGuide({
      key,
      asked: asked.length,
      partial: ac.signal.aborted,
      rows: rows.sort(byAsked),
      failed: failed.sort(byAsked),
    });
  };

  const cancel = () => {
    abort.current?.abort();
  };

  const btn =
    'rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-line/10 disabled:cursor-not-allowed disabled:opacity-40';
  const leftOut = noCurve.length;
  const desktop = useIsDesktop();
  const showing = guide != null && !run;

  return (
    <Dialog
      id="simpleMotorGuide"
      title={t('guide.title')}
      onClose={onClose}
      size="6xl"
      layout="fill"
      height={760}
      fullBleed="xl"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* On a phone the filters fill the screen on their own, so with a guide
            up they give it the room; Clear brings them back. */}
        <div className={`space-y-2 border-b border-line/10 p-3 ${showing && !desktop ? 'hidden' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
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
            {run ? (
              <>
                <button onClick={cancel} className={`${btn} bg-raised text-ink hover:bg-elevated`}>
                  {t('common.cancel')}
                </button>
                <span className="text-xs tabular-nums text-ink-muted" role="status">
                  {t('guide.progress', { done: run.done, total: run.total })}
                </span>
              </>
            ) : (
              <button
                onClick={() => void fly()}
                disabled={loading || !!error || flying.length === 0 || tooMany}
                className={`${btn} bg-accent-600 text-on-accent hover:bg-accent-700`}
              >
                {tooMany || flying.length === 0 ? t('guide.flyIdle') : t('guide.fly', { count: flying.length })}
              </button>
            )}
            {!run && !loading && (
              <span className="text-xs">
                <span className={tooMany ? 'text-warn-400' : 'text-ink-faint'}>
                  {tooMany
                    ? t('guide.tooMany', { count: flying.length, max: SIMPLE_GUIDE_MAX })
                    : t('simpleTool.guideCost')}
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
        ) : showing ? (
          <GuideTable
            guide={guide}
            stale={guide.key !== flownKey}
            cards={!desktop}
            onClear={() => onGuide(null)}
            onUse={onUse}
          />
        ) : (
          <CandidateList
            candidates={candidates}
            noCurve={noCurve}
            dropped={dropped}
            onDropped={setDropped}
            disabled={run !== null}
            hint={t('simpleTool.guideHint')}
          />
        )}
      </div>
    </Dialog>
  );
}

// `?? null`: a guide remembered from before a figure existed has no such field.
const fig = (k: keyof SimpleFigures) => (r: SimpleGuideRow) => r.figures[k] ?? null;

/** Off the launcher first, the figures drag barely touches; then the estimates. */
const COLS: GuideCol<SimpleGuideRow>[] = [
  ...motorCols<SimpleGuideRow>(),
  { id: 'railExit', label: 'simpleTool.railExit', quantity: 'velocity', value: fig('railExit') },
  { id: 'railTwr', label: 'guide.colTwr', value: fig('railTwr'), digits: 1 },
  { id: 'maxAcceleration', label: 'sim.maxAccel', quantity: 'acceleration', value: fig('maxAcceleration') },
  { id: 'apogee', label: 'sim.apogee', quantity: 'distance', value: fig('apogee') },
  { id: 'maxVelocity', label: 'sim.maxSpeed', quantity: 'velocity', value: fig('maxVelocity') },
  { id: 'maxMach', label: 'sim.maxMach', value: fig('maxMach'), digits: 2 },
  { id: 'timeToApogee', label: 'guide.colToApogee', value: fig('timeToApogee'), digits: 1 },
  { id: 'optimumDelay', label: 'guide.colOptimum', value: fig('optimumDelay'), digits: 1 },
  { id: 'nearest', label: 'simpleTool.colNearest', value: (r) => r.nearest, digits: 0 },
  { id: 'railStability', label: 'simpleTool.colStability', value: fig('railStability'), digits: 2 },
  { id: 'deployVelocity', label: 'sim.deployVelocity', quantity: 'velocity', value: fig('deployVelocity') },
  { id: 'landingVelocity', label: 'simpleTool.landingSpeed', quantity: 'velocity', value: fig('landingVelocity') },
];

/** Columns a guide has only when it flew them: stability needs a CG, the descent a parachute. */
const OPTIONAL_COLS: ReadonlySet<string> = new Set(['railStability', 'deployVelocity', 'landingVelocity']);

/** The motor's name runs low to high first; figures high to low. */
const descFirst = (key: string) => key !== 'motor';

function GuideTable({
  guide,
  stale,
  cards,
  onClear,
  onUse,
}: {
  guide: SimpleGuide;
  stale: boolean;
  /** One card per motor rather than a table thirteen columns wide (phones). */
  cards: boolean;
  onClear: () => void;
  onUse: (row: SimpleGuideRow) => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const { settings } = useSettings();
  const minExit = settings.simulation.railExitVelocityMin;
  const notes = (r: SimpleGuideRow): string[] => [
    ...(r.figures.railExit < minExit ? [t('guide.issue.slowExit')] : []),
    ...(r.figures.maxMach > SIMPLE_MACH_CAUTION ? [t('simpleTool.issueMach')] : []),
    ...((r.figures.railStability ?? Infinity) < SIMPLE_STABILITY_MIN ? [t('simpleTool.issueStability')] : []),
    ...((r.figures.deployVelocity ?? 0) > settings.simulation.deploymentSpeedWarn ? [t('guide.issue.deployFast')] : []),
    ...((r.figures.landingVelocity ?? 0) > MAIN_BAND.max ? [t('simpleTool.issueHardLanding')] : []),
  ];
  // Rather than a column of dashes for what this guide did not fly.
  const cols = COLS.filter((c) => !OPTIONAL_COLS.has(c.id) || guide.rows.some((r) => c.value(r) != null));

  // Highest apogee first, as the design's guide opens.
  const [sort, setSort] = useState<GuideSort>({ key: 'apogee', desc: true });
  const rows = useMemo(() => {
    const val = (r: SimpleGuideRow): number | string =>
      sort.key === 'motor' ? motorName(r.motor) : (COLS.find((c) => c.id === sort.key)?.value(r) ?? NaN);
    return sortGuideRows(guide.rows, val, sort.desc);
  }, [guide.rows, sort]);

  const colLabel = (c: GuideCol<SimpleGuideRow>) => (c.quantity ? `${t(c.label)} (${u.sym(c.quantity)})` : t(c.label));
  const pickButton = (r: SimpleGuideRow, name: string, size: string) => (
    <GuideUseButton
      name={name}
      size={size}
      disabled={stale}
      title={stale ? t('simpleTool.guideStale') : t('simpleTool.useHint')}
      onClick={() => onUse(r)}
    />
  );
  const status = (r: SimpleGuideRow) => {
    const n = notes(r);
    return (
      <span className={n.length ? 'text-warn-400' : 'text-ok-400'}>{n.length ? n.join(', ') : t('guide.ok')}</span>
    );
  };
  // The table as sorted, in the user's units, as the design's guide exports.
  const exportCsv = () => {
    download(
      exportFilename([t('tabs.simple'), 'motor-guide'], 'csv'),
      simpleGuideCsv(
        rows.map((r) => ({
          motor: motorName(r.motor),
          manufacturer: r.motor.manufacturer,
          delay: delayString(r.spec.ejectionDelay),
          status: notes(r).join(', '),
          row: r,
        })),
        u.all,
        t,
      ),
      CSV_MIME,
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GuideToolbar
        guide={guide}
        onCsv={exportCsv}
        onClear={onClear}
        staleText={stale ? t('simpleTool.guideStale') : null}
      />
      <p className="px-3 pb-2 text-xs text-ink-faint">{t('simpleTool.estimateNote')}</p>
      <GuideResults
        rows={rows}
        failed={guide.failed}
        cols={cols}
        colLabel={colLabel}
        sort={sort}
        onSort={setSort}
        descFirst={descFirst}
        statusSorts={false}
        status={status}
        pick={pickButton}
        cards={cards}
      />
    </div>
  );
}
