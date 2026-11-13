import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { MotorCatalogGate } from '../sim/MotorCatalogGate';
import { useCatalog } from '../sim/useCatalog';
import { useMotorFilter } from '../sim/useMotorFilter';
import { CandidateList } from '../sim/MotorGuideDialog';
import {
  GuideFilterPanel,
  GuideResults,
  GuideToolbar,
  GuideUseButton,
  type GuideCol,
  type GuideSort,
} from '../sim/GuideResults';
import { motorCols, sortGuideRows, useGuideCandidates } from '../sim/guideRows';
import { useUnits } from '../../prefs/useUnits';
import { useSettings } from '../../state/useSettings';
import { PERF_FIELDS, twrField } from '../../services/motors/motorPerf';
import { catalogMotorSpec } from '../../services/motors/motorSpec';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { delayString, motorName } from '../../services/motors/motorName';
import { flyGuideBatch } from '../../services/flight/motorGuide';
import { SimCanceledError } from '../../engine/simClient';
import { errorText } from '../../i18n/keyedError';
import { colWithUnit } from '../../i18n/format';
import {
  SIMPLE_GUIDE_MAX,
  simpleIssues,
  simpleMountFit,
  type SimpleIssue,
  type SimpleFigures,
  type SimpleGuide,
  type SimpleGuideRow,
  type SimpleInputs,
  type SimpleLaunch,
} from '../../services/flight/simpleRocket';
import { flySimple } from './simpleFlight';
import { useIsDesktop } from '../common/useMediaQuery';
import { useLatest } from '../common/useLatest';
import { simpleGuideCsv, CSV_MIME } from '../../services/exports/csvExport';
import { download, exportFilename } from '../../services/files/saveFile';

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

  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const request = useLatest();

  const fly = async () => {
    const current = request.claim();
    const signal = request.claimSignal();
    const key = flownKey;
    const asked = flying;
    onGuide(null);
    setRun({ done: 0, total: asked.length });
    const batch = await flyGuideBatch(asked, {
      fly: async (motor: CatalogMotor, delay: number) => {
        const spec = await catalogMotorSpec(motor, delay);
        if (signal.aborted) throw new SimCanceledError();
        const figures = await flySimple(inputs, launch, spec, signal);
        return { spec, figures, optimumDelay: figures.optimumDelay };
      },
      // With a parachute the charge sets the deployment speed, so fly again at it.
      refly: inputs.chute != null,
      row: (motor, key, { spec, figures }, nearest): SimpleGuideRow => ({
        key,
        motor,
        spec: { ...spec, ejectionDelay: nearest ?? spec.ejectionDelay },
        figures,
        nearest,
      }),
      signal,
      onSettled: () => {
        if (current()) setRun((r) => (r ? { ...r, done: r.done + 1 } : r));
      },
      reason: (e) => errorText(e, t),
    });
    if (!current()) return;
    setRun(null);
    onGuide({ key, asked: asked.length, ...batch });
  };

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
        <GuideFilterPanel
          filter={f}
          hidden={showing && !desktop}
          run={run}
          onFly={() => void fly()}
          onCancel={request.cancel}
          flying={flying.length}
          max={SIMPLE_GUIDE_MAX}
          costText={t('simpleTool.guideCost')}
          leftOut={noCurve.length}
          loading={loading}
          failed={!!error}
        />

        {error || loading ? (
          <MotorCatalogGate loading={loading} error={error} onRetry={retry} centered />
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

const ISSUE_KEYS: Record<SimpleIssue, string> = {
  slowExit: 'guide.issue.slowExit',
  mach: 'simpleTool.issueMach',
  stability: 'simpleTool.issueStability',
  deployFast: 'guide.issue.deployFast',
  hardLanding: 'simpleTool.issueHardLanding',
};

const OPTIONAL_COLS: ReadonlySet<string> = new Set(['railStability', 'deployVelocity', 'landingVelocity']);

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
  cards: boolean;
  onClear: () => void;
  onUse: (row: SimpleGuideRow) => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const { settings } = useSettings();
  const limits = {
    railExitMin: settings.simulation.railExitVelocityMin,
    deployWarn: settings.simulation.deploymentSpeedWarn,
  };
  const notes = (r: SimpleGuideRow): string[] => [...simpleIssues(r.figures, limits)].map((k) => t(ISSUE_KEYS[k]));
  const cols = COLS.filter((c) => !OPTIONAL_COLS.has(c.id) || guide.rows.some((r) => c.value(r) != null));

  const [sort, setSort] = useState<GuideSort>({ key: 'apogee', desc: true });
  const rows = useMemo(() => {
    const val = (r: SimpleGuideRow): number | string =>
      sort.key === 'motor' ? motorName(r.motor) : (COLS.find((c) => c.id === sort.key)?.value(r) ?? NaN);
    return sortGuideRows(guide.rows, val, sort.desc);
  }, [guide.rows, sort]);

  const colLabel = (c: GuideCol<SimpleGuideRow>) =>
    c.quantity ? colWithUnit(t(c.label), u.sym(c.quantity)) : t(c.label);
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
