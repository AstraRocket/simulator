// cspell:ignore cmap -- jsPDF's name for a TrueType font's character map
import { must } from '../app/must';
import type { jsPDF } from 'jspdf';
import type { StaticInfo } from '../../engine/openRocketEngine';
import type { Pt } from './reportGeometry';
import { fmtNum, fmtPercent, fmtSig, ladderDigits } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { siToUi, type Quantity, type UnitSelection } from '../../prefs/units';
import { hexToRgbTuple, pageFrame } from './layout';
import type { ReportOptions } from './options';
import { staticInfoRows } from './designInfo';
import { type StatKey } from './designInfo';
import { scriptOf, toWinAnsi, type ReportFamilies, type UnicodeScript } from './reportFonts';

// Use setStyle/drawText, never doc.setFont/doc.text, or non-WinAnsi text bypasses the Unicode font.

export type T = (key: string, opts?: Record<string, unknown>) => string;

export type FontStyle = 'normal' | 'bold' | 'italic';

export interface Col {
  title: string;
  w: number;
  align?: 'left' | 'right';
}

export interface PdfPage {
  doc: jsPDF;
  t: T;
  units: UnitSelection;
  opts: ReportOptions;
  /** PW through y are mm. */
  PW: number;
  PH: number;
  M: number;
  CW: number;
  BOTTOM: number;
  y: number;
  started: boolean;
  style: FontStyle;
  fonts: ReportFamilies;
  needs: Set<UnicodeScript>;
  lost: boolean;
  uncovered: boolean;
}

export function createPdfPage(
  doc: jsPDF,
  t: T,
  opts: ReportOptions,
  units: UnitSelection,
  fonts: ReportFamilies = {},
): PdfPage {
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const { margin: M, contentWidth: CW, bottom: BOTTOM } = pageFrame(PW, PH);
  return {
    doc,
    t,
    units,
    opts,
    PW,
    PH,
    M,
    CW,
    BOTTOM,
    y: M,
    started: false,
    style: 'normal',
    fonts,
    needs: new Set(),
    lost: false,
    uncovered: false,
  };
}

export function setStyle(p: PdfPage, style: FontStyle): jsPDF {
  p.style = style;
  return p.doc.setFont('helvetica', style);
}

function unicodeFamily(p: PdfPage, s: string): string | null {
  const script = scriptOf(s);
  if (!script) return null;
  p.needs.add(script);
  return p.fonts[script] ?? null;
}

function winAnsi(p: PdfPage, s: string): string {
  const out = toWinAnsi(s);
  if (out.lost) p.lost = true;
  return out.text;
}

function codeMapOf(doc: jsPDF): Record<number, number> | null {
  const font = doc.getFont() as { metadata?: { cmap?: { unicode?: { codeMap?: Record<number, number> } } } };
  return font.metadata?.cmap?.unicode?.codeMap ?? null;
}

function covered(p: PdfPage, s: string): string {
  const map = codeMapOf(p.doc);
  if (!map) return s;
  let out = '';
  for (const ch of s) {
    const c = must(ch.codePointAt(0), 'code point');
    if (c < 0x20 || (c <= 0xffff && map[c])) {
      out += ch;
      continue;
    }
    out += '?';
    p.uncovered = true;
  }
  return out;
}

// The Unicode families have no italic face, so italic falls back to upright.
function inFont<R>(p: PdfPage, s: string, draw: (fit: (s: string) => string) => R): R {
  const family = unicodeFamily(p, s);
  if (!family) return draw((x) => winAnsi(p, x));
  p.doc.setFont(family, p.style === 'bold' ? 'bold' : 'normal');
  try {
    return draw((x) => covered(p, x));
  } finally {
    p.doc.setFont('helvetica', p.style);
  }
}

export function drawText(
  p: PdfPage,
  s: string | string[],
  x: number,
  y: number,
  opts?: Parameters<jsPDF['text']>[3],
): void {
  inFont(p, Array.isArray(s) ? s.join(' ') : s, (fit) => {
    const run = Array.isArray(s) ? s.map(fit) : fit(s);
    if (opts) p.doc.text(run, x, y, opts);
    else p.doc.text(run, x, y);
  });
}

function splitText(p: PdfPage, s: string, width: number): string[] {
  return inFont(p, s, (fit) => p.doc.splitTextToSize(fit(s), width) as string[]);
}

/** `h` is mm. */
export function ensure(p: PdfPage, h: number): void {
  if (p.y + h > p.BOTTOM) {
    p.doc.addPage();
    p.y = p.M;
  }
}

export function sectionBreak(p: PdfPage): void {
  if (p.started) {
    p.doc.addPage();
    p.y = p.M;
  }
  p.started = true;
}

export function heading(p: PdfPage, title: string): void {
  const { doc, M, CW } = p;
  setStyle(p, 'bold').setFontSize(15).setTextColor(20);
  drawText(p, title, M, p.y + 5);
  doc
    .setDrawColor(20)
    .setLineWidth(0.4)
    .line(M, p.y + 7, M + CW, p.y + 7);
  p.y += 12;
}

export function paragraph(p: PdfPage, body: string, style: 'normal' | 'italic' = 'normal', gray = 90): void {
  const { M, CW } = p;
  setStyle(p, style).setFontSize(8).setTextColor(gray);
  const lines = splitText(p, body, CW);
  drawText(p, lines, M, p.y + 3);
  p.y += 4 + lines.length * 3.5;
}

export function sub(p: PdfPage, title: string, size = 10): void {
  ensure(p, 7);
  setStyle(p, 'bold').setFontSize(size).setTextColor(20);
  drawText(p, title, p.M, p.y + 4);
  p.y += 6;
}

export function fillScaled(
  p: PdfPage,
  pts: Pt[],
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  fill: [number, number, number] | null,
  stroke: [number, number, number],
): void {
  if (pts.length < 3) return;
  const { doc } = p;
  const P = pts.map(([px, py]) => [ox + px * sx, oy + py * sy] as [number, number]);
  const deltas = P.slice(1).map((q, i) => [q[0] - P[i]![0], q[1] - P[i]![1]] as [number, number]);
  doc.setDrawColor(...stroke).setLineWidth(0.3);
  if (fill) {
    doc.setFillColor(...fill);
    doc.lines(deltas, P[0]![0], P[0]![1], [1, 1], 'FD', true);
  } else {
    doc.lines(deltas, P[0]![0], P[0]![1], [1, 1], 'S', true);
  }
}

export function fillPolygon(p: PdfPage, pts: Pt[], ox: number, oy: number): void {
  const { templateFill, templateStroke } = p.opts;
  fillScaled(p, pts, ox, oy, 1, 1, templateFill ? hexToRgbTuple(templateFill) : null, hexToRgbTuple(templateStroke));
}

export function kvGrid(p: PdfPage, rows: [string, string][]): void {
  const { doc, M, CW } = p;
  const colW = CW / 2;
  doc.setFontSize(9);
  for (let i = 0; i < rows.length; i += 2) {
    ensure(p, 5.5);
    for (const [j, off] of [
      [i, 0],
      [i + 1, colW],
    ] as const) {
      const r = rows[j];
      if (!r) continue;
      setStyle(p, 'bold').setTextColor(20);
      drawText(p, r[0], M + off + 1, p.y + 3.5);
      setStyle(p, 'normal').setTextColor(50);
      drawText(p, r[1], M + off + colW - 1, p.y + 3.5, { align: 'right' });
    }
    doc
      .setDrawColor(225)
      .setLineWidth(0.1)
      .line(M, p.y + 4.6, M + CW, p.y + 4.6);
    p.y += 5.2;
  }
  p.y += 2;
}

/** HEADER_LEADING is em. */
const HEADER_PT = 6.8;
const CELL_PAD_MM = 1;
const HEADER_LEADING = 1.15;
const PT_TO_MM = 25.4 / 72;

interface HeaderFit {
  lines: string[];
  size: number;
}

/** mm */
function textWidth(p: PdfPage, s: string): number {
  return inFont(p, s, (fit) => p.doc.getTextWidth(fit(s)));
}

// Expects the header size and style already set on the document.
function fitHeader(p: PdfPage, title: string, avail: number): HeaderFit {
  const one = textWidth(p, title);
  if (one <= avail) return { lines: [title], size: HEADER_PT };
  let best: { lines: string[]; w: number } | null = null;
  for (let i = 1; i < title.length; i++) {
    const prev = title[i - 1]!;
    if (!/[\s/:]/.test(prev) || /\s/.test(title[i]!)) continue;
    const a = title.slice(0, i).trimEnd();
    const b = title.slice(i).trimStart();
    if (!a || !b) continue;
    const w = Math.max(textWidth(p, a), textWidth(p, b));
    if (!best || w < best.w) best = { lines: [a, b], w };
  }
  if (best && best.w <= avail) return { lines: best.lines, size: HEADER_PT };
  const shape = best && best.w < one ? best : { lines: [title], w: one };
  // Floored, not rounded, so the shrunk line never exceeds the column.
  return { lines: shape.lines, size: Math.floor(((HEADER_PT * avail) / shape.w) * 100) / 100 };
}

export function table(p: PdfPage, cols: Col[], rows: string[][], boldLast = false): void {
  const { doc, M, CW } = p;
  ensure(p, 10);
  setStyle(p, 'bold').setFontSize(HEADER_PT).setTextColor(70);
  const fits = cols.map((c) => fitHeader(p, c.title.toUpperCase(), c.w - 2 * CELL_PAD_MM));
  const pitch = HEADER_PT * HEADER_LEADING * PT_TO_MM;
  const extra = (Math.max(1, ...fits.map((f) => f.lines.length)) - 1) * pitch;
  if (extra) ensure(p, 10 + extra);
  const baseline = p.y + 3 + extra;
  let cx = M;
  cols.forEach((c, i) => {
    const { lines, size } = fits[i]!;
    if (size !== HEADER_PT) doc.setFontSize(size);
    const linePitch = size * HEADER_LEADING * PT_TO_MM;
    const x = c.align === 'right' ? cx + c.w - CELL_PAD_MM : cx + CELL_PAD_MM;
    lines.forEach((line, li) => {
      drawText(p, line, x, baseline - (lines.length - 1 - li) * linePitch, { align: c.align ?? 'left' });
    });
    if (size !== HEADER_PT) doc.setFontSize(HEADER_PT);
    cx += c.w;
  });
  p.y += 4 + extra;
  doc
    .setDrawColor(20)
    .setLineWidth(0.3)
    .line(M, p.y, M + CW, p.y);
  p.y += 3.2;
  doc.setFontSize(8).setTextColor(30);
  rows.forEach((row, ri) => {
    ensure(p, 5);
    const last = boldLast && ri === rows.length - 1;
    setStyle(p, last ? 'bold' : 'normal');
    let x2 = M;
    row.forEach((cell, i) => {
      const c = cols[i]!;
      drawText(p, cell, c.align === 'right' ? x2 + c.w - CELL_PAD_MM : x2 + CELL_PAD_MM, p.y + 3, {
        align: c.align ?? 'left',
      });
      x2 += c.w;
    });
    p.y += 4.4;
    if (!last)
      doc
        .setDrawColor(235)
        .setLineWidth(0.1)
        .line(M, p.y - 1.4, M + CW, p.y - 1.4);
  });
  p.y += 3;
}

// Fixed one decimal would print a 0.976 in BT-50 as 1.0.
const LADDERED: ReadonlySet<Quantity> = new Set<Quantity>(['length', 'motorDimensions', 'mass', 'impulse']);

const digitsFor = (quantity: Quantity, ui: number, digits?: number): number =>
  digits ?? (LADDERED.has(quantity) ? ladderDigits(ui) : 1);

export const q = (p: PdfPage, quantity: Quantity, si: number, digits?: number): string => {
  if (!Number.isFinite(si)) return NO_VALUE;
  const ui = siToUi(quantity, p.units[quantity], si);
  return `${fmtNum(ui, digitsFor(quantity, ui, digits))} ${p.units[quantity]}`;
};

export const qv = (p: PdfPage, quantity: Quantity, si: number, digits?: number): string => {
  const ui = siToUi(quantity, p.units[quantity], si);
  return fmtNum(ui, digitsFor(quantity, ui, digits));
};

export const len = (p: PdfPage, m: number): string => q(p, 'length', m);

export const g = (p: PdfPage, kg: number): string => q(p, 'mass', kg);

export function summaryRows(p: PdfPage, info: StaticInfo): [string, string][] {
  const { t } = p;
  const label: Record<StatKey, string> = {
    length: 'report.length',
    maxDiameter: 'report.maxDiameter',
    massEmpty: 'report.massEmpty',
    massLoaded: 'report.massLoaded',
    fineness: 'report.fineness',
    cgEmpty: 'report.cgEmpty',
    cgLoaded: 'report.cgLoaded',
    cp: 'report.cp',
    stabilityCal: 'report.stabilityCal',
    stabilityPct: 'report.stabilityPct',
    cd: 'report.cd',
    cna: 'report.cna',
    pitchInertia: 'stats.pitchInertia',
    rollInertia: 'stats.rollInertia',
  };
  const shown = (key: StatKey, v: number): string => {
    switch (key) {
      case 'massEmpty':
      case 'massLoaded':
        return g(p, v);
      case 'fineness':
        return fmtNum(v, 2);
      case 'stabilityCal':
        return `${fmtNum(v, 2)} cal`;
      case 'stabilityPct':
        return fmtPercent(v, 1);
      case 'cd':
        return fmtNum(v, 3);
      case 'cna':
        return `${fmtNum(v, 2)} /rad`;
      case 'pitchInertia':
      case 'rollInertia':
        return `${fmtSig(v, 4)} kg·m²`;
      default:
        return len(p, v);
    }
  };
  return staticInfoRows(info).map(({ key, value }) => [t(label[key]), shown(key, value)]);
}

export function writeRuler(p: PdfPage): void {
  const { doc, t, M } = p;
  sub(p, t('report.ruler'), 9);
  ensure(p, 16);
  const ry = p.y + 6;
  doc
    .setDrawColor(20)
    .setLineWidth(0.2)
    .line(M, ry, M + 100, ry);
  for (let d = 0; d <= 100; d++) doc.line(M + d, ry, M + d, ry - (d % 10 === 0 ? 4 : d % 5 === 0 ? 2.5 : 1.5));
  doc.setFontSize(6).setTextColor(20);
  for (let cm = 0; cm <= 10; cm++) drawText(p, `${cm}`, M + cm * 10, ry - 5);
  for (let inch = 0; inch <= 3; inch++) drawText(p, `${inch} in`, M + inch * 25.4, ry + 4);
  drawText(p, 'cm', M + 103, ry - 4);
  p.y = ry + 8;
}
