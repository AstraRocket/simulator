import { describe, it, expect, beforeEach, vi } from 'vitest';

const pointMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/engine/simClient', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/simClient')>()),
  optimizePointInWorker: pointMock,
}));

import { useWorkspaceStore, configOf, isOptimizerStale } from '../../src/state/store';
import { optimumOf, type OptSetup } from '../../src/state/optimizerSlice';
import { seatMotor } from '../testing/seatMotor';
import { C6 } from '../../src/engine/api';
import type { ComponentNode } from '../../src/engine/openRocketEngine';
import type { OptPoint } from '../../src/services/flight/optimizer/optGoals';
import type { OptPointPayload } from '../../src/services/flight/optimizer/optPoint';
import { optimizableParams } from '../../src/services/flight/optimizer/optParams';
import { SimCanceledError } from '../../src/engine/simClient';
import { walkNodes } from '../../src/tree/treeWalk';

const st = () => useWorkspaceStore.getState();
const simId = () => st().sims[0]!.id;
const nose = (tree = st().tree) => [...walkNodes(tree.components)].find((n) => n.type === 'nosecone') as ComponentNode;

/** Apogee peaks at a 0.15 m nose; stability rises with nose length. */
const BEST = 0.15;
function pointFor(p: OptPointPayload, outside = false): OptPoint {
  const len = nose(p.tree)['length'] as number;
  return {
    static: { cp: 0.5, cg: 0.4, calibers: 10 * len },
    distance: outside ? 1 : -1,
    figures: {
      apogee: 300 - 1e4 * (len - BEST) ** 2,
      maxVelocity: 90,
      maxAcceleration: 120,
      groundHitVelocity: 5,
      deploymentVelocity: 4,
      landingDistance: 40,
      flightTime: 60,
    },
  };
}

function setup(over: Partial<OptSetup> = {}): OptSetup {
  const s = st();
  const config = configOf(s.configs, s.sims[0]!);
  const p = optimizableParams(s.tree, config).find((x) => x.nodeId === nose().id && x.key === 'length')!;
  return {
    goal: 'apogee',
    aim: 'maximize',
    target: 0,
    limits: null,
    unit: 'calibers',
    params: [{ ...p, min: 0.05, max: 0.3 }],
    ...over,
  };
}

describe('the optimizer', () => {
  beforeEach(() => {
    pointMock.mockReset();
    pointMock.mockImplementation(async (p: OptPointPayload) => pointFor(p));
    while (st().sims.length > 1) st().deleteSim(st().sims[st().sims.length - 1]!.id);
    useWorkspaceStore.setState({ optimizer: null, optimizerRun: null, err: null });
    seatMotor(st().sims[0]!.name, C6);
  });

  it('searches the ranges it was given and finds the best design', async () => {
    await st().runOptimizer(simId(), setup());
    const o = st().optimizer!;
    expect(o.outcome).toBe('converged');
    expect(st().optimizerRun).toBeNull();
    const best = optimumOf(o)!;
    expect(Math.abs(best.values[0]! - BEST)).toBeLessThan(0.002);
    expect(best.figure).toBeGreaterThan(299.9);
    // Every flight sees the same seed, and flies only the summary.
    const seeds = new Set(pointMock.mock.calls.map(([p]) => (p as OptPointPayload).options.randomSeed));
    expect(seeds.size).toBe(1);
    expect((pointMock.mock.calls[0]![0] as OptPointPayload).options.series).toBe('summary');
  });

  it('flies nothing for a stability goal', async () => {
    await st().runOptimizer(simId(), setup({ goal: 'stability' }));
    expect(pointMock.mock.calls.every(([p]) => (p as OptPointPayload).fly === false)).toBe(true);
  });

  it('applies the best design as one undo step', async () => {
    const before = nose()['length'];
    await st().runOptimizer(simId(), setup());
    const best = optimumOf(st().optimizer!)!;
    expect(st().applyOptimum()).toBe(true);
    expect(nose()['length']).toBe(best.values[0]);
    expect(st().optimizer).toBeNull();
    st().undo();
    expect(nose()['length']).toBe(before);
  });

  it('will not apply once the design has changed since', async () => {
    await st().runOptimizer(simId(), setup());
    st().updateDesignMeta({ name: 'renamed' });
    expect(isOptimizerStale(st(), st().optimizer!)).toBe(true);
    expect(st().applyOptimum()).toBe(false);
  });

  it('has nothing to apply when no design is within the stability limits', async () => {
    pointMock.mockImplementation(async (p: OptPointPayload) => pointFor(p, true));
    await st().runOptimizer(simId(), setup({ limits: { min: 99, max: null, unit: 'calibers' } }));
    const o = st().optimizer!;
    expect(o.evaluations.some((e) => e.feasible)).toBe(false);
    expect(optimumOf(o)).toBeNull();
    expect(st().applyOptimum()).toBe(false);
  });

  it('scores a design the engine refuses as the worst, and goes on', async () => {
    let n = 0;
    pointMock.mockImplementation(async (p: OptPointPayload) => {
      if (++n === 2) throw new Error('bad geometry');
      return pointFor(p);
    });
    await st().runOptimizer(simId(), setup());
    const o = st().optimizer!;
    expect(o.outcome).toBe('converged');
    expect(o.evaluations.filter((e) => e.failed)).toHaveLength(1);
  });

  it('keeps the steps taken when canceled', async () => {
    let release: (() => void) | null = null;
    pointMock.mockImplementation(
      (p: OptPointPayload, opts: { signal: AbortSignal }) =>
        new Promise<OptPoint>((resolve, reject) => {
          if (pointMock.mock.calls.length <= 3) {
            resolve(pointFor(p));
            return;
          }
          release = () => reject(new SimCanceledError());
          opts.signal.addEventListener('abort', () => release?.());
        }),
    );
    const done = st().runOptimizer(simId(), setup());
    await vi.waitFor(() => expect(release).not.toBeNull());
    st().cancelOptimizer();
    await done;
    const o = st().optimizer!;
    expect(o.outcome).toBe('canceled');
    expect(o.path.length).toBeGreaterThan(0);
    expect(st().optimizerRun).toBeNull();
  });
});
