export type Pt = [number, number];

/** Fits a fin outline in the editor's viewBox, with x = 0 and the root line always in view. */
export function finViewport(pts: Pt[]) {
  const W = 300,
    H = 180,
    PAD = 22;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(xMin + 0.01, ...xs);
  const yMax = Math.max(0.01, ...ys);
  const scale = Math.min((W - 2 * PAD) / (xMax - xMin), (H - 2 * PAD) / yMax);
  const sx = (x: number) => PAD + (x - xMin) * scale;
  const sy = (y: number) => H - PAD - y * scale;
  return {
    W,
    H,
    PAD,
    sx,
    sy,
    fromView: (vx: number, vy: number): Pt => [xMin + (vx - PAD) / scale, (H - PAD - vy) / scale],
  };
}
