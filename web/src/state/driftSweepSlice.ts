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

export interface DriftSweepSlice {
  driftSweep: DriftSweep | null;
  driftSweepRun: { simId: string; done: number; total: number } | null;

  runDriftSweep: (simId: string, spec: WindSweepSpec) => Promise<void>;
  cancelDriftSweep: () => void;
  clearDriftSweep: () => void;
}

export const selectDriftSweepFor = (s: WorkspaceState, simId: string): DriftSweep | null =>
  s.driftSweep && s.driftSweep.simId === simId ? s.driftSweep : null;

export const isDriftSweepStale = (s: WorkspaceState, sweep: DriftSweep): boolean =>
  !flownStill(s, sweep.simId, { tree: sweep.tree, inputs: sweep.inputs, key: sweep.key });

/** Separate from `batchAbort`, so canceling a sweep does not kill a batch run beside it. */
let sweepAbort: AbortController | null = null;

export function abortDriftSweep(): void {
  sweepAbort?.abort();
  sweepAbort = null;
}

export const createDriftSweepSlice: StateCreator<WorkspaceState, [], [], DriftSweepSlice> = (set, get) => ({
  driftSweep: null,
  driftSweepRun: null,

  // One seed for the whole grid, so turbulence scatter does not mix with the wind scatter.
  runDriftSweep: async (simId, spec) => {
    const s = get();
    if (refusedDesign(s, set)) return;
    const sim = s.sims.find((x) => x.id === simId);
    if (!sim) return;
    const config = configOf(s.configs, sim);
    const reason = unflyable(sim, primaryMotor(s.tree, config), configPowerClass(s.tree, config, s.info?.massEmpty));
    if (reason) {
      set({ err: unflyableText({ id: sim.id, name: sim.name, reason }, launcherT(get().tree), displayUnits()) });
      return;
    }
    // Captured: the `isComplete` narrowing would be lost inside the closures below.
    const launch = sim.launch;
    if (!isComplete(launch)) return;

    const normalized = normalizeSweepSpec(spec);
    const points = sweepPoints(normalized, surfaceWind(launch).headingDeg);
    if (!points.length) return;

    const { ranOn, flownFrom, flownKey, runPrefs, seed } = batchBasis(s, sim, config);

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
            // One refused cell is not a refused sweep.
          } finally {
            // A replacing sweep's counter must not be ticked by this one's stragglers.
            if (sweepAbort === abort) {
              set((st) =>
                st.driftSweepRun ? { driftSweepRun: { ...st.driftSweepRun, done: st.driftSweepRun.done + 1 } } : {},
              );
            }
          }
        }),
      );
      // A partial hull would understate the drift: cells finish in arbitrary order.
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
