// Desktop's `optimization/general`: each parameter scaled to 0..1 across its range, a golden-section search
// for one parameter and a multidirectional search (Dennis and Torczon) for several, both stopping once the
// step falls below `STEP_SIZE_LIMIT`. Unlike desktop, a point never leaves the 0..1 box: the range is a bound,
// so a failed reflection tries a step along each axis before the simplex shrinks.

/** `OptimizationWorker.STEP_SIZE_LIMIT`. */
export const STEP_SIZE_LIMIT = 0.005;

/** `MultidirectionalSearchOptimizer`'s starting step. */
const INITIAL_STEP = 0.5;

/** `GoldenSectionSearchOptimizer.ALPHA`. */
const ALPHA = (Math.sqrt(5) - 1) / 2;

export type Vec = readonly number[];

export interface SearchHooks {
  /** Scores, lower is better, in the order asked. Points may repeat: the caller caches. */
  evaluate: (points: Vec[]) => Promise<number[]>;
  /** After each step, with the best point so far and the step size it was taken at. */
  onStep: (best: Vec, score: number, step: number) => void;
  /** True to stop early: canceled, or out of flights. */
  stopped: () => boolean;
}

export interface SearchResult {
  best: Vec;
  score: number;
  converged: boolean;
}

export const clamp01 = (v: number): number => (Number.isNaN(v) ? 0 : Math.max(0, Math.min(1, v)));

/** Starts from `x0` (the design as it is), so the result is never worse than the start. */
export function search(x0: Vec, hooks: SearchHooks): Promise<SearchResult> {
  return x0.length === 1 ? goldenSection(x0, hooks) : multidirectional(x0, hooks);
}

async function goldenSection(x0: Vec, hooks: SearchHooks): Promise<SearchResult> {
  let a = 0;
  let d = 1;
  let b = a + (1 - ALPHA) * (d - a);
  let c = a + ALPHA * (d - a);
  const from = clamp01(x0[0] ?? 0);
  const [f0 = Number.MAX_VALUE, fb0 = Number.MAX_VALUE, fc0 = Number.MAX_VALUE] = await hooks.evaluate([
    [from],
    [b],
    [c],
  ]);
  let best: Vec = [from];
  let bestScore = f0;
  let fb = fb0;
  let fc = fc0;
  const keep = (x: number, f: number) => {
    if (f < bestScore) {
      best = [x];
      bestScore = f;
    }
  };
  keep(b, fb);
  keep(c, fc);
  hooks.onStep(best, bestScore, c - a);
  while (c - a >= STEP_SIZE_LIMIT) {
    if (hooks.stopped()) return { best, score: bestScore, converged: false };
    if (fb < fc) {
      d = c;
      c = b;
      fc = fb;
      b = a + (1 - ALPHA) * (d - a);
      fb = (await hooks.evaluate([[b]]))[0] ?? Number.MAX_VALUE;
      keep(b, fb);
    } else {
      a = b;
      b = c;
      fb = fc;
      c = a + ALPHA * (d - a);
      fc = (await hooks.evaluate([[c]]))[0] ?? Number.MAX_VALUE;
      keep(c, fc);
    }
    hooks.onStep(best, bestScore, c - a);
  }
  return { best, score: bestScore, converged: true };
}

/** `SearchPattern.square`: one step along each axis, turned back where it would leave the box. */
const axesAround = (center: Vec, step: number): Vec[] =>
  center.map((_, i) => center.map((v, j) => (j !== i ? v : v + step <= 1 ? v + step : clamp01(v - step))));

/** One step either way along each axis, inside the box: desktop's disabled `useCoordinateSearch`. */
const coordinateProbes = (center: Vec, step: number): Vec[] =>
  center.flatMap((v, i) =>
    [v + step, v - step].filter((w) => w >= 0 && w <= 1).map((w) => center.map((c, j) => (j === i ? w : c))),
  );

async function multidirectional(x0: Vec, hooks: SearchHooks): Promise<SearchResult> {
  let step = INITIAL_STEP;
  const start = x0.map(clamp01);
  const axes = axesAround(start, step);
  const [f0 = Number.MAX_VALUE, ...fAxes] = await hooks.evaluate([start, ...axes]);
  let current: Vec = start;
  let fc = f0;
  let others: Vec[] = axes;
  // The vertex kept as `current` is the lowest; the rest of the simplex goes on in `others`.
  const takeBest = (points: Vec[], scores: number[]) => {
    const i = Math.max(0, scores.indexOf(Math.min(...scores)));
    current = points[i]!;
    fc = scores[i]!;
    others = points.filter((_, j) => j !== i);
  };
  takeBest([current, ...others], [fc, ...fAxes]);
  hooks.onStep(current, fc, step);

  while (step >= STEP_SIZE_LIMIT) {
    if (hooks.stopped()) return { best: current, score: fc, converged: false };
    const reflected = others.map((p) => current.map((c, i) => clamp01(2 * c - p[i]!)));
    const fr = await hooks.evaluate(reflected);
    if (Math.min(...fr) < fc) {
      takeBest([current, ...reflected], [fc, ...fr]);
      hooks.onStep(current, fc, step);
      continue;
    }
    // At a range's edge the reflections fold back onto it and the simplex flattens along the edge,
    // so a step along each axis comes first; desktop, unbounded, never needs it.
    const probes = coordinateProbes(current, step);
    const fp = await hooks.evaluate(probes);
    const k = fp.indexOf(Math.min(...fp));
    if (k >= 0 && fp[k]! < fc) {
      const moved = probes[k]!;
      const around = axesAround(moved, step);
      const fa = await hooks.evaluate(around);
      takeBest([moved, ...around], [fp[k]!, ...fa]);
    } else {
      const contracted = others.map((p) => current.map((c, i) => (c + p[i]!) / 2));
      const fk = await hooks.evaluate(contracted);
      step /= 2;
      takeBest([current, ...contracted], [fc, ...fk]);
    }
    hooks.onStep(current, fc, step);
  }
  return { best: current, score: fc, converged: true };
}
