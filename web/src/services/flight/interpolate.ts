import { finiteOr } from '../app/numbers';

// `xs` sorted ascending. Steps past NaN samples: the kernel records stability as NaN on the rail.
export function lerpAt(xs: readonly number[], ys: readonly (number | null)[], x: number): number | null {
  const n = xs.length;
  // A NaN position fails both clamps below and would search to the last span.
  if (!n || Number.isNaN(x)) return null;
  if (x <= xs[0]!) return finiteOr(ys[0], null);
  // Indexed off `xs`, so a longer `ys` cannot leak.
  if (x > xs[n - 1]!) return finiteOr(ys[n - 1], null);
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x <= xs[mid]!) hi = mid;
    else lo = mid + 1;
  }
  const i = lo;
  const y0 = finiteOr(ys[i - 1], null);
  const y1 = finiteOr(ys[i], null);
  if (y0 == null || y1 == null) return y1 ?? y0;
  const span = xs[i]! - xs[i - 1]!;
  return y0 + ((x - xs[i - 1]!) / span) * (y1 - y0);
}
