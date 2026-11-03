import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { primaryMotor } from '../services/flight/flightConfigs';
import { simConditions } from '../services/flight/simulations';
import { simulateInWorker } from '../engine/simClient';
import { landingPoint } from '../services/flight/groundTrack';
import {
  normalizeSweepSpec,
  sweepLaunch,
  sweepPoints,
  type DriftSweep,
  type SweepLanding,
  type WindSweepSpec,
} from '../services/flight/windSweep';
import { unflyable, unflyableText } from '../services/flight/runnability';
import { configPowerClass } from '../services/flight/powerClass';
import { isComplete } from '../services/flight/requiredLaunch';
import { surfaceWind } from '../services/flight/windLevels';
import { flightBranches } from '../services/flight/flightColumns';
import type { WorkspaceState } from './store';
import { configOf, displayUnits } from './workspaceSelectors';
import { batchBasis, flownStill, launcherT, refusedDesign } from './runBasis';

/**
 * The drift sweep: one simulation flown over a grid of wind conditions, and
 * where each flight came down. Never persisted, and dropped with the workspace
 * (see {@link abortDriftSweep}).
 */
export interface DriftSweepSlice {
  /**
   * The last finished wind sweep, or null.
   *
   * One at a time, workspace-wide, rather than one per simulation. A sweep is a
   * few dozen flights and answers a question you ask about the row you are
   * reading right now ("where could this come down today"); keeping a stale one
   * per row would hold megabytes of landings for rows nobody is looking at, and
   * would put the reader in front of a picture they did not just ask for. It
   * carries the simulation and the design it was flown from, so the ground
   * track can tell "not this flight" from "this flight, but the rocket has
   * changed since".
   *
   * Transient by design: never persisted, and dropped with the workspace.
   */
  driftSweep: DriftSweep | null;
  /**
   * The sweep in flight: which row, and how far through. Null when none is.
   *
   * Progress is counted rather than shown per flight, because the flights are
   * not rows anybody can see: there is no table of thirty-two swept cells, and
   * there should not be. "18 of 32" is the whole of what a reader needs.
   */
  driftSweepRun: { simId: string; done: number; total: number } | null;

  /**
   * Fly a grid of wind conditions around one simulation's own, and keep where
   * each flight came down. Replaces whatever sweep was held before.
   */
  runDriftSweep: (simId: string, spec: WindSweepSpec) => Promise<void>;
  /** Stop the sweep in flight. Nothing is kept: a part-flown grid is not a region. */
  cancelDriftSweep: () => void;
  /** Throw the held sweep away. */
  clearDriftSweep: () => void;
}

/**
 * The drift sweep, if it was flown for `simId`. One sweep is held workspace-wide,
 * so it names its flight: drawing another row's landings over this one's track
 * would be a picture of two different rockets.
 */
export const selectDriftSweepFor = (s: WorkspaceState, simId: string): DriftSweep | null =>
  s.driftSweep && s.driftSweep.simId === simId ? s.driftSweep : null;

/**
 * Whether a held sweep no longer describes its row: the airframe, the row's own
 * motor, loadout, launch conditions and overrides, or the global run
 * preferences have moved since it flew. A sweep for a row that has since been
 * deleted is stale too, since there is nothing left to compare it against.
 */
export const isDriftSweepStale = (s: WorkspaceState, sweep: DriftSweep): boolean =>
  !flownStill(s, sweep.simId, { tree: sweep.tree, inputs: sweep.inputs, key: sweep.key });

/**
 * The wind sweep in flight, if any.
 *
 * Its own handle rather than `batchAbort`. A sweep and a normal run are
 * separate pieces of work with separate Cancel buttons, and sharing one
 * controller would mean canceling a sweep also kills a batch of simulations
 * somebody started beside it.
 */
let sweepAbort: AbortController | null = null;

/** Abandon the sweep in flight, for a workspace swap (see `abortRunWork`). */
export function abortDriftSweep(): void {
  sweepAbort?.abort();
  sweepAbort = null;
}

export const createDriftSweepSlice: StateCreator<WorkspaceState, [], [], DriftSweepSlice> = (set, get) => ({
  driftSweep: null,
  driftSweepRun: null,

  /**
   * Fly one simulation over a grid of wind conditions and keep where each
   * flight came down.
   *
   * Everything but the wind is the row's own: the same design, motor loadout,
   * ignition, rod, site and run preferences. That is what makes the resulting
   * spread attributable: the landings differ because the wind did, not
   * because a dozen things did at once.
   *
   * Three deliberate departures from {@link RunSlice.runSims}:
   *
   * - The results are not installed on the row. A swept flight is not the
   *   simulation's flight; it was flown under conditions the user did not
   *   type, and writing one back would replace the numbers on their flight
   *   card with a hypothetical.
   * - `series: 'summary'`, against `simConditions`'s 'full'. The only thing
   *   read from a swept flight is where its track ends, and a full series set
   *   is about 1.5 MB per flight: fifty megabytes for thirty-two flights,
   *   serialized out of a worker and never read. For the same reason no
   *   rail-length probe is asked for (`railExitMinSpeed`).
   * - One random seed for the whole grid, minted here when the preferences do
   *   not pin one. Letting each flight draw its own turbulence would mix the
   *   scatter the sweep exists to measure with random scatter, and the
   *   same sweep run twice would draw a different region for no reason the
   *   reader could see.
   *
   * A failed cell is skipped rather than failing the sweep: thirty-one
   * landings still describe a region, and the count says how many of the
   * flights asked for actually produced one.
   */
  runDriftSweep: async (simId, spec) => {
    const s = get();
    if (refusedDesign(s, set)) return;
    const sim = s.sims.find((x) => x.id === simId);
    if (!sim) return;
    // The same one refusal the Run button and the run loop share. A sweep
    // around conditions this app will not fly is a region it will not stand
    // behind, and every cell of the grid would be refused individually
    // anyway.
    const config = configOf(s.configs, sim);
    const reason = unflyable(sim, primaryMotor(s.tree, config), configPowerClass(s.tree, config, s.info?.massEmpty));
    if (reason) {
      set({ err: unflyableText({ id: sim.id, name: sim.name, reason }, launcherT(get().tree), displayUnits()) });
      return;
    }
    // Captured, because the narrowing `isComplete` gives is lost the moment
    // it has to survive into the per-flight closures below.
    const launch = sim.launch;
    if (!isComplete(launch)) return;

    const normalized = normalizeSweepSpec(spec);
    const points = sweepPoints(normalized, surfaceWind(launch).headingDeg);
    if (!points.length) return;

    // What this sweep is of. The awaits below can outlast any of it, exactly
    // as a normal batch can, and a region drawn from a rocket that has since
    // changed is worse than no region.
    const { ranOn, flownFrom, flownKey, runPrefs, seed } = batchBasis(s, sim, config);

    // A sweep supersedes whatever was held: two regions on one plan view
    // would be unreadable, and the held one answers a question that has just
    // been asked again.
    sweepAbort?.abort();
    const abort = new AbortController();
    sweepAbort = abort;
    set({ driftSweep: null, driftSweepRun: { simId, done: 0, total: points.length }, err: null });

    const landings: SweepLanding[] = [];
    let flown = 0;
    try {
      await Promise.all(
        points.map(async (point) => {
          try {
            const result = await simulateInWorker(
              {
                tree: ranOn,
                config,
                options: {
                  ...simConditions(sweepLaunch(launch, point), { ...runPrefs, randomSeed: seed }),
                  series: 'summary',
                  railExitMinSpeed: undefined,
                },
                lengthUnit: runPrefs.lengthUnit,
              },
              { signal: abort.signal },
            );
            // The same unwrapping the flight charts and the ground track use, so
            // a swept landing lands on the trace it belongs to.
            const branches = flightBranches(result);
            let landed = false;
            branches.forEach((b, i) => {
              const p = landingPoint(b.series);
              if (!p) return;
              landed = true;
              landings.push({ branch: i, east: p.east, north: p.north, ...point });
            });
            if (landed) flown++;
          } catch {
            // One refused cell is not a refused sweep. Cancellation lands
            // here too and is handled by the aborted check below, which
            // discards the whole part-flown grid.
          } finally {
            // Only while this sweep still owns the counter. A second sweep
            // replaces the first mid-flight (the run button is not gated on
            // the earlier one draining), and the first's stragglers would
            // otherwise tick the new one's progress past its own total --
            // including when it is the same row being re-swept, which is the
            // common case.
            if (sweepAbort === abort) {
              set((st) =>
                st.driftSweepRun ? { driftSweepRun: { ...st.driftSweepRun, done: st.driftSweepRun.done + 1 } } : {},
              );
            }
          }
        }),
      );
      // A canceled sweep keeps nothing. Half a grid is not half a region: the
      // cells arrive in whatever order the pool frees up, so what survives is
      // an arbitrary subset of the conditions, and a hull drawn around it
      // would understate the drift by an amount nobody could estimate.
      if (abort.signal.aborted) return;
      if (!flownStill(get(), simId, { tree: ranOn, inputs: flownFrom, key: flownKey })) return;
      if (!landings.length) {
        set({ err: i18n.t('sweep.noLandings') });
        return;
      }
      set({
        driftSweep: {
          simId,
          tree: ranOn,
          inputs: flownFrom,
          key: flownKey,
          spec: normalized,
          asked: points.length,
          flown,
          landings,
        },
      });
    } finally {
      if (sweepAbort === abort) {
        sweepAbort = null;
        set({ driftSweepRun: null });
      }
    }
  },

  cancelDriftSweep: () => {
    sweepAbort?.abort();
  },

  clearDriftSweep: () => set({ driftSweep: null }),
});
