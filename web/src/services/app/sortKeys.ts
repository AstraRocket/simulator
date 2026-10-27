/** A sort key with no value: missing, a non-finite number or an empty string. */
const unknown = (v: number | string | null | undefined): boolean =>
  v == null || (typeof v === 'number' ? !Number.isFinite(v) : v === '');

/**
 * Compare two sort keys in the direction `dir` (1 ascending, -1 descending).
 * Unknown keys sort last in both directions, so reversing a column never
 * brings the blank rows to the top. A string on either side compares as text.
 */
export function compareSortKeys(
  va: number | string | null | undefined,
  vb: number | string | null | undefined,
  dir: 1 | -1,
): number {
  const ua = unknown(va);
  const ub = unknown(vb);
  if (ua || ub) return ua === ub ? 0 : ua ? 1 : -1;
  const c =
    typeof va === 'string' || typeof vb === 'string'
      ? String(va).localeCompare(String(vb))
      : (va as number) - (vb as number);
  return dir * c;
}
