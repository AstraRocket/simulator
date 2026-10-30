/**
 * A number as file text: plain decimal with a '.' point, rounded to `digits`
 * places, trailing zeros dropped, never "-0". Locale-free on purpose, which is
 * what separates it from `fmtNum` (a displayed number).
 *
 * Every file writer chooses its own precision and what a non-finite value
 * becomes, but none of them may write "NaN" or "Infinity": a reader of the
 * format takes that for a number it cannot parse.
 */
export function plainDecimal(v: number, digits: number, nonFinite = ''): string {
  if (!Number.isFinite(v)) return nonFinite;
  // toFixed, not Math.round(v * 10 ** digits): the two round a halfway value
  // differently, and the golden exports pin toFixed's answer.
  const r = Number(v.toFixed(digits));
  return Object.is(r, -0) ? '0' : String(r);
}

/**
 * A number as file text to `sig` significant figures: plain decimal with a '.'
 * point, never an exponent (which a spreadsheet may read as text), trailing
 * zeros dropped, never "-0". 0.4250 to 4 figures is "0.425", 24993 is "24990",
 * 9.3e-6 is "0.0000093". `nonFinite` stands in for "NaN" or "Infinity".
 */
export function plainSig(v: number, sig: number, nonFinite = ''): string {
  if (!Number.isFinite(v)) return nonFinite;
  const r = Number(v.toPrecision(sig));
  if (r === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(r)));
  const s = r.toFixed(Math.min(100, Math.max(0, sig - 1 - mag)));
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Sign, digits with an optional '.', optional exponent: what a file number may be. */
const DECIMAL_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * File text to a number, read as plain decimal only, or NaN. `Number()` alone
 * also takes "0x10" (16), "0b110" (6) and "0o7" (7), none of which a motor or
 * design file writes, so a value like that is a damaged field, not a number.
 * A blank is NaN too, where `Number('')` is 0. Surrounding whitespace is
 * ignored; "Infinity" is refused here, and an exponent that overflows still
 * comes back as Infinity for the caller's finite check.
 */
export function readDecimal(raw: string): number {
  const t = raw.trim();
  return DECIMAL_TEXT.test(t) ? Number(t) : NaN;
}

/**
 * {@link plainDecimal} with its trailing zeros kept, for a format that pads its
 * numbers to a fixed width (a DXF group value, an SVG length): `digits` places
 * from `toFixed`, and `nonFinite` in place of "NaN" or "Infinity".
 */
export function fixedDecimal(v: number, digits: number, nonFinite = '0'): string {
  return Number.isFinite(v) ? v.toFixed(digits) : nonFinite;
}
