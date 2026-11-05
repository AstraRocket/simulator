import type { ComponentNode, ComponentType, RocketTree } from '../../engine/openRocketEngine';
import { hexOf, parseHexColor } from './colorHex';
import { mapTreePreserving } from '../../tree/treeWalk';

/** Default figure styles are a view preference, never written to a file. */

export const LINE_STYLES = ['solid', 'dashed', 'dotted', 'dashdot'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

/** Solid is an explicit "none", so it can override a view's own dashing. */
const DASHES: Record<LineStyle, string> = {
  solid: 'none',
  dashed: '6 4',
  dotted: '2 3',
  dashdot: '8 3 2 3',
};

export const readLineStyle = (v: unknown): LineStyle | undefined =>
  typeof v === 'string' && (LINE_STYLES as readonly string[]).includes(v) ? (v as LineStyle) : undefined;

export const dashOf = (n: ComponentNode, dflt?: string): string | undefined => {
  const s = readLineStyle(n['lineStyle']);
  return s ? DASHES[s] : dflt;
};

export interface FigureStyle {
  color?: string;
  lineStyle?: LineStyle;
}

export type FigureStyles = Partial<Record<ComponentType, FigureStyle>>;

export function readFigureStyles(v: unknown): FigureStyles {
  if (!v || typeof v !== 'object') return {};
  const out: FigureStyles = {};
  for (const [type, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const rgb = parseHexColor(o['color']);
    const lineStyle = readLineStyle(o['lineStyle']);
    const style: FigureStyle = {
      ...(rgb !== null ? { color: hexOf(rgb) } : {}),
      ...(lineStyle ? { lineStyle } : {}),
    };
    if (style.color || style.lineStyle) out[type as ComponentType] = style;
  }
  return out;
}

/** A copy for drawing only, so a default never reaches a file. */
export function withFigureDefaults(tree: RocketTree, styles: FigureStyles): RocketTree {
  if (Object.keys(styles).length === 0) return tree;
  const components = mapTreePreserving(
    tree.components,
    (n) => {
      const d = styles[n.type];
      const color = typeof n['color'] === 'string' ? undefined : d?.color;
      const lineStyle = readLineStyle(n['lineStyle']) ? undefined : d?.lineStyle;
      if (!color && !lineStyle) return n;
      return { ...n, ...(color ? { color } : {}), ...(lineStyle ? { lineStyle } : {}) };
    },
    'post',
  );
  return { ...tree, components };
}
