import type { StaticInfo } from '../../engine/openRocketEngine';
import { fmtDateTime } from '../../i18n/format';
import { siToUi, type UnitSelection } from '../../prefs/units.js';
import { appName } from '../app/appInfo.js';
import { escapeXml } from '../files/xmlUtil.js';
import { KeyedError } from '../../i18n/keyedError';
import { fmtList, fmtNum, fmtUpTo, ladderDigits, withUnit } from '../../i18n/format';
import { staticInfoRows } from '../report/designInfo';
import { fixedDecimal } from '../files/numberText';
import { canvas2d } from './offscreenRaster';

export interface ExportData {
  name: string;
  info: StaticInfo | null;
  units: UnitSelection;
  /** Full span diameter including fins, lugs and pods (m). */
  spanM?: number;
  withMotors: boolean;
  appVersion: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function dataHeaderLines(d: ExportData): string[] {
  const { t, units: u } = d;
  const length = (si: number) => withUnit(fmtUpTo(siToUi('length', u.length, si), 3), u.length);
  const mass = (si: number) => {
    const v = siToUi('mass', u.mass, si);
    return withUnit(fmtNum(v, ladderDigits(v)), u.mass);
  };
  const lines: string[] = [d.name];
  if (d.info) {
    const i = d.info;
    const dims = [
      t('export.headerLength', { value: length(i.length) }),
      t('export.headerMaxDiameter', { value: length(i.refDiameter) }),
      ...(d.spanM ? [t('export.headerSpan', { value: length(d.spanM) })] : []),
    ];
    lines.push(fmtList(dims));
    lines.push(
      d.withMotors
        ? t('export.headerLaunchMass', { mass: mass(i.mass), dry: mass(i.massEmpty) })
        : t('export.headerDryMass', { dry: mass(i.massEmpty) }),
    );
    const hasCp = staticInfoRows(i).some((r) => r.key === 'cp');
    lines.push(
      hasCp
        ? t('export.headerBalance', { cg: length(i.cg), cp: length(i.cp), margin: fmtNum(i.stabilityCalibers, 2) })
        : t('export.headerCg', { cg: length(i.cg) }),
    );
  }
  lines.push(`${appName()} v${d.appVersion}, ${exportDate(new Date())}`);
  return lines;
}

const headerFontPx = (widthPx: number): number => Math.max(12, Math.round(widthPx * 0.016));

/** Local date, not UTC: UTC is a day off for evening exports in the Americas. */
const exportDate = (at: Date): string => fmtDateTime(at.getTime(), { dateStyle: 'medium' });

const EXPORT_VARS: [string, string][] = [
  ['var(--surface-1)', '#ffffff'],
  ['var(--text-primary)', '#20242c'],
  ['var(--accent)', '#b8511d'],
  ['var(--launch)', '#c65420'],
  ['var(--status-good)', '#008300'],
  ['var(--status-warn)', '#a06b00'],
  ['var(--status-serious)', '#e34948'],
];

// A downloaded SVG has no stylesheet, so its `var(--c-sch-*)` tokens are baked to these.
export const PRINT_COLORS: Record<string, string> = {
  'sch-line': '#7a786f',
  'sch-part': '#b9b7b0',
  'sch-part-light': '#c8c5be',
  'sch-shell': '#d5d2cb',
  'sch-shell-light': '#e7e5e0',
  'sch-ink': '#9a978f',
  'sch-label': '#ffffff',
  'sch-motor': '#8b5a2b',
  'sch-motor-edge': '#6b4520',
  'sch-motor-outline': '#e0764a',
  'sch-shoulder': '#4f8fa0',
  'sch-hatch': '#66748c',
  'sch-parachute': '#b06a35',
  'sch-streamer': '#a08c2e',
  'sch-shockcord': '#8f7a8d',
  'sch-masscomponent': '#a85f5c',
  'sch-centeringring': '#6f8a5c',
  'sch-bulkhead': '#66748c',
  'sch-engineblock': '#7d7050',
  'sch-tubecoupler': '#7f6ea8',
  'sch-innertube': '#3f8f6f',
};

export function bakeTokens(markup: string): string {
  const root = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  return markup.replace(/var\(--c-([\w-]+)\)/g, (_whole, name: string) => {
    return PRINT_COLORS[name] ?? (root?.getPropertyValue(`--c-${name}`).trim() || '#000000');
  });
}

/** @param pxPerM viewBox px per meter */
export function schematicSvg(
  svgEl: SVGSVGElement,
  pxPerM: number,
  viewW: number,
  viewH: number,
  d: ExportData,
): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const zoomG = clone.querySelector(':scope > g');
  zoomG?.setAttribute('transform', 'translate(0 0) scale(1)');
  clone.querySelector('[data-schematic-grid]')?.remove();

  let inner = new XMLSerializer().serializeToString(clone);
  inner = inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  for (const [v, val] of EXPORT_VARS) {
    inner = inner.split(v).join(val);
  }
  inner = bakeTokens(inner);
  const mm = (px: number) => `${fixedDecimal((px / pxPerM) * 1000, 2)}mm`;
  return svgWithHeader(inner, viewW, viewH, d, mm);
}

function headerBand(widthPx: number, d: ExportData): { fs: number; lineH: number; lines: string[]; headerH: number } {
  const fs = headerFontPx(widthPx);
  const lineH = Math.round(fs * 1.45);
  const lines = dataHeaderLines(d);
  return { fs, lineH, lines, headerH: lineH * (lines.length + 1) };
}

/** `size` maps a viewBox length to document units (mm for 2D, px for 3D). */
export function svgWithHeader(
  inner: string,
  viewW: number,
  viewH: number,
  d: ExportData,
  size: (px: number) => string,
): string {
  const { fs, lineH, lines, headerH } = headerBand(viewW, d);
  const totalH = viewH + headerH;

  const header = lines
    .map(
      (l, i) =>
        `<text x="${Math.round(fs * 0.8)}" y="${lineH * (i + 1)}" font-size="${i === 0 ? Math.round(fs * 1.25) : fs}"` +
        `${i === 0 ? ' font-weight="bold"' : ''}>${escapeXml(l)}</text>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${totalH}"
  width="${size(viewW)}" height="${size(totalH)}"
  font-family="Arial, Helvetica, sans-serif" fill="#20242c">
  <rect x="0" y="0" width="${viewW}" height="${totalH}" fill="#ffffff"/>
  <g>${header}</g>
  <g transform="translate(0 ${headerH})">${inner}</g>
</svg>`;
}

export type ImageFormat = 'png' | 'jpeg';
export const IMAGE_FORMAT_EXT: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg' };
export const IMAGE_WIDTHS = [1920, 3840, 7680] as const;
const JPEG_QUALITY = 0.92;

const encodeCanvas = (canvas: HTMLCanvasElement, format: ImageFormat): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new KeyedError('errors.export.imageEncode'))),
      `image/${format}`,
      format === 'jpeg' ? JPEG_QUALITY : undefined,
    );
  });

export function svgToImage(svgString: string, widthPx = 3840, format: ImageFormat = 'png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
        const { canvas, ctx: c } = canvas2d(widthPx, Math.round(widthPx * ratio));
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.drawImage(img, 0, 0, canvas.width, canvas.height);
        encodeCanvas(canvas, format).then(resolve, reject);
      } catch (e) {
        reject(e instanceof KeyedError ? e : new KeyedError('errors.export.imageTooLarge'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new KeyedError('errors.export.svgRasterize'));
    };
    img.src = url;
  });
}

// A live WebGL `glCanvas` needs preserveDrawingBuffer for drawImage to see the frame.
export function snapshotWithHeader(
  glCanvas: HTMLCanvasElement,
  d: ExportData,
  format: ImageFormat = 'png',
): Promise<Blob> {
  const w = glCanvas.width;
  const { fs, lineH, lines, headerH } = headerBand(w, d);
  let made: ReturnType<typeof canvas2d>;
  try {
    made = canvas2d(w, headerH + glCanvas.height);
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new KeyedError('errors.export.imageTooLarge'));
  }
  const { canvas, ctx: c } = made;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#20242c';
  lines.forEach((l, i) => {
    c.font = `${i === 0 ? 'bold ' : ''}${i === 0 ? Math.round(fs * 1.25) : fs}px Arial, Helvetica, sans-serif`;
    c.fillText(l, Math.round(fs * 0.8), lineH * (i + 1));
  });
  c.drawImage(glCanvas, 0, headerH);
  return encodeCanvas(canvas, format);
}

export const SVG_MIME = 'image/svg+xml';
