import type { ComponentNode } from '../../engine/openRocketEngine';
import { isPlanarFinSet } from '../../tree/tubefins';
import { walkNodes } from '../../tree/treeWalk';
import { parseHexColor, rgbChannels } from '../design/colorHex';

export const hexToRgbTuple = (hex: string): [number, number, number] => {
  const n = parseHexColor(hex);
  if (n === null) return [17, 24, 39];
  return rgbChannels(n);
};

// isPlanarFinSet, not endsWith('finset'): tube fins have no planform (desktop FinSetPrintStrategy skips them).
export const finSetsOf = (stage: ComponentNode): ComponentNode[] =>
  [...walkNodes(stage.children ?? [])].filter((n) => isPlanarFinSet(String(n.type)));

/** All mm. */
export interface PageFrame {
  margin: number;
  contentWidth: number;
  bottom: number;
}

export const PAGE_MARGIN_MM = 12;

export function pageFrame(pageWidthMm: number, pageHeightMm: number): PageFrame {
  const margin = PAGE_MARGIN_MM;
  return { margin, contentWidth: pageWidthMm - 2 * margin, bottom: pageHeightMm - margin };
}

export const SIDE_VIEW_BAND_MM = 34;

export function sideViewScale(svWidthMm: number, svHeightMm: number, frame: PageFrame): number {
  return Math.min(frame.contentWidth / svWidthMm, SIDE_VIEW_BAND_MM / Math.max(svHeightMm, 1));
}

export function sideViewOrigin(
  svWidthMm: number,
  svHeightMm: number,
  scale: number,
  y: number,
  frame: PageFrame,
): { ox: number; oy: number } {
  return {
    ox: frame.margin + (frame.contentWidth - svWidthMm * scale) / 2,
    oy: y + (svHeightMm * scale) / 2,
  };
}

export function templateFits(widthMm: number, heightMm: number, frame: PageFrame): boolean {
  return widthMm <= frame.contentWidth && heightMm <= frame.bottom - frame.margin;
}
