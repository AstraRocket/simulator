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

/**
 * Flying a batch of simulations over the worker pool, with the per-row run
 * state it reports. Not persisted, and a workspace swap drops it (see
 * {@link abortRunWork}). The drift sweep (driftSweepSlice.ts) and the motor
 * guide (motorGuideSlice.ts) fly over the same pool under their own handles.
 */
export interface RunSlice {
  /** True while a batch is draining. Coarse on purpose: it gates the UI as a
   *  whole (the Run button, which becomes Cancel), where per-row detail belongs
   *  in {@link simRuns}. */
  simBusy: boolean;
  /**
   * Transient per-simulation run state: which rows are queued, which are in the
   * air, and which threw on the design they were flown against.
   *
   * Per-sim rather than a single `runningId` because the worker pool runs
   * several flights at once. It is deliberately not part of a `Simulation`,
   * which is persisted: "running" must not survive a reload.
   *
   * The failed entries carry their design because useAutoRunOutdated's "auto-run
   * outdated" re-fires whenever `simBusy` goes false while a result view is open
   * and there is no result, which is exactly the state a failed run leaves behind,
   * so a reproducible failure (a sim that times out) would retry without limit.
   * Recording the design it failed on lets the retry wait for an actual change.
   */
  simRuns: Record<string, SimRun>;

  /** Run the active simulation, under the run preferences in `simPrefs`. Resolves with how it came out. */
  runSim: () => Promise<RunOutcome>;
  /**
   * Run these simulations. They fly concurrently over the worker pool. Resolves
   * with how each requested row came out, by id; an id that names no row is
   * left out.
   */
  runSims: (ids: string[]) => Promise<Record<string, RunOutcome>>;
  /** Run every simulation whose result is missing or stale. */
  runOutdated: () => Promise<void>;
  /** Stop the batch in flight. Rows already finished keep their results. */
  cancelRun: () => void;
}

/**
 * How one row came out of a run.
 *
 * - `landed`: its result is installed and current.
 * - `failed`: the flight threw or timed out, or the design is blocked.
 * - `skipped`: refused before flying (no usable motor, launch conditions out of
 *   bounds).
 * - `canceled`: the user stopped the batch.
 * - `dropped`: it flew, but the design or the row changed before it landed, so
 *   the answer was not installed.
 * - `busy`: another batch was already running, so nothing was started.
 *
 * Every outcome but `landed` leaves the row's previous result, if any, in place,
 * so a caller that needs fresh numbers has to check for `landed`.
 */
export type RunOutcome = 'landed' | 'failed' | 'skipped' | 'canceled' | 'dropped' | 'busy';

/**
 * The batch in flight, if any, so `cancelRun` can stop it.
 *
 * Module scope rather than store state: it is a handle onto work, not something
 * anything renders, and an AbortController in the store would be a non-plain
 * value in a tree that is serialized and compared by identity.
 */
let batchAbort: AbortController | null = null;

/**
 * Abandon every flight in progress: the batch, the sweep and the guide.
 *
 * For a workspace swap (`replaceWorkspace`). A batch still running belongs to
 * the old design, and its answers would be dropped by the `ranOn` guard anyway;
 * a sweep or a guide belongs to a simulation of the design being replaced, so it
 * goes with it rather than being left pointing at an id in the outgoing
 * workspace. The run state they report is reset by the caller, in the same `set`
 * as the swap.
 */
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

  /**
   * Fly each of these simulations.
   *
   * Runs them concurrently: the sim worker pool holds several independent
   * engine instances, so a batch is bounded by the pool rather than by one
   * flight after another (`simClient.ts`). Every request is submitted at once
   * and the pool decides how many are in the air; the rows say which of them
   * are queued and which are running.
   *
   * Order is therefore not guaranteed, and nothing here depends on it. Each
   * result installs itself by id, and the batch-level reporting waits for the
   * whole thing to settle.
   */
  runSims: async (ids) => {
    const s = get();
    // One batch at a time. A second one would take over `batchAbort` and the
    // `simBusy` flag while the first is still flying: Cancel could no longer
    // reach the first, and the app would read idle with flights in the air.
    if (batchAbort) {
      set({ err: i18n.t('sim.busy') });
      return Object.fromEntries(ids.filter((id) => s.sims.some((x) => x.id === id)).map((id) => [id, 'busy' as const]));
    }
    // The globals the store mirrors, which are also what `selectOutdated`
    // compares each result against, so a landed result reads current.
    const prefs = s.simPrefs;
    // What flies and what does not is decided before anything is dispatched,
    // so the queued rows all light up together rather than one at a time.
    const plan = planRun(ids, s.sims, s.tree, s.configs, s.info?.massEmpty);
    const outcomes: Record<string, RunOutcome> = {};
    // What we are about to fly. The awaits below can outlast the design: if the
    // user edits while the pool is busy, the answers coming back describe a
    // rocket that no longer exists, and installing them would show numbers for
    // geometry that is no longer on screen.
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
    // Failures are collected and reported with the skips once the batch drains
    // (see runProblems).
    const failed: { name: string; msg: string }[] = [];
    /** Patch one row's transient run state, leaving every other row alone. */
    const setRun = (simId: string, run: SimRun | null) => set((st) => ({ simRuns: withKey(st.simRuns, simId, run) }));

    // One controller for the whole batch: Cancel is "stop what I started",
    // not "stop this row". Replaced per batch rather than reused, since an
    // AbortController cannot be un-aborted.
    const abort = new AbortController();
    batchAbort = abort;
    set({ simBusy: true, err: null });
    for (const { sim } of flying) setRun(sim.id, { phase: 'queued' });
    try {
      await Promise.all(
        flying.map(async ({ sim, launch }) => {
          // What this row is being flown from. The design has `ranOn`; this is
          // the same guard per simulation, for the motor, ignition, launch
          // conditions and run overrides that only this row carries.
          const config = configOf(get().configs, sim);
          const flownFrom = simInputs(sim, config);
          const flownKey = resultKey(ranOn, config, sim, prefs);
          try {
            // The sim runs in a Web Worker (its own engine instance), off the main
            // thread, so a ~500 ms flight never freezes the UI. The worker rebuilds
            // the rocket from the posted tree/motors, identical to the main-thread
            // build (buildConfiguredRocket), so the result matches what's on screen.
            const result = await simulateInWorker(
              {
                tree: ranOn,
                config,
                // The sim's own overrides win over the global preferences; unset keys
                // fall through, so a workspace that never touches them runs on the globals.
                options: simConditions(launch, effectivePrefs(prefs, sim.prefs)),
                // Sent with each flight: the worker's unit must not depend on
                // whether the main-thread build has caught up.
                lengthUnit: effectivePrefs(prefs, sim.prefs).lengthUnit,
              },
              // Queued and running are different states once there is a pool:
              // the client says when this one actually reached a worker.
              { onStart: () => setRun(sim.id, { phase: 'running' }), signal: abort.signal },
            );
            // The design moved on mid-batch: this answer describes the old
            // rocket, so drop it rather than install numbers for geometry that
            // is no longer on screen. The others in flight do the same. The
            // same for this row's own inputs: editing a simulation's launch
            // conditions while it flies drops the answer rather than locking
            // the editor for the duration, which leaves the row where the
            // edit left it -- outdated, with its previous numbers -- instead
            // of marking it current against conditions it no longer has. The
            // key is not compared: the result is stored with `flownKey`, so a
            // changed option reads as outdated.
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
            // Canceling is not a fault: the row goes back to what it was
            // (its old result, or nothing) rather than turning red, and the
            // error banner stays empty. Anything else is a fault.
            if (e instanceof SimCanceledError) {
              setRun(sim.id, null);
              outcomes[sim.id] = 'canceled';
              return;
            }
            // A timeout means the worker was killed mid-hang; show a friendly line
            // rather than the raw sentinel.
            const msg = e instanceof SimTimeoutError ? i18n.t('sim.timeout') : errorText(e, i18n.t);
            setRun(sim.id, { phase: 'failed', tree: ranOn });
            failed.push({ name: sim.name, msg });
            outcomes[sim.id] = 'failed';
          }
        }),
      );
      // A canceled batch says nothing further: the user stopped it, so
      // neither the skip list nor a jump to the Results tab is wanted.
      if (abort.signal.aborted) return outcomes;
      const problems = runProblems(skipped, failed, launcherT(get().tree), displayUnits());
      if (problems.length) set({ err: problems.join(' ') });
      // Show the run. Every run, one or twelve: running is asking to see the
      // answer, and having to click over to Results afterward is a step with
      // nothing behind it.
      if (get().tree !== ranOn) return outcomes;
      const landed = flying.map((f) => f.sim.id).filter((id) => get().sims.find((x) => x.id === id)?.result);
      const show = landingView(landed, selectActive(get()).id);
      if (show) set({ ...show, view: 'flight', tab: 'results' });
      return outcomes;
    } finally {
      // Only if no later batch has started: a run kicked off while this one
      // was unwinding owns the flag and the controller now.
      if (batchAbort === abort) {
        batchAbort = null;
        set({ simBusy: false });
      }
    }
  },

  /**
   * Run everything whose numbers are not current: never flown, or flown
   * against a design that has since changed.
   *
   * Deliberately independent of the tick boxes. "Bring this workspace up to
   * date" is a different question from "fly these rows", and making it reuse
   * the selection would mean clearing and restoring whatever the user had
   * ticked.
   */
  runOutdated: async () => {
    const s = get();
    const stale = s.sims.filter((x) => !x.result || selectOutdated(s, x)).map((x) => x.id);
    if (!stale.length) return;
    await get().runSims(stale);
  },

  /**
   * Stop the batch in flight.
   *
   * Rows that already landed keep their results: canceling is "stop
   * starting new ones and drop what is still going", not an undo. A row still
   * waiting for a worker is simply dropped; one already inside a worker costs
   * that worker, since a synchronous engine call cannot be interrupted any
   * other way (the pool spawns a replacement on the next run).
   */
  cancelRun: () => {
    batchAbort?.abort();
  },
});
