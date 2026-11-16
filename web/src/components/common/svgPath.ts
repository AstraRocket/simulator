export type ScreenPoint = readonly [x: number, y: number];

/** A `points` attribute; leave `digits` off for a view drawn in meters, where rounding would show. */
export function pointsAttr(pts: readonly ScreenPoint[], digits?: number): string {
  const f = (v: number) => (digits == null ? String(v) : v.toFixed(digits));
  return pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
}

// The command letter tracks what was emitted, not the index: the browser silently drops a `d` starting with `L`.
export function polylinePath(
  pts: readonly ScreenPoint[],
  style: 'comma' | 'space' = 'space',
  breakBefore?: (i: number) => boolean,
): string {
  const out: string[] = [];
  let open = false;
  pts.forEach(([x, y], i) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      open = false;
      return;
    }
    const cmd = open && !breakBefore?.(i) ? 'L' : 'M';
    out.push(style === 'comma' ? `${cmd}${x.toFixed(1)},${y.toFixed(1)}` : `${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`);
    open = true;
  });
  return out.join(' ');
}

export function areaPath(
  pts: readonly ScreenPoint[],
  baseY: number,
  style: 'comma' | 'space' = 'space',
  ends?: readonly [x0: number, x1: number],
): string {
  const finite = pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!finite.length) return '';
  const at = (cmd: string, x: number, y: number) =>
    style === 'comma' ? `${cmd}${x.toFixed(1)},${y.toFixed(1)}` : `${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`;
  const x0 = ends?.[0] ?? finite[0]![0];
  const x1 = ends?.[1] ?? finite[finite.length - 1]![0];
  return [at('M', x0, baseY), ...finite.map(([x, y]) => at('L', x, y)), at('L', x1, baseY), 'Z'].join(' ');
}
