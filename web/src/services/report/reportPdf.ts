import { saveBlob, exportFilename } from '../files/saveFile';
import type { RocketTree } from '../../engine/openRocketEngine';
import { walkNodes } from '../../tree/treeWalk';
import { launcherKind, withLauncher } from '../design/launcher';
import type { ReportModel } from './reportModel';
import type { UnitSelection } from '../../prefs/units';
import { finSetsOf } from './layout';
import type { ReportOptions } from './options';
import { createPdfPage, heading, type PdfPage, type T } from './pdfPage';
import { loadReportFonts, registerReportFonts, type ReportFontFiles } from './reportFonts';
import { writeDesignSection } from './designSection';
import { writeMotorsSection } from './motorsSection';
import { writeChargesSection } from './chargesSection';
import { writePartsSection } from './partsSection';
import { writeTemplatesSection } from './templatesSection';
import { markingGuides } from './markingGuide';
import { writeMarkingGuideSection } from './markingSection';

export type * from './options';
export * from './layout';

export interface ReportPdfHooks {
  fetch?: (url: string) => Promise<Response>;
  notice?: (message: string) => void;
  canceled?: () => boolean;
}

export async function downloadReportPdf(
  model: ReportModel,
  tree: RocketTree,
  t: T,
  opts: ReportOptions,
  units: UnitSelection,
  hooks: ReportPdfHooks = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const draw = (fonts: ReportFontFiles): PdfPage => {
    const doc = new jsPDF({ unit: 'mm', format: opts.paper, orientation: opts.orientation });
    const page = createPdfPage(doc, withLauncher(t, launcherKind(tree)), opts, units, registerReportFonts(doc, fonts));
    writeReport(page, model, tree, t, opts);
    return page;
  };

  let page = draw({});
  if (page.needs.size) {
    const fonts = await loadReportFonts(page.needs, hooks.fetch);
    if (hooks.canceled?.()) return;
    if (Object.keys(fonts).length) page = draw(fonts);
  }
  if (page.lost) hooks.notice?.(t('report.fontFallback'));
  else if (page.uncovered) hooks.notice?.(t('report.scriptUncovered'));
  // saveBlob, not doc.save(): its `<a download>` click does nothing in an iOS PWA.
  await saveBlob(page.doc.output('blob'), exportFilename([model.name, 'report'], 'pdf'));
}

function writeReport(page: PdfPage, model: ReportModel, tree: RocketTree, t: T, opts: ReportOptions): void {
  if (opts.designReport) writeDesignSection(page, model, tree);

  if (opts.includeMotors && model.configs.some((c) => c.motors.length)) writeMotorsSection(page, model);

  if (model.charges?.length || model.bays?.length) writeChargesSection(page, model.charges ?? [], model.bays);

  const partsStages = model.partsByStage.filter((_, i) => opts.stages[i]?.parts);
  if (partsStages.length) writePartsSection(page, partsStages);

  const finStages = model.stages.filter((_, i) => opts.stages[i]?.finTemplates);
  const finSets = finStages.flatMap((st) => finSetsOf(st));
  const allNodes = [...walkNodes(tree.components)];
  const noses = opts.noseTemplates ? allNodes.filter((n) => n.type === 'nosecone') : [];
  const transitions = opts.transitionTemplates ? allNodes.filter((n) => n.type === 'transition') : [];
  if (finSets.length || noses.length || transitions.length) {
    writeTemplatesSection(page, tree, finSets, noses, transitions);
  }

  if (opts.finMarkingGuide) {
    const guides = markingGuides(tree);
    if (guides.guides.length) writeMarkingGuideSection(page, guides);
  }

  if (!page.started) heading(page, t('report.title')); // a page-less jsPDF doc is a corrupt file
}
