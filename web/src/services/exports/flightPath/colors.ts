import { hexOf, parseHexColor } from '../../design/colorHex';

/**
 * Per-branch track colors, so the stages of a staged flight can be told apart.
 * The desktop's palette, value for value, so a stage keeps its color between
 * the two apps, and so a template written against one renders the same in the
 * other.
 */
const BRANCH_COLORS = [
  0x0072bd, 0xd95319, 0xedb120, 0x7e318e, 0x77ac30, 0x4dbeee, 0xa2142f, 0xc56a7a, 0xff7f50, 0x556b2f,
];

/**
 * Ground-track palette. Entry *i* is chosen to contrast with entry *i* of
 * `BRANCH_COLORS`, because a ground track sits directly beneath its flight path
 * when the map is viewed from overhead: blue path / red ground, orange / teal,
 * yellow / purple, and so on.
 *
 * More saturated than a darkened path color would be, because a ground track is
 * read against satellite imagery rather than a white plot background.
 */
const GROUND_COLORS = [
  0xff2d55, 0x00b3a4, 0x8e44ad, 0x2ecc40, 0xe01b84, 0xd35400, 0x1abc9c, 0x2e86c1, 0x27ae60, 0xe74c3c,
];

/** Wrap an index into a palette. Floor-mod, so a negative index cannot reach
 *  off the front - the index comes from data, not from a loop counter. */
function paletteAt(palette: readonly number[], index: number): number {
  const n = palette.length;
  return palette[((index % n) + n) % n]!;
}

/**
 * The flight-path color a branch falls on when it has no override.
 */
export function defaultBranchColor(index: number): number {
  return paletteAt(BRANCH_COLORS, index);
}

/**
 * The ground-track color a branch falls on when it has no override.
 */
export function defaultGroundColor(index: number): number {
  return paletteAt(GROUND_COLORS, index);
}

/**
 * The waypoint-pin color a branch falls on when it has no override.
 *
 * Pins match the flight path by default, so this delegates. It is a default
 * that equals another default, resolved once at build time; a pin override
 * replaces it without touching the path color. Keeping it as its own function
 * means giving pins their own palette is a one-line change.
 */
export function defaultPinColor(index: number): number {
  return defaultBranchColor(index);
}

/** A branch color as the `#rrggbb` a color input wants. */
export function rgbToHex(rgb: number): string {
  return hexOf(rgb);
}

/**
 * `#rrggbb` to a packed 0xRRGGBB integer, which is what KML colors want.
 * Anything unparseable reads as black.
 *
 * Distinct from `hexToRgbTuple` in services/report/layout.ts, which returns an
 * [r,g,b] triple for jsPDF.
 */
export function hexToRgbInt(hex: string): number {
  return parseHexColor(hex) ?? 0;
}
const hex2 = (v: number): string => (v & 0xff).toString(16).padStart(2, '0');

/** A packed 0xRRGGBB as the plain `rrggbb` a web color notation wants. */
export const rgbHex = (rgb: number): string => hexOf(rgb, false);

/** RGB → the aabbggrr literal KML wants (alpha first, then B, G, R). */
export function kmlColor(rgb: number, alpha: number): string {
  return hex2(alpha) + hex2(rgb) + hex2(rgb >> 8) + hex2(rgb >> 16);
}
