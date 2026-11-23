import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Dialog } from '../common/Dialog';
import { NumberInput } from '../common/NumberInput';
import { smallButton } from '../common/smallButton';
import { useUnits, type Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import { useWorkspaceStore, isOptimizerStale, selectDesignName, selectOptimizerFor } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { MAX_OPT_POINTS, optimumOf, type OptEval, type Optimization } from '../../state/optimizerSlice';
import { optimizableParams, type OptParam } from '../../services/flight/optimizer/optParams';
import {
  OPT_AIMS,
  OPT_GOALS,
  type OptAim,
  type OptGoal,
  type StabilityUnit,
} from '../../services/flight/optimizer/optGoals';
import { STEP_SIZE_LIMIT } from '../../services/flight/optimizer/optSearch';
import { colWithUnit, fmtNum } from '../../i18n/format';
import { optimizerCsv, CSV_MIME } from '../../services/exports/csvExport';
import { download, exportFilename } from '../../services/files/saveFile';
import {
  numCls,
  paramName,
  paramUnit,
  show,
  stabilityFigureUnit,
  unitOf,
  useNodeNames,
  type FigureUnit,
} from './optimizerFigures';
import { OptParamPicker, type ParamPick } from './OptParamPicker';
import { useSimConfig } from './useSimConfig';

const GOAL_LABEL: Record<OptGoal, string> = {
  apogee: 'optimize.goal.apogee',
  maxVelocity: 'optimize.goal.maxVelocity',
  maxAcceleration: 'optimize.goal.maxAcceleration',
  stability: 'optimize.goal.stability',
  groundHitVelocity: 'optimize.goal.groundHitVelocity',
  deploymentVelocity: 'optimize.goal.deploymentVelocity',
  landingDistance: 'optimize.goal.landingDistance',
  flightTime: 'optimize.goal.flightTime',
};

const AIM_LABEL: Record<OptAim, string> = {
  maximize: 'optimize.aim.maximize',
  minimize: 'optimize.aim.minimize',
  seek: 'optimize.aim.seek',
};

const GOAL_QUANTITY: Record<Exclude<OptGoal, 'stability' | 'flightTime'>, Quantity> = {
  apogee: 'distance',
  maxVelocity: 'velocity',
  maxAcceleration: 'acceleration',
  groundHitVelocity: 'velocity',
  deploymentVelocity: 'velocity',
  landingDistance: 'distance',
};

function goalUnit(u: Units, goal: OptGoal, unit: StabilityUnit, t: TFunction): FigureUnit {
  if (goal === 'stability') return stabilityFigureUnit(u, unit, t);
  if (goal === 'flightTime') return unitOf(u, undefined, t('units.second'), 1);
  return unitOf(u, GOAL_QUANTITY[goal], '');
}

const headed = (title: string, sym: string | undefined) => (sym ? colWithUnit(title, sym) : title);

const selectCls = 'rounded-md bg-raised px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10';

export function OptimizerDialog({ simId, onClose }: { simId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { tree, sim, config } = useSimConfig(simId);
  const params = useMemo(() => (config ? optimizableParams(tree, config) : []), [tree, config]);

  return (
    <Dialog id="optimizer" title={t('optimize.title')} onClose={onClose} size="6xl" layout="fill" height={760}>
      {!sim || !params.length ? (
        <div className="grid flex-1 place-items-center p-6 text-sm text-ink-faint">{t('optimize.noParams')}</div>
      ) : (
        <OptimizerBody simId={simId} params={params} />
      )}
    </Dialog>
  );
}

function OptimizerBody({ simId, params }: { simId: string; params: OptParam[] }) {
  const { t } = useTranslation();
  const u = useUnits();
  const tree = useWorkspaceStore((s) => s.tree);

  const run = useWorkspaceStore((s) => s.optimizerRun);
  const result = useWorkspaceStore((s) => selectOptimizerFor(s, simId));
  const runOptimizer = useWorkspaceStore((s) => s.runOptimizer);
  const cancelOptimizer = useWorkspaceStore((s) => s.cancelOptimizer);
  const busy = run !== null;

  const [goal, setGoal] = useState<OptGoal>('apogee');
  const [aim, setAim] = useState<OptAim>('maximize');
  const [target, setTarget] = useState<number>(0);
  const [unit, setUnit] = useState<StabilityUnit>('calibers');
  // Desktop's defaults: a minimum of one caliber on, a maximum of five off.
  const [minOn, setMinOn] = useState(true);
  const [maxOn, setMaxOn] = useState(false);
  const [limitMin, setLimitMin] = useState(1);
  const [limitMax, setLimitMax] = useState(5);
  const [allPicks, setPicks] = useState<ParamPick[]>([]);

  // A part deleted while the dialog is open takes its parameters out of the list.
  const byId = useMemo(() => new Map(params.map((p) => [p.id, p])), [params]);
  const picks = allPicks.filter((pick) => byId.has(pick.id));
  const chosen: OptParam[] = picks.map((pick) => ({
    ...(byId.get(pick.id) as OptParam),
    min: pick.min,
    max: pick.max,
  }));
  const emptyRange = chosen.some((p) => !(p.max > p.min));
  const badLimits = minOn && maxOn && !(limitMax > limitMin);
  const stabilityGoalUnit = stabilityFigureUnit(u, unit, t);
  const gc = goalUnit(u, goal, unit, t);

  const switchUnit = (next: StabilityUnit) => {
    if (next === unit) return;
    // Calibers and a length do not convert without the design's diameter, so the limits start over.
    setUnit(next);
    setLimitMin(next === 'length' ? 0 : 1);
    setLimitMax(next === 'length' ? 0.5 : 5);
  };

  const start = () =>
    fireAction(
      runOptimizer(simId, {
        goal,
        aim,
        target,
        unit,
        limits: minOn || maxOn ? { min: minOn ? limitMin : null, max: maxOn ? limitMax : null, unit } : null,
        params: chosen,
      }),
    );

  const blocker = !chosen.length
    ? t('optimize.pickParams')
    : emptyRange
      ? t('optimize.emptyRange')
      : badLimits
        ? t('optimize.badLimits')
        : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-xs text-ink-soft">
      <p className="text-ink-faint">{t('optimize.hint')}</p>

      {/* From md up the two columns fill the dialog's height, each scrolling its own long list. */}
      <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-2">
        <OptParamPicker tree={tree} params={params} picks={picks} setPicks={setPicks} disabled={busy} />

        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <fieldset disabled={busy} className="flex flex-wrap items-center gap-2">
            <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {t('optimize.goalHeading')}
            </legend>
            <select
              value={aim}
              onChange={(e) => setAim(e.target.value as OptAim)}
              aria-label={t('optimize.aimLabel')}
              className={selectCls}
            >
              {OPT_AIMS.map((a) => (
                <option key={a} value={a}>
                  {t(AIM_LABEL[a])}
                </option>
              ))}
            </select>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as OptGoal)}
              aria-label={t('optimize.goalLabel')}
              className={selectCls}
            >
              {OPT_GOALS.map((g) => (
                <option key={g} value={g}>
                  {t(GOAL_LABEL[g])}
                </option>
              ))}
            </select>
            {aim === 'seek' && (
              <span className="flex items-center gap-1">
                <NumberInput
                  value={gc.toUi(target)}
                  onChange={(v) => setTarget(v == null ? 0 : gc.toSi(v))}
                  ariaLabel={t('optimize.target')}
                  className={numCls}
                />
                <span className="text-[10px] text-ink-faint">{gc.sym}</span>
              </span>
            )}
          </fieldset>

          <fieldset disabled={busy} className="flex flex-wrap items-center gap-3">
            <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {t('optimize.limitsHeading')}
            </legend>
            {(
              [
                ['min', minOn, setMinOn, limitMin, setLimitMin, t('optimize.minStability')],
                ['max', maxOn, setMaxOn, limitMax, setLimitMax, t('optimize.maxStability')],
              ] as const
            ).map(([key, on, setOn, value, setValue, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setOn(e.target.checked)}
                  className="accent-accent-500"
                />
                <span>{label}</span>
                <NumberInput
                  value={stabilityGoalUnit.toUi(value)}
                  onChange={(v) => setValue(v == null ? 0 : stabilityGoalUnit.toSi(v))}
                  disabled={!on}
                  ariaLabel={label}
                  className={numCls}
                />
                <span className="text-[10px] text-ink-faint">{stabilityGoalUnit.sym}</span>
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <span className="text-ink-faint">{t('optimize.stabilityUnit')}</span>
              <select value={unit} onChange={(e) => switchUnit(e.target.value as StabilityUnit)} className={selectCls}>
                <option value="calibers">{t('optimize.unitCalibers')}</option>
                <option value="length">{t('optimize.unitLength')}</option>
              </select>
            </label>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            {busy ? (
              <>
                <button onClick={cancelOptimizer} className={smallButton('sm', 'ink')}>
                  {t('common.cancel')}
                </button>
                <span className="tabular-nums text-ink-muted">
                  {t('optimize.progress', { count: run.done, max: MAX_OPT_POINTS })}
                </span>
              </>
            ) : (
              <button
                onClick={start}
                disabled={blocker !== null}
                title={blocker ?? undefined}
                className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('optimize.run')}
              </button>
            )}
            <span className="text-ink-faint">
              {blocker ?? (chosen.length === 1 ? t('optimize.method1') : t('optimize.methodN'))}
            </span>
          </div>

          {result ? (
            <ResultPanel result={result} busy={busy} />
          ) : (
            <div className="grid min-h-32 flex-1 place-items-center rounded-md p-4 text-center text-ink-faint ring-1 ring-inset ring-line/10">
              {t('optimize.noResults')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result, busy }: { result: Optimization; busy: boolean }) {
  const { t } = useTranslation();
  const u = useUnits();
  // Named from the design it ran on, which may since have changed.
  const nodeNames = useNodeNames(result.tree, t);
  const stale = useWorkspaceStore((s) => isOptimizerStale(s, result));
  const designName = useWorkspaceStore(selectDesignName);
  const applyOptimum = useWorkspaceStore((s) => s.applyOptimum);
  const clearOptimizer = useWorkspaceStore((s) => s.clearOptimizer);
  const { setup } = result;
  const colUnits = setup.params.map((p) => paramUnit(u, p, t));
  const sc = stabilityFigureUnit(u, setup.unit, t);
  const gc = goalUnit(u, setup.goal, setup.unit, t);
  const best = optimumOf(result);
  const failed = result.evaluations.filter((e) => e.failed).length;
  const feasibleAny = result.evaluations.some((e) => e.feasible);
  const goalTitle = t(GOAL_LABEL[setup.goal]);

  const heads = [
    ...setup.params.map((p, i) => ({ title: paramName(p, nodeNames, t), unit: colUnits[i]!.sym || undefined })),
    { title: t('optimize.colStability'), unit: sc.sym },
    { title: goalTitle, unit: gc.sym || undefined },
  ];

  const exportCsv = () => {
    const ui = (c: (typeof colUnits)[number], v: number) => (Number.isFinite(v) ? c.toUi(v) : null);
    const rows = result.evaluations.map((e: OptEval) => [
      ...e.values.map((v, i) => ui(colUnits[i]!, v)),
      ui(sc, e.stability),
      e.feasible ? ui(gc, e.figure) : null,
    ]);
    download(exportFilename([designName, 'optimization'], 'csv'), optimizerCsv(heads, rows), CSV_MIME);
  };

  const outcome =
    result.outcome === 'running'
      ? t('optimize.step', { step: fmtNum(result.step * 100, 1) })
      : result.outcome === 'converged'
        ? t('optimize.converged', { limit: fmtNum(STEP_SIZE_LIMIT * 100, 1) })
        : result.outcome === 'limit'
          ? t('optimize.limit', { max: MAX_OPT_POINTS })
          : t('optimize.canceled');

  const th = 'px-2 py-1.5 text-right font-medium';
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 border-t border-line/10 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('optimize.pathHeading')}
        </h3>
        <button
          onClick={() => applyOptimum()}
          disabled={busy || stale || !best}
          title={stale ? t('optimize.applyStale') : t('optimize.applyHint')}
          className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('optimize.apply')}
        </button>
        <button
          onClick={exportCsv}
          disabled={!result.evaluations.length}
          title={t('optimize.exportCsv')}
          className={smallButton('sm', 'soft')}
        >
          <span aria-hidden>⬇ CSV</span>
          <span className="sr-only">{t('optimize.exportCsv')}</span>
        </button>
        <button onClick={clearOptimizer} disabled={busy} className={smallButton('sm', 'soft')}>
          {t('optimize.clear')}
        </button>
      </div>
      <p className="text-ink-muted">
        {outcome} {t('optimize.tried', { count: result.evaluations.length })}
        {failed > 0 && <> {t('optimize.failed', { count: failed })}</>}
      </p>
      {!busy && !feasibleAny && <p className="text-warn-400">{t('optimize.noneWithin')}</p>}
      {stale && <p className="text-warn-400">{t('optimize.stale')}</p>}
      <div className="min-h-32 flex-1 overflow-auto">
        <table className="w-full tabular-nums">
          <thead className="text-ink-muted">
            <tr>
              <th scope="col" className={`${th} text-left`}>
                {t('optimize.colStep')}
              </th>
              {heads.map((h) => (
                <th key={h.title} scope="col" className={th}>
                  {headed(h.title, h.unit)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.path.map((e, i) => {
              const last = i === result.path.length - 1;
              return (
                <tr key={i} className={`border-t border-line/5 ${last ? 'font-semibold text-ink-strong' : ''}`}>
                  <th scope="row" className="px-2 py-1 text-left font-normal">
                    {i === 0 ? t('optimize.start') : i}
                  </th>
                  {e.values.map((v, j) => (
                    <td key={j} className="px-2 py-1 text-right">
                      {show(colUnits[j]!, v)}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right">{show(sc, e.stability)}</td>
                  <td className="px-2 py-1 text-right">
                    {e.feasible ? show(gc, e.figure) : <span className="text-warn-400">{t('optimize.outside')}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
