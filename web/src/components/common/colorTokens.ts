/**
 * A color token (src/index.css) as a CSS value, for colors set in code rather
 * than by a class: an SVG `fill` or `stroke`, a gradient stop, an inline style.
 * The browser resolves it, so it follows the token wherever the token goes.
 *
 * Not for three.js or a canvas, which take a color value and cannot resolve a
 * variable; the 3D views read the tokens as values through useSceneColors
 * (canvas/sceneColors). Nor for anything drawn into an SVG
 * the user downloads, which has no stylesheet to resolve it against (see
 * services/exports/schematicExport).
 */
export const token = (name: string): string => `var(--c-${name})`;

/**
 * The tokens' current values, read from the page's styles once: the lookup
 * gives a token's color as the page resolves it now, or '' with no document (a
 * test, a worker). For code that needs a value rather than a variable (three.js,
 * a color input); each caller picks its own fallback for ''.
 */
export function tokenValues(): (name: string) => string {
  const style = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  return (name) => style?.getPropertyValue(`--c-${name}`).trim() ?? '';
}
