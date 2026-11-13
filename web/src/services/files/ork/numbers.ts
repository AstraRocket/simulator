import { readDecimal } from '../numberText';
import { finiteOr } from '../../app/numbers';

/** Decimal text only, as Java's `parseDouble` reads it: not `Number(x)` ('' is 0, '0x10' is 16). */
export function finiteNum(raw: string | null | undefined): number | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const v = readDecimal(t);
  return finiteOr(v, undefined);
}

export function clampCount(v: number, lo: number, hi: number): number {
  const r = Math.round(v);
  return Number.isFinite(r) ? Math.min(hi, Math.max(lo, r)) : lo;
}
