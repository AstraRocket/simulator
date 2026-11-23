import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { simConditions } from '../services/flight/simulations';
import { aeroTablesOf } from '../services/flight/aeroTables';
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
import { surfaceWind } from '../services/flight/windLevels';
import { flightBranches } from '../services/flight/flightColumns';
import type { WorkspaceState } from './store';
import { batchBasis, flownStill, flyableSim, jobSlot } from './runBasis';

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
const sweepJob = jobSlot('driftSweepRun');

export function abortDriftSweep(): void {
  sweepJob.abort();
}

export const createDriftSweepSlice: StateCreator<WorkspaceState, [], [], DriftSweepSlice> = (set, get) => ({
  driftSweep: null,
  driftSweepRun: null,

  // One seed for the whole grid, so turbulence scatter does not mix with the wind scatter.
  runDriftSweep: async (simId, spec) => {
    const s = get();
    const flyable = flyableSim(s, set, simId);
    if (!flyable) return;
    const { sim, config, launch } = flyable;

    const normalized = normalizeSweepSpec(spec);
    const points = sweepPoints(normalized, surfaceWind(launch).headingDeg);
    if (!points.length) return;

    const { ranOn, flownFrom, flownKey, runPrefs, seed } = batchBasis(s, sim, config);

    const job = sweepJob.claim(set, simId, points.length, { driftSweep: null });

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
                  ...simConditions(
                    sweepLaunch(launch, point),
                    { ...runPrefs, randomSeed: seed },
                    aeroTablesOf(sim.xmlExtra),
                  ),
                  series: 'summary',
                  railExitMinSpeed: undefined,
                },
                lengthUnit: runPrefs.lengthUnit,
              },
              { signal: job.signal },
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
            job.tick();
          }
        }),
      );
      // A partial hull would understate the drift: cells finish in arbitrary order.
      if (job.signal.aborted) return;
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
      job.release();
    }
  },

  cancelDriftSweep: () => sweepJob.cancel(),

  clearDriftSweep: () => set({ driftSweep: null }),
});
