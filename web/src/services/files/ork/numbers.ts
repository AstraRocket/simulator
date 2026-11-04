/** Not `parseFloat(x) || 0` (passes Infinity) or `Number(x)` ('' is 0). */
export function finiteNum(raw: string | null | undefined): number | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}

export function clampCount(v: number, lo: number, hi: number): number {
  const r = Math.round(v);
  return Number.isFinite(r) ? Math.min(hi, Math.max(lo, r)) : lo;
}
