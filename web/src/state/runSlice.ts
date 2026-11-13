import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { effectivePrefs, resultKey, simConditions, simInputs, type SimRun } from '../services/flight/simulations';
import { simulateInWorker, SimTimeoutError, SimCanceledError } from '../engine/simClient';
import { designBlockerText } from '../services/flight/runnability';
import { landingView, planRun, runProblems } from '../services/flight/runPlan';
import { errorText } from '../i18n/keyedError';
import { withKey } from '../services/app/objectKeys';
import type { WorkspaceState } from './store';
import { configOf, displayUnits, selectActive } from './workspaceSelectors';
import { selectOutdated } from './simSlice';
import { flownStill, launcherT } from './runBasis';
import { abortDriftSweep } from './driftSweepSlice';
import { abortMotorGuide } from './motorGuideSlice';

export interface RunSlice {
  simBusy: boolean;
  /** Failed entries carry their design, or auto-run would retry a reproducible failure forever. */
  simRuns: Record<string, SimRun>;

  runSim: () => Promise<RunOutcome>;
  runSims: (ids: string[]) => Promise<Record<string, RunOutcome>>;
  runOutdated: () => Promise<void>;
  cancelRun: () => void;
}

// Every outcome but `landed` leaves the previous result in place.
export type RunOutcome = 'landed' | 'failed' | 'skipped' | 'canceled' | 'dropped' | 'busy';

let batchAbort: AbortController | null = null;

/** Every job `abortRunWork` stops; a new job goes in both. */
export const jobRunning = (s: Pick<WorkspaceState, 'simBusy' | 'driftSweepRun' | 'motorGuideRun'>): boolean =>
  s.simBusy || s.driftSweepRun !== null || s.motorGuideRun !== null;

// The caller resets the run state in the same `set` as the workspace swap.
export function abortRunWork(): void {
  batchAbort?.abort();
  batchAbort = null;
  abortDriftSweep();
  abortMotorGuide();
}

export const createRunSlice: StateCreator<WorkspaceState, [], [], RunSlice> = (set, get) => ({
  simBusy: false,
  simRuns: {},

  runSim: async () => {
    const id = selectActive(get()).id;
    return (await get().runSims([id]))[id] ?? 'skipped';
  },

  runSims: async (ids) => {
    const s = get();
    // One batch at a time: a second would take over `batchAbort`, leaving the first uncancelable.
    if (batchAbort) {
      set({ err: i18n.t('sim.busy') });
      return Object.fromEntries(ids.filter((id) => s.sims.some((x) => x.id === id)).map((id) => [id, 'busy' as const]));
    }
    const prefs = s.simPrefs;
    const plan = planRun(ids, s.sims, s.tree, s.configs, s.info?.massEmpty);
    const outcomes: Record<string, RunOutcome> = {};
    const ranOn = s.tree;
    if (plan.failedIds.length) {
      const failedOn = { phase: 'failed', tree: ranOn } as const;
      set((st) => ({
        simRuns: { ...st.simRuns, ...Object.fromEntries(plan.failedIds.map((id) => [id, failedOn])) },
      }));
    }
    if (plan.blocker) {
      set({ err: designBlockerText(plan.blocker, i18n.t) });
      for (const id of plan.failedIds) outcomes[id] = 'failed';
      return outcomes;
    }
    const { flying, skipped } = plan;
    for (const u of skipped) outcomes[u.id] = 'skipped';
    if (!flying.length) {
      if (skipped.length) set({ err: runProblems(skipped, [], launcherT(get().tree), displayUnits()).join(' ') });
      return outcomes;
    }
    const failed: { name: string; msg: string }[] = [];
    const setRun = (simId: string, run: SimRun | null) => set((st) => ({ simRuns: withKey(st.simRuns, simId, run) }));

    // New per batch: an AbortController cannot be un-aborted.
    const abort = new AbortController();
    batchAbort = abort;
    set({ simBusy: true, err: null });
    for (const { sim } of flying) setRun(sim.id, { phase: 'queued' });
    try {
      await Promise.all(
        flying.map(async ({ sim, launch }) => {
          const config = configOf(get().configs, sim);
          const flownFrom = simInputs(sim, config);
          const flownKey = resultKey(ranOn, config, sim, prefs);
          try {
            const result = await simulateInWorker(
              {
                tree: ranOn,
                config,
                options: simConditions(launch, effectivePrefs(prefs, sim.prefs)),
                // Sent per flight: the main-thread build may not have caught up.
                lengthUnit: effectivePrefs(prefs, sim.prefs).lengthUnit,
              },
              { onStart: () => setRun(sim.id, { phase: 'running' }), signal: abort.signal },
            );
            // Key not compared: the result is stored with `flownKey`, so a changed option reads outdated.
            if (!flownStill(get(), sim.id, { tree: ranOn, inputs: flownFrom })) {
              setRun(sim.id, null);
              outcomes[sim.id] = 'dropped';
              return;
            }
            setRun(sim.id, null);
            outcomes[sim.id] = 'landed';
            set((st) => ({
              sims: st.sims.map((x) =>
                x.id === sim.id
                  ? { ...x, result, resultKey: flownKey, resultLaunch: launch, fileSummary: undefined }
                  : x,
              ),
            }));
          } catch (e) {
            if (e instanceof SimCanceledError) {
              setRun(sim.id, null);
              outcomes[sim.id] = 'canceled';
              return;
            }
            const msg = e instanceof SimTimeoutError ? i18n.t('sim.timeout') : errorText(e, i18n.t);
            setRun(sim.id, { phase: 'failed', tree: ranOn });
            failed.push({ name: sim.name, msg });
            outcomes[sim.id] = 'failed';
          }
        }),
      );
      if (abort.signal.aborted) return outcomes;
      const problems = runProblems(skipped, failed, launcherT(get().tree), displayUnits());
      if (problems.length) set({ err: problems.join(' ') });
      if (get().tree !== ranOn) return outcomes;
      const landed = flying.map((f) => f.sim.id).filter((id) => get().sims.find((x) => x.id === id)?.result);
      const show = landingView(landed, selectActive(get()).id);
      if (show) set({ ...show, view: 'flight', tab: 'results' });
      return outcomes;
    } finally {
      // A later batch may already own the flag and controller.
      if (batchAbort === abort) {
        batchAbort = null;
        set({ simBusy: false });
      }
    }
  },

  runOutdated: async () => {
    const s = get();
    const stale = s.sims.filter((x) => !x.result || selectOutdated(s, x)).map((x) => x.id);
    if (!stale.length) return;
    await get().runSims(stale);
  },

  /** Kills the worker: a synchronous engine call cannot be interrupted otherwise. */
  cancelRun: () => {
    batchAbort?.abort();
  },
});
