import type { ComponentNode, ComponentType, RocketTree } from '../../engine/openRocketEngine';
import { hexOf, parseHexColor } from './colorHex';
import { mapTreePreserving } from '../../tree/treeWalk';

/**
 * A part's figure style: the color and the line style the 2D views draw it
 * with, desktop's Appearance tab's upper half. The color is `<color>` in a
 * `.ork` (node key `color`), the line style `<linestyle>` (`lineStyle`).
 *
 * "Save as default style" stores a part's style as the default for its type,
 * as desktop's `ApplicationPreferences.setDefaultColor` / `setDefaultLineStyle`
 * do per component class. A default is a view preference, kept in Settings and
 * never written to a file: a part on the default saves with neither element,
 * as on the desktop.
 */

/** `LineStyle`, by the lowercase names `RocketComponentSaver` writes. */
export const LINE_STYLES = ['solid', 'dashed', 'dotted', 'dashdot'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

/** `LineStyle.getDashes`, as SVG dash arrays. Solid is an explicit "none", so it can override a view's own dashing. */
const DASHES: Record<LineStyle, string> = {
  solid: 'none',
  dashed: '6 4',
  dotted: '2 3',
  dashdot: '8 3 2 3',
};

/** A stored line style, or undefined when the value is not one. */
export const readLineStyle = (v: unknown): LineStyle | undefined =>
  typeof v === 'string' && (LINE_STYLES as readonly string[]).includes(v) ? (v as LineStyle) : undefined;

/** The dash array a part's outline is drawn with: its line style's, else the view's own `dflt` (solid when none). */
export const dashOf = (n: ComponentNode, dflt?: string): string | undefined => {
  const s = readLineStyle(n['lineStyle']);
  return s ? DASHES[s] : dflt;
};

/** One type's saved default style. */
export interface FigureStyle {
  color?: string;
  lineStyle?: LineStyle;
}

export type FigureStyles = Partial<Record<ComponentType, FigureStyle>>;

/** A stored defaults map with every value checked, as anything read back from storage is. */
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

/**
 * The tree as the views draw it: each part with no figure color or line style
 * of its own takes its type's saved default. A copy for drawing only; the
 * design keeps what it had, so a default never reaches a file. The same tree
 * comes back when there are no defaults.
 */
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
