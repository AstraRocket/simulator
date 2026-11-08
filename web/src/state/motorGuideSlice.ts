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

export interface MotorGuideSlice {
  motorGuide: MotorGuide | null;
  motorGuideRun: { simId: string; done: number; total: number } | null;

  runMotorGuide: (simId: string, mountId: string, motors: CatalogMotor[]) => Promise<void>;
  cancelMotorGuide: () => void;
  clearMotorGuide: () => void;
  promoteGuideRow: (key: string) => string | null;
}

export const selectMotorGuideFor = (s: WorkspaceState, simId: string): MotorGuide | null =>
  s.motorGuide && s.motorGuide.simId === simId ? s.motorGuide : null;

export const isMotorGuideStale = (s: WorkspaceState, guide: MotorGuide): boolean =>
  !flownStill(s, guide.simId, { tree: guide.tree, inputs: guide.inputs, key: guide.key });

let guideAbort: AbortController | null = null;

export function abortMotorGuide(): void {
  guideAbort?.abort();
  guideAbort = null;
}

type MotorGuideSliceShared = Pick<EditSteps, 'recordStep'>;

export const createMotorGuideSlice =
  ({ recordStep }: MotorGuideSliceShared): StateCreator<WorkspaceState, [], [], MotorGuideSlice> =>
  (set, get) => ({
    motorGuide: null,
    motorGuideRun: null,

    // One turbulence seed for all flights, so row differences are the motors'.
    runMotorGuide: async (simId, mountId, motors) => {
      const s = get();
      if (refusedDesign(s, set)) return;
      const sim = s.sims.find((x) => x.id === simId);
      if (!sim || !motors.length) return;
      const config = configOf(s.configs, sim);
      // Only reasons no motor could cure: a high-power motor tightens the launcher angle per candidate.
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
            // Full series: rail-exit thrust-to-weight is not in the summary set.
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
          if (abort.signal.aborted) return;
          failed.push({ key, motor, reason: errorText(e, i18n.t) });
        } finally {
          if (guideAbort === abort) {
            set((st) =>
              st.motorGuideRun ? { motorGuideRun: { ...st.motorGuideRun, done: st.motorGuideRun.done + 1 } } : {},
            );
          }
        }
      };
      try {
        await Promise.all(motors.map(flyMotor));
        if (guideAbort !== abort) return;
        if (!flownStill(get(), simId, { tree: ranOn, inputs: flownFrom, key: flownKey })) return;
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
      if (!guide || isMotorGuideStale(s, guide)) return null;
      const row = guide.rows.find((r) => r.key === key);
      const src = s.sims.find((x) => x.id === guide.simId);
      if (!row || !src) return null;
      recordStep();
      const from = configOf(s.configs, src);
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
