import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useWorkspaceStore } from '../../state/store';
import { useSettings } from '../../state/SettingsProvider';
import { useUnits } from '../../prefs/useUnits';
import { resolveUnitChoice, UNIT_CHOICES, type UnitChoice } from '../../prefs/units';
import { Dialog } from '../common/Dialog';
import { DEFAULT_REPORT } from '../../services/storage/settings';
import { assembleReport, type ReportBuild, type ReportModel } from '../../services/report/reportModel';
import { isPlanarFinSet } from '../../tree/tubefins';
import { markingGuides } from '../../services/report/markingGuide';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { stageLabel } from '../../i18n/format';
import { errorText } from '../../i18n/keyedError';
import { Check } from '../common/Check';
import { ColorInput } from '../common/ColorInput';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { useLatest } from '../common/useLatest';
import { walkNodes } from '../../tree/treeWalk';

interface StageSel {
  parts: boolean;
  finTemplates: boolean;
  hasFins: boolean;
  label: string;
}
interface Sel {
  designReport: boolean;
  includeMotors: boolean;
  updateSimData: boolean;
  showByStage: boolean;
  noseTemplates: boolean;
  transitionTemplates: boolean;
  finMarkingGuide: boolean;
  stages: StageSel[];
}

const hasType = (nodes: ComponentNode[], pred: (t: string) => boolean): boolean =>
  [...walkNodes(nodes)].some((n) => pred(n.type));

// The rebuild is installed in a layout effect: a store write from the initializer would update subscribers mid-render.
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const units = useUnits();
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const exportUnits = resolveUnitChoice(settings.report.units, units.all);
  const tree = useWorkspaceStore((s) => s.tree);
  const runSim = useWorkspaceStore((s) => s.runSim);

  const latest = useLatest();
  const running = useRef(false);
  const close = () => {
    latest.claim();
    if (running.current) useWorkspaceStore.getState().cancelRun();
    onClose();
  };

  const hasNoses = useMemo(() => hasType(tree.components, (ty) => ty === 'nosecone'), [tree]);
  const hasTransitions = useMemo(() => hasType(tree.components, (ty) => ty === 'transition'), [tree]);
  const hasMarkingGuides = useMemo(() => markingGuides(tree).guides.length > 0, [tree]);

  const [initial] = useState<{ model: ReportModel | null; error: string | null; rebuilt: ReportBuild | null }>(() => {
    const { info, rocket } = useWorkspaceStore.getState();
    if (!info || !rocket) return { model: null, error: null, rebuilt: null };
    let rebuilt: ReportBuild | null = null;
    try {
      return { model: assembleReport((built) => (rebuilt = built)), error: null, rebuilt };
    } catch (e) {
      return { model: null, error: errorText(e, t), rebuilt };
    }
  });
  const model = initial.model;

  // Before paint, so the store catches up to the rebuilt handle unseen.
  useLayoutEffect(() => {
    if (initial.rebuilt) useWorkspaceStore.getState().applyBuild(initial.rebuilt.info, initial.rebuilt.handle);
  }, [initial.rebuilt]);
  useEffect(() => {
    if (!initial.error) return;
    // `i18n.t`, not the hook's `t`, which changes identity per language switch.
    useWorkspaceStore.getState().setErr(i18n.t('export.reportFailed', { message: initial.error }));
  }, [initial.error]);

  const [sel, setSel] = useState<Sel | null>(() =>
    model
      ? {
          designReport: true,
          includeMotors: true,
          updateSimData: true,
          showByStage: model.stages.length > 1,
          noseTemplates: hasNoses,
          transitionTemplates: hasTransitions,
          finMarkingGuide: hasMarkingGuides,
          stages: model.stages.map((st, i) => ({
            parts: true,
            finTemplates: true,
            hasFins: hasType(st.children ?? [], isPlanarFinSet),
            label: stageLabel(t, i, st.name),
          })),
        }
      : null,
  );

  const patch = (p: Partial<Sel>) => setSel((s) => (s ? { ...s, ...p } : s));
  const patchStage = (i: number, p: Partial<StageSel>) =>
    setSel((s) => (s ? { ...s, stages: s.stages.map((st, j) => (j === i ? { ...st, ...p } : st)) } : s));

  const allOn =
    !!sel &&
    sel.designReport &&
    sel.includeMotors &&
    sel.noseTemplates === hasNoses &&
    sel.transitionTemplates === hasTransitions &&
    sel.finMarkingGuide === hasMarkingGuides &&
    sel.stages.every((st) => st.parts && (!st.hasFins || st.finTemplates));
  const setAll = (on: boolean) =>
    setSel((s) =>
      s
        ? {
            ...s,
            designReport: on,
            includeMotors: on,
            noseTemplates: on && hasNoses,
            transitionTemplates: on && hasTransitions,
            finMarkingGuide: on && hasMarkingGuides,
            stages: s.stages.map((st) => ({ ...st, parts: on, finTemplates: on && st.hasFins })),
          }
        : s,
    );

  const save = async () => {
    if (!sel || !model) return;
    const live = latest.observe();
    const canceled = () => !live();
    setBusy(true);
    try {
      if (sel.updateSimData) {
        // runSim switches view, tab and design pane on completion; restore them.
        const { view: prevView, tab: prevTab, designPane: prevPane } = useWorkspaceStore.getState();
        try {
          running.current = true;
          const outcome = await runSim();
          if (outcome === 'dropped') useWorkspaceStore.getState().setErr(t('export.simDropped'));
          if (outcome !== 'landed') return;
        } catch (e) {
          useWorkspaceStore.getState().setErr(t('export.simFailed', { message: errorText(e, t) }));
          return;
        } finally {
          running.current = false;
          useWorkspaceStore.setState({ view: prevView, tab: prevTab, designPane: prevPane });
        }
      }
      if (canceled()) return;
      const fresh = assembleReport() ?? model;
      // jsPDF is loaded here so the last cancel check comes after every wait.
      const [{ downloadReportPdf }] = await Promise.all([import('../../services/report/reportPdf'), import('jspdf')]);
      if (canceled()) return;
      await downloadReportPdf(
        fresh,
        tree,
        t,
        {
          designReport: sel.designReport,
          includeMotors: sel.includeMotors,
          showByStage: sel.showByStage,
          noseTemplates: sel.noseTemplates,
          transitionTemplates: sel.transitionTemplates,
          finMarkingGuide: sel.finMarkingGuide,
          stages: sel.stages.map((st) => ({ parts: st.parts, finTemplates: st.finTemplates })),
          paper: settings.report.paper,
          orientation: settings.report.orientation,
          templateFill: settings.report.templateFill,
          templateStroke: settings.report.templateStroke,
        },
        exportUnits,
        { canceled },
      );
      onClose();
    } catch (e) {
      if (canceled()) return;
      useWorkspaceStore.getState().setErr(t('export.pdfFailed', { message: errorText(e, t) }));
    } finally {
      setBusy(false);
    }
  };

  const writeCsv = async (
    write: (csv: typeof import('../../services/report/reportCsv'), report: NonNullable<typeof model>) => void,
  ) => {
    if (!model) return;
    try {
      write(await import('../../services/report/reportCsv'), assembleReport() ?? model);
      onClose();
    } catch (e) {
      useWorkspaceStore.getState().setErr(t('export.csvFailed', { message: errorText(e, t) }));
    }
  };
  const savePartsCsv = () =>
    writeCsv((csv, report) => csv.downloadComponentCsv(report, exportUnits, (type) => t(`part.${type}`)));
  const saveCsv = () => writeCsv((csv, report) => csv.downloadDesignCsv(report, exportUnits));

  const actionRow = (
    <div className="flex items-center justify-between gap-2 border-t border-line/10 p-4">
      <DialogButton onClick={() => setShowSettings(true)}>{t('export.settings')}</DialogButton>
      <div className="flex gap-2">
        <DialogButton onClick={close}>{t('common.cancel')}</DialogButton>
        <DialogButton onClick={saveCsv} disabled={busy}>
          {t('export.saveCsv')}
        </DialogButton>
        <DialogButton onClick={savePartsCsv} disabled={busy}>
          {t('export.savePartsCsv')}
        </DialogButton>
        <DialogButton onClick={save} disabled={busy} variant="primary">
          {busy ? t('common.loading') : t('export.savePdf')}
        </DialogButton>
      </div>
    </div>
  );

  const setReport = (patch: Partial<typeof settings.report>) => update({ report: { ...settings.report, ...patch } });
  const select = 'rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10';
  const check = 'accent-accent-500';
  const fillId = useId();
  const row = 'flex items-center gap-2 py-0.5 text-sm text-ink';

  return (
    <>
      <Dialog
        id="reportExport"
        title={t('export.title')}
        onClose={close}
        size="md"
        dismissible={!busy}
        footer={sel && model ? actionRow : undefined}
      >
        {sel && model ? (
          <div className="p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-ink-muted">{t('export.select')}</p>
            <div className="rounded-lg bg-raised/50 p-2 ring-1 ring-line/5">
              <Check
                className={`${row} font-semibold text-accent-300`}
                checked={allOn}
                onChange={setAll}
                label={model.name}
              />
              {sel.stages.map((st, i) => (
                <div key={i} className="pl-4">
                  <div className={`${row} text-ink-soft`}>{st.label}</div>
                  <Check
                    className={`${row} pl-4`}
                    checked={st.parts}
                    onChange={(v) => patchStage(i, { parts: v })}
                    label={t('report.partsDetail')}
                  />
                  {st.hasFins && (
                    <Check
                      className={`${row} pl-4`}
                      checked={st.finTemplates}
                      onChange={(v) => patchStage(i, { finTemplates: v })}
                      label={t('export.finTemplates')}
                    />
                  )}
                </div>
              ))}
              <Check
                className={`${row} pl-4`}
                checked={sel.designReport}
                onChange={(v) => patch({ designReport: v })}
                label={t('export.designReport')}
              />
              <Check
                className={`${row} pl-4`}
                disabled={!hasNoses}
                checked={sel.noseTemplates}
                onChange={(v) => patch({ noseTemplates: v })}
                label={t('export.noseTemplates')}
              />
              <Check
                className={`${row} pl-4`}
                disabled={!hasTransitions}
                checked={sel.transitionTemplates}
                onChange={(v) => patch({ transitionTemplates: v })}
                label={t('export.transitionTemplates')}
              />
              <Check
                className={`${row} pl-4`}
                disabled={!hasMarkingGuides}
                checked={sel.finMarkingGuide}
                onChange={(v) => patch({ finMarkingGuide: v })}
                label={t('export.finMarkingGuide')}
              />
            </div>

            <div className="mt-3 space-y-1">
              <Check
                className={row}
                checked={sel.includeMotors}
                onChange={(v) => patch({ includeMotors: v })}
                label={t('export.includeMotors')}
              />
              <Check
                className={row}
                checked={sel.updateSimData}
                onChange={(v) => patch({ updateSimData: v })}
                label={t('export.updateSim')}
              />
              <Check
                className={row}
                checked={sel.showByStage}
                onChange={(v) => patch({ showByStage: v })}
                label={t('export.showByStage')}
              />
              <label className="flex items-center justify-between gap-3 pt-1 text-sm text-ink">
                <span>{t('export.units')}</span>
                <select
                  aria-label={t('export.units')}
                  value={settings.report.units}
                  onChange={(e) => setReport({ units: e.target.value as UnitChoice })}
                  className="rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
                >
                  {UNIT_CHOICES.map((c) => (
                    <option key={c} value={c}>
                      {t(`export.units_${c}`)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] leading-snug text-ink-faint">{t('export.unitsNote')}</p>
            </div>
          </div>
        ) : (
          <p className="p-6 text-sm text-ink-faint">{t('report.noDesign')}</p>
        )}
      </Dialog>

      {showSettings && (
        <Dialog
          id="reportPrintSettings"
          title={t('export.printSettings')}
          onClose={() => setShowSettings(false)}
          layer="over"
          size="sm"
          layout="pad"
          expandable={false}
          fullBleed={false}
        >
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-sm text-ink-soft">
                <label htmlFor={fillId}>{t('export.fill')}</label>
                <span className="flex items-center gap-2">
                  <input
                    id={fillId}
                    type="checkbox"
                    className={check}
                    checked={!!settings.report.templateFill}
                    onChange={(e) =>
                      update({
                        report: {
                          ...settings.report,
                          templateFill: e.target.checked ? settings.report.templateFill || '#e5e7eb' : '',
                        },
                      })
                    }
                  />
                  <ColorInput
                    disabled={!settings.report.templateFill}
                    value={settings.report.templateFill || '#e5e7eb'}
                    onCommit={(c) => setReport({ templateFill: c })}
                    ariaLabel={t('export.fillColor')}
                    className="h-7 w-10 cursor-pointer rounded-md border border-line/10 bg-raised p-0.5 disabled:opacity-40"
                  />
                </span>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-ink-soft">
                {t('export.border')}
                <ColorInput
                  value={settings.report.templateStroke}
                  onCommit={(c) => setReport({ templateStroke: c })}
                  className="h-7 w-10 cursor-pointer rounded-md border border-line/10 bg-raised p-0.5"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-ink-soft">
                {t('export.paper')}
                <select
                  value={settings.report.paper}
                  onChange={(e) => setReport({ paper: e.target.value as 'letter' | 'a4' })}
                  className={select}
                >
                  <option value="letter">{t('export.paperLetter')}</option>
                  <option value="a4">{t('export.paperA4')}</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-ink-soft">
                {t('export.orientation')}
                <select
                  value={settings.report.orientation}
                  onChange={(e) => setReport({ orientation: e.target.value as 'portrait' | 'landscape' })}
                  className={select}
                >
                  <option value="portrait">{t('export.portrait')}</option>
                  <option value="landscape">{t('export.landscape')}</option>
                </select>
              </label>
            </div>
            <DialogActions>
              <DialogButton onClick={() => update({ report: { ...DEFAULT_REPORT, units: settings.report.units } })}>
                {t('export.reset')}
              </DialogButton>
              <DialogButton variant="primary" onClick={() => setShowSettings(false)}>
                {t('common.close')}
              </DialogButton>
            </DialogActions>
          </>
        </Dialog>
      )}
    </>
  );
}
