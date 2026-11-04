import { hexOf, parseHexColor } from '../../design/colorHex';

/** The desktop's palette, value for value, so a stage keeps its color across both apps. */
const BRANCH_COLORS = [
  0x0072bd, 0xd95319, 0xedb120, 0x7e318e, 0x77ac30, 0x4dbeee, 0xa2142f, 0xc56a7a, 0xff7f50, 0x556b2f,
];

// Entry i contrasts with `BRANCH_COLORS[i]`: the ground track sits under its path overhead.
const GROUND_COLORS = [
  0xff2d55, 0x00b3a4, 0x8e44ad, 0x2ecc40, 0xe01b84, 0xd35400, 0x1abc9c, 0x2e86c1, 0x27ae60, 0xe74c3c,
];

/** Floor-mod: the index comes from data and may be negative. */
function paletteAt(palette: readonly number[], index: number): number {
  const n = palette.length;
  return palette[((index % n) + n) % n]!;
}

export function defaultBranchColor(index: number): number {
  return paletteAt(BRANCH_COLORS, index);
}

export function defaultGroundColor(index: number): number {
  return paletteAt(GROUND_COLORS, index);
}

export function defaultPinColor(index: number): number {
  return defaultBranchColor(index);
}

export function rgbToHex(rgb: number): string {
  return hexOf(rgb);
}

export function hexToRgbInt(hex: string): number {
  return parseHexColor(hex) ?? 0;
}
const hex2 = (v: number): string => (v & 0xff).toString(16).padStart(2, '0');

export const rgbHex = (rgb: number): string => hexOf(rgb, false);

/** KML's aabbggrr: alpha first, then B, G, R. */
export function kmlColor(rgb: number, alpha: number): string {
  return hex2(alpha) + hex2(rgb) + hex2(rgb >> 8) + hex2(rgb >> 16);
}
