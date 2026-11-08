import { mathEquals } from './mathEquals';

export const MAX_CURVE_SAMPLES = 20_000;

/** Newtons: `ThrustCurveMotor.MAX_THRUST`; the kernel's builder refuses more. */
export const MAX_THRUST_N = 10.0e6;

/** Desktop's `AbstractMotorLoader.sortLists`: ascending `primary`, ties kept in file order. */
export function sortLists(primary: number[], ...lists: unknown[][]): void {
  const order = primary.map((_, i) => i).sort((a, b) => primary[a]! - primary[b]! || a - b);
  for (const list of [primary, ...lists]) {
    const copy = [...list];
    order.forEach((from, to) => (list[to] = copy[from]));
  }
}

/**
 * Desktop's `AbstractMotorLoader.finalizeThrustCurve`. Desktop drops the t = 0 duplicate from
 * `time`/`thrust` only, shifting `lists`; a digest must leave `alignLists` off to match it.
 */
export function finalizeThrustCurve(
  time: number[],
  thrust: number[],
  lists: unknown[][] = [],
  { alignLists = false }: { alignLists?: boolean } = {},
): void {
  const eq = mathEquals;
  if (time.length === 0) return;
  if (!eq(time[0]!, 0)) {
    time.unshift(0);
    thrust.unshift(0);
    for (const l of lists) l.unshift(l[0]);
  }
  if (time.length > 1 && eq(time[0]!, 0) && eq(time[1]!, 0)) {
    time.shift();
    thrust.shift();
    if (alignLists) for (const l of lists) l.shift();
  }
  for (let i = 0; i < time.length - 1; i++) {
    while (i < time.length - 1 && eq(time[i]!, time[i + 1]!) && eq(thrust[i]!, thrust[i + 1]!)) {
      time.splice(i, 1);
      thrust.splice(i, 1);
      for (const l of lists) l.splice(i, 1);
    }
  }
  const n = time.length - 1;
  if (n > 0 && eq(time[n - 1]!, time[n]!)) {
    const drop = eq(thrust[n - 1]!, 0) ? n - 1 : eq(thrust[n]!, 0) ? n : -1;
    if (drop >= 0) for (const l of [time, thrust, ...lists]) l.splice(drop, 1);
  }
}

/** Keeps the later thrust of a step at one instant, as `motorCombine.thrustAt` reads it; desktop cannot load such a curve. */
export function finalizeCurve<P extends { time: number; thrust: number }>(input: readonly P[]): P[] {
  const time = input.map((p) => p.time);
  const thrust = input.map((p) => p.thrust);
  const points = [...input];
  sortLists(time, thrust, points);
  finalizeThrustCurve(time, thrust, [points], { alignLists: true });
  const pts = time.map((t, i) => ({ ...points[i]!, time: t, thrust: thrust[i]! }));
  return pts.filter((p, i) => i === pts.length - 1 || !mathEquals(p.time, pts[i + 1]!.time));
}

export function finalizeSamples(samples: readonly [number, number][]): [number, number][] {
  return finalizeCurve(samples.map(([time, thrust]) => ({ time, thrust }))).map((p) => [p.time, p.thrust]);
}
