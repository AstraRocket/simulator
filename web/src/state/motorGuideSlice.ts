import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { newFlightConfig, primaryMotor, type FlightConfig } from '../services/flight/flightConfigs';
import { newSimulation, simConditions } from '../services/flight/simulations';
import { simulateInWorker, SimCanceledError } from '../engine/simClient';
import {
  guideConfig,
  guideRow,
  nearestDelay,
  probeDelay,
  type GuideFailure,
  type GuideRow,
  type MotorGuide,
} from '../services/flight/motorGuide';
import { hasLocalCurve, type CatalogMotor } from '../services/motors/motorDb';
import { catalogMotorSpec } from '../services/motors/motorSpec';
import { keyOf } from '../services/motors/motorKey';
import { motorName } from '../services/motors/motorName';
import { unflyable, unflyableText } from '../services/flight/runnability';
import { configPowerClass } from '../services/flight/powerClass';
import { isComplete } from '../services/flight/requiredLaunch';
import { errorText } from '../i18n/keyedError';
import type { WorkspaceState } from './store';
import { configOf, displayUnits } from './workspaceSelectors';
import { uniqueSimName } from './simSlice';
import { insertAfter, type EditSteps } from './sliceShared';
import { batchBasis, flownStill, launcherT, refusedDesign } from './runBasis';

/**
 * The motor guide: candidate motors flown in one mount of one simulation, as
 * throwaway configurations, and the table of how each flew. Never persisted,
 * and dropped with the workspace (see {@link abortMotorGuide}).
 */
export interface MotorGuideSlice {
  /**
   * The last finished motor guide, or null.
   *
   * Held like the drift sweep: one workspace-wide, never persisted, dropped with
   * the workspace, and carrying what it was flown on so the dialog can say when
   * the design or the simulation has moved since.
   */
  motorGuide: MotorGuide | null;
  /** The guide in flight: which row, and how many candidates are done. Null when none is. */
  motorGuideRun: { simId: string; done: number; total: number } | null;

  /**
   * Fly each of `motors` in mount `mountId` of simulation `simId`, as throwaway
   * configurations, and hold the table (see services/flight/motorGuide).
   */
  runMotorGuide: (simId: string, mountId: string, motors: CatalogMotor[]) => Promise<void>;
  cancelMotorGuide: () => void;
  clearMotorGuide: () => void;
  /**
   * Keep one guide row: a new configuration flying that motor and a simulation
   * of it beside the one the guide was flown from, made active. Returns the new
   * simulation's id, or null when the row is gone or the guide is stale.
   */
  promoteGuideRow: (key: string) => string | null;
}

/** The motor guide, if it was flown for `simId`. */
export const selectMotorGuideFor = (s: WorkspaceState, simId: string): MotorGuide | null =>
  s.motorGuide && s.motorGuide.simId === simId ? s.motorGuide : null;

/** Whether a held guide no longer describes its row, by the drift sweep's rule. */
export const isMotorGuideStale = (s: WorkspaceState, guide: MotorGuide): boolean =>
  !flownStill(s, guide.simId, { tree: guide.tree, inputs: guide.inputs, key: guide.key });

/** The motor guide in flight, if any: its own handle, for the reason the sweep has one. */
let guideAbort: AbortController | null = null;

/** Abandon the guide in flight, for a workspace swap (see `abortRunWork`). */
export function abortMotorGuide(): void {
  guideAbort?.abort();
  guideAbort = null;
}

/** What the guide's actions share with the editing core in store.ts. */
type MotorGuideSliceShared = Pick<EditSteps, 'recordStep'>;

export const createMotorGuideSlice =
  ({ recordStep }: MotorGuideSliceShared): StateCreator<WorkspaceState, [], [], MotorGuideSlice> =>
  (set, get) => ({
    motorGuide: null,
    motorGuideRun: null,

    /**
     * The motor guide. Refused up front by the checks the Run button makes that
     * would refuse every candidate alike, and each candidate is then refused on
     * its own when a single run of it would be: a motor that makes the rocket
     * high power tightens the launcher angle the codes allow.
     *
     * A candidate is flown once at its probe delay, which gives the kernel's
     * optimum, and again at its nearest charge when that differs, so the
     * deployment speed in its row is the one that charge gives. One turbulence
     * seed for every flight, so the differences between rows are the motors'.
     *
     * Canceling keeps the rows already flown: unlike a drift sweep, whose region
     * is only meaningful whole, each row stands on its own, and the guide says
     * it is partial.
     */
    runMotorGuide: async (simId, mountId, motors) => {
      const s = get();
      if (refusedDesign(s, set)) return;
      const sim = s.sims.find((x) => x.id === simId);
      if (!sim || !motors.length) return;
      const config = configOf(s.configs, sim);
      // The candidate supplies the motor and can change the rocket's class, so
      // only the reasons no motor could cure are judged here.
      const own = unflyable(sim, primaryMotor(s.tree, config), configPowerClass(s.tree, config, s.info?.massEmpty));
      if (own && (own.kind === 'incomplete' || own.kind === 'windProfile')) {
        set({ err: unflyableText({ id: sim.id, name: sim.name, reason: own }, launcherT(get().tree), displayUnits()) });
        return;
      }
      const launch = sim.launch;
      if (!isComplete(launch)) return;

      const massEmpty = s.info?.massEmpty;
      const { ranOn, flownFrom, flownKey, runPrefs, seed } = batchBasis(s, sim, config);

      guideAbort?.abort();
      const abort = new AbortController();
      guideAbort = abort;
      set({ motorGuide: null, motorGuideRun: { simId, done: 0, total: motors.length }, err: null });

      const rows: GuideRow[] = [];
      const failed: GuideFailure[] = [];
      const fly = async (motor: CatalogMotor, key: string, delay: number): Promise<GuideRow> => {
        // Named as not flown before anything else is tried: without a curve
        // there is nothing to fly.
        if (!hasLocalCurve(motor)) throw new Error(i18n.t('guide.noCurve'));
        const spec = await catalogMotorSpec(motor, delay);
        if (abort.signal.aborted) throw new SimCanceledError();
        const cfg = guideConfig(config, mountId, spec);
        const refused = unflyable(sim, primaryMotor(ranOn, cfg), configPowerClass(ranOn, cfg, massEmpty));
        if (refused) {
          const named = { id: sim.id, name: motorName(motor), reason: refused };
          throw new Error(unflyableText(named, launcherT(get().tree), displayUnits()));
        }
        const result = await simulateInWorker(
          {
            tree: ranOn,
            config: cfg,
            // Full series, which `simConditions` asks for: the thrust-to-weight
            // at rail exit is one of the series the summary set leaves out. Only
            // the row's figures are kept, so the payload goes once it is read.
            options: simConditions(launch, { ...runPrefs, randomSeed: seed }),
            lengthUnit: runPrefs.lengthUnit,
          },
          { signal: abort.signal },
        );
        return guideRow(motor, key, spec, result);
      };
      const flyMotor = async (motor: CatalogMotor) => {
        const key = keyOf(motor);
        try {
          const first = await fly(motor, key, probeDelay(motor));
          const nearest = nearestDelay(motor, first.optimumDelay);
          rows.push(nearest == null || nearest === first.delay ? first : await fly(motor, key, nearest));
        } catch (e) {
          // A canceled candidate is not a failed one; it is simply not in the table.
          if (abort.signal.aborted) return;
          failed.push({ key, motor, reason: errorText(e, i18n.t) });
        } finally {
          // Only while this guide still owns the counter, as the sweep's does.
          if (guideAbort === abort) {
            set((st) =>
              st.motorGuideRun ? { motorGuideRun: { ...st.motorGuideRun, done: st.motorGuideRun.done + 1 } } : {},
            );
          }
        }
      };
      try {
        await Promise.all(motors.map(flyMotor));
        // Superseded by another guide, or the workspace replaced: nothing to keep.
        if (guideAbort !== abort) return;
        // The design or the row moved while the flights were out: these rows
        // describe a rocket that is no longer on screen.
        if (!flownStill(get(), simId, { tree: ranOn, inputs: flownFrom, key: flownKey })) return;
        // In the order asked for, which is the order of the list they were picked
        // from, rather than the order the pool happened to finish them in.
        const order = new Map(motors.map((m, i) => [keyOf(m), i]));
        const byAsked = (a: { key: string }, b: { key: string }) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0);
        set({
          motorGuide: {
            simId,
            mountId,
            tree: ranOn,
            inputs: flownFrom,
            key: flownKey,
            asked: motors.length,
            partial: abort.signal.aborted,
            rows: rows.sort(byAsked),
            failed: failed.sort(byAsked),
          },
        });
      } finally {
        if (guideAbort === abort) {
          guideAbort = null;
          set({ motorGuideRun: null });
        }
      }
    },

    cancelMotorGuide: () => {
      guideAbort?.abort();
    },

    clearMotorGuide: () => set({ motorGuide: null }),

    promoteGuideRow: (key) => {
      const s = get();
      const guide = s.motorGuide;
      // A stale guide's rows describe a rocket that has since changed; keeping
      // one would make a simulation whose first run disagrees with its row.
      if (!guide || isMotorGuideStale(s, guide)) return null;
      const row = guide.rows.find((r) => r.key === key);
      const src = s.sims.find((x) => x.id === guide.simId);
      if (!row || !src) return null;
      recordStep();
      const from = configOf(s.configs, src);
      // Everything the guide flew it with, recovery and staging overrides
      // included, as a copied configuration carries them: the kept row must fly
      // the flight its table row described. Unnamed, so it reads as its motors.
      const made: FlightConfig = {
        ...guideConfig(from, guide.mountId, row.spec),
        id: newFlightConfig().id,
        name: null,
      };
      const label = i18n.t('guide.simName', { name: src.name, motor: motorName(row.motor) });
      const name = uniqueSimName(s.sims, (n) => (n === 1 ? label : `${label} ${n}`), 1);
      const sim0 = { ...newSimulation(name, made.id, src.launch), prefs: src.prefs };
      set({
        configs: insertAfter(s.configs, from.id, made),
        sims: insertAfter(s.sims, src.id, sim0),
        activeId: sim0.id,
      });
      return sim0.id;
    },
  });
