// Kernel `MathUtil.equals`, exactly: digest parity depends on dropping the same points.
const MATH_EPSILON = 0.00000001;

export function mathEquals(a: number, b: number, epsilon = MATH_EPSILON): boolean {
  const absb = Math.abs(b);
  if (absb < epsilon / 2) return Math.abs(a) < epsilon / 2;
  return Math.abs(a - b) < epsilon * absb;
}

/** Against zero the epsilon halves: the threshold is 5e-9, not `MathUtil.EPSILON`. */
export function isZero(x: number): boolean {
  return mathEquals(x, 0);
}
