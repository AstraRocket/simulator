/**
 * Hex colors, read and written one way for every file and view.
 *
 * A color reaches the app from a color input (always `#rrggbb`), a saved file
 * (`.ork` channels, a `.rkt` hex or name) or a hand-edited settings blob, and
 * leaves it into the `.ork`, 3MF, KML and PDF writers. All of them parse and
 * format through these two functions so they agree on what is a color (no
 * partial hex prefix such as "12zz", the same `#rgb` shorthand handling), and
 * each caller keeps only its own fallback for a value that is not a color.
 */

/**
 * A packed 0xRRGGBB from `#rrggbb`, `rrggbb`, the CSS shorthand `#rgb`, or
 * `#rrggbbaa` (the alpha byte dropped). Null for anything else, never a
 * partial read. The shorthand needs its `#`, as in CSS: a bare "bad" is a word,
 * not a color.
 */
export function parseHexColor(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(?:#([0-9a-f]{3})|#?([0-9a-f]{6}|[0-9a-f]{8}))$/i.exec(raw.trim());
  if (!m) return null;
  const digits = m[1] ?? m[2]!;
  const six =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits.slice(0, 6);
  return Number.parseInt(six, 16);
}

/** A packed color as six lowercase hex digits, `#`-prefixed unless `hash` is false. */
export function hexOf(rgb: number, hash = true): string {
  return `${hash ? '#' : ''}${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** A packed color's red, green and blue, each 0 to 255. */
export const rgbChannels = (rgb: number): [number, number, number] => [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];

/** Red, green and blue (each 0 to 255) packed into one color. */
export const packRgb = (r: number, g: number, b: number): number => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
