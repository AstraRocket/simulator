import { describe, it, expect } from 'vitest';
import { search, STEP_SIZE_LIMIT, type Vec } from '../../../src/services/flight/optimizer/optSearch';

async function run(x0: number[], f: (x: Vec) => number, stopAfter = Infinity) {
  const asked: Vec[] = [];
  const result = await search(x0, {
    evaluate: async (points) => {
      asked.push(...points);
      return points.map(f);
    },
    onStep: () => {},
    stopped: () => asked.length >= stopAfter,
  });
  return { ...result, asked };
}

describe('the optimizer search', () => {
  it('finds one parameter by golden section, to within the step limit', async () => {
    const r = await run([0.9], ([x]) => (x! - 0.3) ** 2);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.best[0]! - 0.3)).toBeLessThan(STEP_SIZE_LIMIT);
  });

  it('finds several parameters by multidirectional search', async () => {
    const r = await run([0.9, 0.1], ([x, y]) => (x! - 0.2) ** 2 + (y! - 0.7) ** 2);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.best[0]! - 0.2)).toBeLessThan(0.01);
    expect(Math.abs(r.best[1]! - 0.7)).toBeLessThan(0.01);
  });

  it('never leaves the range, even when the best lies past its end', async () => {
    const r = await run([0.5, 0.5], ([x, y]) => -(x! + y!));
    expect(r.asked.every((p) => p.every((v) => v >= 0 && v <= 1))).toBe(true);
    expect(r.best).toEqual([1, 1]);
  });

  it('keeps the start when nothing it tries scores better', async () => {
    const start = [0.4, 0.6];
    const r = await run(start, (p) => (p[0] === start[0] && p[1] === start[1] ? 0 : 1));
    expect(r.best).toEqual(start);
    expect(r.score).toBe(0);
  });

  it('stops early when told, keeping the best so far', async () => {
    const r = await run([0.9, 0.1], ([x, y]) => (x! - 0.2) ** 2 + (y! - 0.7) ** 2, 5);
    expect(r.converged).toBe(false);
    expect(r.asked.length).toBeLessThan(12);
  });
});
