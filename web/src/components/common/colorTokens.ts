/** Not for three.js, a canvas or a downloaded SVG, none of which can resolve a CSS variable. */
export const token = (name: string): string => `var(--c-${name})`;

/** '' with no document (a test, a worker), so each caller picks its own fallback. */
export function tokenValues(): (name: string) => string {
  const style = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  return (name) => style?.getPropertyValue(`--c-${name}`).trim() ?? '';
}
