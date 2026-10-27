/** A point already in screen coordinates. */
export type ScreenPoint = readonly [x: number, y: number];

/**
 * SVG `d` for a polyline through screen points, skipping non-finite ones.
 *
 * The command letter comes from whether one has been emitted, not from the
 * array index. With `${i ? 'L' : 'M'}` a non-finite first point gives a `d`
 * that starts with `L`, which is invalid path data: the browser drops the whole
 * <path> and the line renders blank with no error. A gap mid-line starts a
 * fresh `M`, so a hole reads as a break rather than a straight line across it,
 * and so does any point `breakBefore` names (a wrap from 359 to 1 degrees).
 *
 * `comma` writes `M1.0,2.0`, `space` writes `M 1.0 2.0`.
 */
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

/**
 * SVG `d` for the filled area between a line through screen points and a
 * horizontal baseline at `baseY`: down to the baseline at `ends[0]`, along the
 * points, back down at `ends[1]`, closed. `ends` defaults to the first and last
 * finite points' x. Non-finite points are skipped; with none left the path is
 * empty, so nothing is drawn rather than a broken `d`.
 */
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
