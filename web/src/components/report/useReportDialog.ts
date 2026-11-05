import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useWorkspaceStore } from '../../state/store';
import { reportSource } from '../../state/reportSource';
import { useSettings } from '../../state/useSettings';
import { useUnits } from '../../prefs/useUnits';
import { resolveUnitChoice } from '../../prefs/units';
import { assembleReport, type ReportBuild, type ReportModel } from '../../services/report/reportModel';
import { isPlanarFinSet } from '../../tree/tubefins';
import { markingGuides } from '../../services/report/markingGuide';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { stageLabel } from '../../i18n/format';
import { errorText } from '../../i18n/keyedError';
import { useLatest } from '../common/useLatest';
import { walkNodes } from '../../tree/treeWalk';

interface StageSel {
  parts: boolean;
  finTemplates: boolean;
  hasFins: boolean;
  label: string;
}
export interface Sel {
  designReport: boolean;
  includeMotors: boolean;
  updateSimData: boolean;
  showByStage: boolean;
  noseTemplates: boolean;
  transitionTemplates: boolean;
  finMarkingGuide: boolean;
  stages: StageSel[];
}

const assemble = (install?: (built: ReportBuild) => void) =>
  assembleReport(reportSource(useWorkspaceStore.getState()), install);

const hasType = (nodes: ComponentNode[], pred: (t: string) => boolean): boolean =>
  [...walkNodes(nodes)].some((n) => pred(n.type));

// The rebuild is installed in a layout effect: a store write from the initializer would update subscribers mid-render.
export function useAssembledReport(): ReportModel | null {
  const { t } = useTranslation();
  const [initial] = useState<{ model: ReportModel | null; error: string | null; rebuilt: ReportBuild | null }>(() => {
    const { info, rocket } = useWorkspaceStore.getState();
    if (!info || !rocket) return { model: null, error: null, rebuilt: null };
    let rebuilt: ReportBuild | null = null;
    try {
      return { model: assemble((built) => (rebuilt = built)), error: null, rebuilt };
    } catch (e) {
      return { model: null, error: errorText(e, t), rebuilt };
    }
  });

  // Before paint, so the store catches up to the rebuilt handle unseen.
  useLayoutEffect(() => {
    if (initial.rebuilt) useWorkspaceStore.getState().applyBuild(initial.rebuilt.info, initial.rebuilt.handle);
  }, [initial.rebuilt]);
  useEffect(() => {
    if (!initial.error) return;
    // `i18n.t`, not the hook's `t`, which changes identity per language switch.
    useWorkspaceStore.getState().setErr(i18n.t('export.reportFailed', { message: initial.error }));
  }, [initial.error]);

  return initial.model;
}

export function useReportSelection(model: ReportModel | null) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);

  const hasNoses = useMemo(() => hasType(tree.components, (ty) => ty === 'nosecone'), [tree]);
  const hasTransitions = useMemo(() => hasType(tree.components, (ty) => ty === 'transition'), [tree]);
  const hasMarkingGuides = useMemo(() => markingGuides(tree).guides.length > 0, [tree]);

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

  return { sel, patch, patchStage, allOn, setAll, hasNoses, hasTransitions, hasMarkingGuides };
}

export type ReportSelection = ReturnType<typeof useReportSelection>;

export function useReportActions(model: ReportModel | null, sel: Sel | null, onClose: () => void) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const units = useUnits();
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
      const fresh = assemble() ?? model;
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
        { canceled, notice: (message) => useWorkspaceStore.getState().setErr(message) },
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
      write(await import('../../services/report/reportCsv'), assemble() ?? model);
      onClose();
    } catch (e) {
      useWorkspaceStore.getState().setErr(t('export.csvFailed', { message: errorText(e, t) }));
    }
  };
  const savePartsCsv = () =>
    writeCsv((csv, report) => csv.downloadComponentCsv(report, exportUnits, (type) => t(`part.${type}`)));
  const saveCsv = () => writeCsv((csv, report) => csv.downloadDesignCsv(report, exportUnits));

  return { busy, close, save, saveCsv, savePartsCsv };
}
