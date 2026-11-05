import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { finPlanformMm, profileMm, type Pt } from './reportGeometry';
import { finMountOf } from '../../tree/finPlanform';
import { profileEnds } from '../../tree/shapeProfile';
import { noseConeAftRadius } from '../../tree/nodeProps';
import { fmtNum, partLabel } from '../../i18n/format';
import { pageFrame, templateFits } from './layout';
import {
  drawText,
  ensure,
  fillPolygon,
  heading,
  paragraph,
  sectionBreak,
  setStyle,
  sub,
  writeRuler,
  type PdfPage,
} from './pdfPage';

export function writeTemplatesSection(
  p: PdfPage,
  tree: RocketTree,
  finSets: ComponentNode[],
  noses: ComponentNode[],
  transitions: ComponentNode[],
): void {
  const { t } = p;
  sectionBreak(p);
  heading(p, t('report.templates'));
  paragraph(p, t('report.templatesHint'));

  writeRuler(p);
  writeFinTemplates(p, tree, finSets);
  for (const n of noses) {
    const prof = profileMm(n, 0, noseConeAftRadius(n));
    if (prof) template(p, partLabel(t, n), prof.pts, { minX: 0, minY: 0, w: prof.w, h: prof.h });
  }
  for (const n of transitions) {
    const { fore, aft } = profileEnds(n);
    const prof = profileMm(n, fore, aft);
    if (prof) template(p, partLabel(t, n), prof.pts, { minX: 0, minY: 0, w: prof.w, h: prof.h });
  }
}

function writeFinTemplates(p: PdfPage, tree: RocketTree, finSets: ComponentNode[]): void {
  for (const n of finSets) {
    const f = finPlanformMm(n, finMountOf(tree, String(n.id)));
    template(p, `${partLabel(p.t, n)} × ${f.count}`, f.pts, outlineBox(f.pts));
  }
}

/** mm. */
interface TemplateBox {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

// A loop, not Math.max(...pts): a huge file-sourced outline would overflow the stack.
function outlineBox(pts: Pt[]): TemplateBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

function template(p: PdfPage, label: string, pts: Pt[], box: TemplateBox): void {
  const { t, M } = p;
  const { minX, minY, w, h } = box;
  const fits = templateFits(w, h, pageFrame(p.PW, p.PH));
  ensure(p, 6 + (fits ? h + 6 : 6));
  sub(p, label, 9);
  if (!fits) {
    setStyle(p, 'italic').setFontSize(8).setTextColor(120);
    drawText(p, t('report.tooLarge', { w: fmtNum(w, 0), h: fmtNum(h, 0) }), M, p.y + 3);
    p.y += 6;
    return;
  }
  fillPolygon(p, pts, M - minX, p.y - minY);
  p.y += h + 6;
}
