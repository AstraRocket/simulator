import type { StateCreator } from 'zustand';
import type { RocketTree } from '../engine/openRocketEngine';
import { optimizePointInWorker, SimCanceledError } from '../engine/simClient';
import { reconcileConfigs } from '../services/flight/flightConfigs';
import { simConditions, type SimInputs } from '../services/flight/simulations';
import { aeroTablesOf } from '../services/flight/aeroTables';
import {
  feasible,
  goalFigure,
  pointScore,
  stabilityOf,
  type OptAim,
  type OptGoal,
  type OptPoint,
  type StabilityLimits,
  type StabilityUnit,
} from '../services/flight/optimizer/optGoals';
import { applyParams, fromScaled, toScaled, type OptParam } from '../services/flight/optimizer/optParams';
import { clamp01, search, type Vec } from '../services/flight/optimizer/optSearch';
import type { WorkspaceState } from './store';
import { configOf } from './workspaceSelectors';
import type { EditSteps } from './sliceShared';
import { batchBasis, flownStill, flyableSim, jobSlot } from './runBasis';

/** Desktop has no cap; a search that keeps finding better points could otherwise fly on and on. */
export const MAX_OPT_POINTS = 500;

export interface OptSetup {
  goal: OptGoal;
  aim: OptAim;
  /** SI, or calibers; read only when `aim` is `seek`. */
  target: number;
  limits: StabilityLimits | null;
  unit: StabilityUnit;
  /** The ticked parameters, with the ranges asked for. */
  params: OptParam[];
}

/** One design tried. `values` are SI, in `setup.params` order; the figures are NaN when unknown. */
export interface OptEval {
  values: number[];
  stability: number;
  figure: number;
  feasible: boolean;
  failed: boolean;
}

export type OptOutcome = 'running' | 'converged' | 'canceled' | 'limit';

export interface Optimization {
  simId: string;
  configId: string;
  tree: RocketTree;
  inputs: SimInputs;
  key: string;
  setup: OptSetup;
  /** Every design tried, in the order flown: the CSV. */
  evaluations: OptEval[];
  /** Each new best, the start first. */
  path: OptEval[];
  /** The search's step, as a fraction of each range. */
  step: number;
  outcome: OptOutcome;
}

export interface OptimizerSlice {
  optimizer: Optimization | null;
  optimizerRun: { simId: string; done: number; total: number } | null;

  runOptimizer: (simId: string, setup: OptSetup) => Promise<void>;
  cancelOptimizer: () => void;
  clearOptimizer: () => void;
  /** One undo step; false when there is nothing current to apply. */
  applyOptimum: () => boolean;
}

export const selectOptimizerFor = (s: WorkspaceState, simId: string): Optimization | null =>
  s.optimizer && s.optimizer.simId === simId ? s.optimizer : null;

export const isOptimizerStale = (s: WorkspaceState, o: Optimization): boolean =>
  !flownStill(s, o.simId, { tree: o.tree, inputs: o.inputs, key: o.key });

/** The best design found, unless it is the start: nothing to apply then. */
export function optimumOf(o: Optimization): OptEval | null {
  const best = o.path[o.path.length - 1];
  return best && o.path.length > 1 && best.feasible ? best : null;
}

const optJob = jobSlot('optimizerRun');

export function abortOptimizer(): void {
  optJob.abort();
}

const pointKey = (s: Vec): string => s.map((v) => v.toFixed(9)).join(',');

export const createOptimizerSlice =
  ({ recordStep }: Pick<EditSteps, 'recordStep'>): StateCreator<WorkspaceState, [], [], OptimizerSlice> =>
  (set, get) => ({
    optimizer: null,
    optimizerRun: null,

    // One turbulence seed for every point, so the search follows the design, not the gusts.
    runOptimizer: async (simId, setup) => {
      if (!setup.params.length) return;
      const s = get();
      const flyable = flyableSim(s, set, simId);
      if (!flyable) return;
      const { sim, config, launch } = flyable;

      const { ranOn, flownFrom, flownKey, runPrefs, seed } = batchBasis(s, sim, config);
      const options = {
        ...simConditions(launch, { ...runPrefs, randomSeed: seed }, aeroTablesOf(sim.xmlExtra)),
        series: 'summary' as const,
        railExitMinSpeed: undefined,
      };
      const { params, goal, aim, target, limits, unit } = setup;
      const fly = goal !== 'stability';

      const job = optJob.claim(set, simId, MAX_OPT_POINTS, { optimizer: null });
      const evaluations: OptEval[] = [];
      const byKey = new Map<string, OptEval>();
      const path: OptEval[] = [];
      const cache = new Map<string, Promise<number>>();
      let limitHit = false;
      let step = 0;

      const publish = (outcome: OptOutcome) => {
        if (!job.mine()) return;
        set({
          optimizer: {
            simId,
            configId: config.id,
            tree: ranOn,
            inputs: flownFrom,
            key: flownKey,
            setup,
            evaluations: [...evaluations],
            path: [...path],
            step,
            outcome,
          },
        });
      };

      const record = (key: string, values: number[], point: OptPoint | null): OptEval => {
        const row: OptEval = {
          values,
          stability: point ? stabilityOf(point.static, unit) : NaN,
          figure: point ? goalFigure(goal, point, unit) : NaN,
          feasible: feasible(point),
          failed: point === null,
        };
        evaluations.push(row);
        byKey.set(key, row);
        return row;
      };

      const evalOne = (scaled: Vec): Promise<number> => {
        const key = pointKey(scaled);
        const hit = cache.get(key);
        if (hit) return hit;
        if (cache.size >= MAX_OPT_POINTS) {
          limitHit = true;
          return Promise.resolve(Number.MAX_VALUE);
        }
        const values = params.map((p, i) => fromScaled(p, scaled[i]!));
        const built = applyParams(ranOn, config, params, values);
        const pending = optimizePointInWorker(
          { tree: built.tree, config: built.config, options, lengthUnit: runPrefs.lengthUnit, limits, fly },
          { signal: job.signal },
        )
          .then(
            (point) => {
              record(key, values, point);
              return pointScore(point, goal, aim, target, unit);
            },
            (e: unknown) => {
              if (e instanceof SimCanceledError) throw e;
              // A design the engine refuses scores worst, as desktop scores a NaN.
              record(key, values, null);
              return Number.MAX_VALUE;
            },
          )
          .finally(() => job.tick());
        cache.set(key, pending);
        return pending;
      };

      const x0 = params.map((p) => clamp01(toScaled(p, p.current)));
      try {
        const result = await search(x0, {
          evaluate: (points) => Promise.all(points.map(evalOne)),
          onStep: (best, _score, size) => {
            step = size;
            const row = byKey.get(pointKey(best));
            if (row && path[path.length - 1] !== row) path.push(row);
            publish('running');
          },
          stopped: () => job.signal.aborted || limitHit,
        });
        publish(result.converged ? 'converged' : limitHit ? 'limit' : 'canceled');
      } catch (e) {
        if (!(e instanceof SimCanceledError)) throw e;
        publish('canceled');
      } finally {
        job.release();
      }
    },

    cancelOptimizer: () => optJob.cancel(),

    clearOptimizer: () => set({ optimizer: null }),

    applyOptimum: () => {
      const s = get();
      const o = s.optimizer;
      if (!o || s.optimizerRun || isOptimizerStale(s, o)) return false;
      const best = optimumOf(o);
      const sim = s.sims.find((x) => x.id === o.simId);
      if (!best || !sim) return false;
      const config = configOf(s.configs, sim);
      const next = applyParams(s.tree, config, o.setup.params, best.values);
      recordStep();
      const configs = s.configs.map((c) => (c.id === config.id ? next.config : c));
      set({ tree: next.tree, configs: reconcileConfigs(next.tree, configs), optimizer: null });
      return true;
    },
  });
