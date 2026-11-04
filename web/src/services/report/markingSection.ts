import type { jsPDF } from 'jspdf';
import { fmtList, fmtNum, partLabel } from '../../i18n/format';
import { hexToRgbTuple } from './layout';
import { drawText, ensure, heading, paragraph, sectionBreak, setStyle, writeRuler, type PdfPage } from './pdfPage';
import { GUIDE_WIDTH_MM, cutPoints, type GuideSlot, type MarkingGuide, type MarkingGuideSet } from './markingGuide';
import { radToDeg } from '../../prefs/units';

const GAP_MM = 10;
const HEADER_MM = 12.5;
const ARROW_MM = 3.5;
const TICK_MM = 2.8;

interface Panel {
  guide: MarkingGuide;
  /** 1-based. */
  part: number;
  parts: number;
  startMm: number;
  lengthMm: number;
}

export function writeMarkingGuideSection(p: PdfPage, set: MarkingGuideSet): void {
  const { t, M, CW } = p;
  sectionBreak(p);
  heading(p, t('report.markingGuide'));
  paragraph(p, t('report.markingGuideHint'));
  if (set.guides.some((g) => g.marks.some((m) => m.slot))) paragraph(p, t('report.markingSlotHint'));

  writeRuler(p);

  const maxStripMm = p.BOTTOM - p.M - HEADER_MM;
  const panels: Panel[] = [];
  for (const guide of set.guides) {
    const cuts = cutPoints(
      guide.marks.map((m) => m.posMm),
      guide.circumferenceMm,
      maxStripMm,
    );
    for (let i = 0; i < cuts.length - 1; i++) {
      panels.push({
        guide,
        part: i + 1,
        parts: cuts.length - 1,
        startMm: cuts[i]!,
        lengthMm: cuts[i + 1]! - cuts[i]!,
      });
    }
  }

  const cols = Math.max(1, Math.floor((CW + GAP_MM) / (GUIDE_WIDTH_MM + GAP_MM)));

  let col = 0;
  let rowH = 0;
  for (const panel of panels) {
    const need = HEADER_MM + panel.lengthMm;
    if (col === 0) {
      ensure(p, need);
      rowH = need;
    } else if (need > rowH) {
      if (p.y + need > p.BOTTOM) {
        p.y += rowH + GAP_MM;
        col = 0;
        ensure(p, need);
      }
      rowH = need;
    }
    drawPanel(p, panel, M + col * (GUIDE_WIDTH_MM + GAP_MM), p.y);
    if (++col === cols) {
      p.y += rowH + GAP_MM;
      col = 0;
      rowH = 0;
    }
  }
  if (col > 0) p.y += rowH + GAP_MM;

  writeOmitted(p, set);
}

// Written out, not built, so i18n/keys.test.ts finds both keys by grep.
const OMIT_KEY = {
  noWrap: 'report.markingOmitted_noWrap',
  noFins: 'report.markingOmitted_noFins',
} as const;

function writeOmitted(p: PdfPage, set: MarkingGuideSet): void {
  const { t } = p;
  for (const reason of ['noWrap', 'noFins'] as const) {
    const parts = set.omitted.filter((o) => o.reason === reason);
    if (!parts.length) continue;
    const names = fmtList(parts.map((o) => partLabel(t, o)));
    ensure(p, 10);
    paragraph(p, t(OMIT_KEY[reason], { names }), 'italic', 120);
  }
}

function drawPanel(p: PdfPage, panel: Panel, x: number, top: number): void {
  const { doc, t, opts } = p;
  const { guide } = panel;
  const W = GUIDE_WIDTH_MM;
  const stroke = hexToRgbTuple(opts.templateStroke);
  const y = top + HEADER_MM;
  const name = partLabel(t, { name: guide.name, type: 'bodytube' });

  setStyle(p, 'bold').setFontSize(8).setTextColor(20);
  drawText(p, t('report.markingStrip', { name, c: fmtNum(guide.circumferenceMm, 1) }), x, top + 3);
  if (panel.parts > 1) {
    setStyle(p, 'normal').setFontSize(7).setTextColor(90);
    drawText(p, t('report.markingPart', { k: panel.part, n: panel.parts }), x, top + 6.8);
  }
  drawForeArrow(p, x, top + HEADER_MM - 2, W, stroke);

  doc.setDrawColor(...stroke).setLineWidth(0.3);
  strokeRect(doc, x, y, W, panel.lengthMm);
  const inset = W / 4;
  for (const tx of [x + inset, x + W - inset]) {
    doc.line(tx, y, tx, y + TICK_MM);
    doc.line(tx, y + panel.lengthMm - TICK_MM, tx, y + panel.lengthMm);
  }

  const end = panel.startMm + panel.lengthMm;
  for (const mark of guide.marks) {
    if (mark.posMm < panel.startMm || mark.posMm >= end) continue;
    const yc = y + (mark.posMm - panel.startMm);
    const label = partLabel(t, mark);

    if (mark.cant === 0) {
      doc.setDrawColor(...stroke).setLineWidth(0.3);
      arrowLine(doc, x, yc, x + W, yc, 0, stroke);
      const slot = mark.slot;
      const half = slot ? slot.widthMm / 2 : 0;
      const text = slot
        ? `${label}  ${t('report.markingSlot', { a: fmtNum(slot.aftMm, 1), b: fmtNum(slot.foreMm, 1) })}`
        : label;
      setStyle(p, 'normal')
        .setFontSize(6.5)
        .setTextColor(...stroke);
      drawText(p, text, x + W / 3, yc - half - 1.2);
      if (slot) drawSlot(doc, slot, x, yc, stroke);
      continue;
    }

    // Canted: pinned at the fin's aft end (desktop paintFinMarkingGuide).
    const half = mark.rootChordMm / 2;
    const yStart = yc - half * Math.sin(mark.cant);
    const yEnd = yStart + W * Math.tan(mark.cant);

    // Drawn before the arrow so the arrow sits on top.
    doc.setLineDashPattern([2.5, 2.5], 0);
    doc
      .setDrawColor(200, 200, 200)
      .setLineWidth(0.3)
      .line(x + W, yStart, x, yStart);
    if (mark.rootChordMm < W) {
      doc.setLineDashPattern([1, 1.5], 0);
      doc
        .setDrawColor(220, 220, 220)
        .setLineWidth(0.2)
        .line(x + mark.rootChordMm, y, x + mark.rootChordMm, y + panel.lengthMm);
    }
    doc.setLineDashPattern([], 0);

    doc.setDrawColor(...stroke).setLineWidth(0.3);
    arrowLine(doc, x, yStart, x + W, yEnd, mark.cant, stroke);

    const cx = x + half - half * (1 - Math.cos(mark.cant));
    const cs = 1;
    doc.line(cx - cs, yc - cs, cx + cs, yc + cs);
    doc.line(cx - cs, yc + cs, cx + cs, yc - cs);

    setStyle(p, 'normal')
      .setFontSize(6.5)
      .setTextColor(...stroke);
    drawText(p, label, x + W / 3, yStart + (W / 3) * Math.tan(mark.cant) - 1.2, {
      angle: radToDeg(-mark.cant),
    });
  }
}

function drawSlot(doc: jsPDF, slot: GuideSlot, x: number, yc: number, stroke: [number, number, number]): void {
  const W = GUIDE_WIDTH_MM;
  const x0 = Math.min(W, Math.max(0, slot.aftMm));
  const x1 = Math.min(W, Math.max(0, slot.foreMm));
  if (!(x1 > x0)) return;
  const top = yc - slot.widthMm / 2;
  const bottom = yc + slot.widthMm / 2;
  doc.setDrawColor(...stroke).setLineWidth(0.2);
  doc.line(x + x0, top, x + x1, top);
  doc.line(x + x0, bottom, x + x1, bottom);
  if (slot.aftMm >= 0) doc.line(x + x0, top, x + x0, bottom);
  if (slot.foreMm <= W) doc.line(x + x1, top, x + x1, bottom);
}

function drawForeArrow(p: PdfPage, x: number, y: number, w: number, stroke: [number, number, number]): void {
  const { doc, t } = p;
  const tip = x + w;
  doc.setDrawColor(...stroke).setLineWidth(0.3);
  doc.line(tip - 20, y, tip - ARROW_MM, y);
  arrowHead(doc, tip, y, 1, 0, stroke);
  setStyle(p, 'bold')
    .setFontSize(6.5)
    .setTextColor(...stroke);
  drawText(p, t('report.markingFore'), tip - 22, y + 1, { align: 'right' });
}

function strokeRect(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.lines(
    [
      [w, 0],
      [0, h],
      [-w, 0],
    ],
    x,
    y,
    [1, 1],
    'S',
    true,
  );
}

function arrowLine(
  doc: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  angle: number,
  color: [number, number, number],
): void {
  const dx = ARROW_MM * Math.cos(angle);
  const dy = ARROW_MM * Math.sin(angle);
  doc.line(x1 + dx, y1 + dy, x2 - dx, y2 - dy);
  arrowHead(doc, x1, y1, -1, angle, color);
  arrowHead(doc, x2, y2, 1, angle, color);
}

function arrowHead(
  doc: jsPDF,
  tipX: number,
  tipY: number,
  dir: number,
  angle: number,
  color: [number, number, number],
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const base: [number, number][] = [
    [-dir * ARROW_MM, -ARROW_MM / 2],
    [-dir * ARROW_MM, ARROW_MM / 2],
  ];
  let px = 0;
  let py = 0;
  const deltas = base.map(([lx, ly]) => {
    const rx = lx * c - ly * s;
    const ry = lx * s + ly * c;
    const d: [number, number] = [rx - px, ry - py];
    px = rx;
    py = ry;
    return d;
  });
  doc.setFillColor(...color);
  doc.lines(deltas, tipX, tipY, [1, 1], 'F', true);
}
