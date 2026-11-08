export function plainDecimal(v: number, digits: number, nonFinite = ''): string {
  if (!Number.isFinite(v)) return nonFinite;
  // toFixed, not Math.round: halfway values differ and the golden exports pin toFixed.
  const r = Number(v.toFixed(digits));
  return Object.is(r, -0) ? '0' : String(r);
}

/** Never an exponent, which a spreadsheet may read as text. */
export function plainSig(v: number, sig: number, nonFinite = ''): string {
  if (!Number.isFinite(v)) return nonFinite;
  const r = Number(v.toPrecision(sig));
  if (r === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(r)));
  const s = r.toFixed(Math.min(100, Math.max(0, sig - 1 - mag)));
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

const DECIMAL_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** `Number()` alone accepts "0x10" and reads '' as 0. */
export function readDecimal(raw: string): number {
  const t = raw.trim();
  return DECIMAL_TEXT.test(t) ? Number(t) : NaN;
}

export function fixedDecimal(v: number, digits: number, nonFinite = '0'): string {
  return Number.isFinite(v) ? v.toFixed(digits) : nonFinite;
}
