import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { newFlightConfig, primaryMotor, type FlightConfig } from '../services/flight/flightConfigs';
import { newSimulation, nextFreeName, simConditions } from '../services/flight/simulations';
import { simulateInWorker, SimCanceledError } from '../engine/simClient';
import { flyGuideBatch, guideConfig, guideRow, type GuideRow, type MotorGuide } from '../services/flight/motorGuide';
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
import { insertAfter, type EditSteps } from './sliceShared';
import { batchBasis, flownStill, jobSlot, launcherT, refusedDesign } from './runBasis';

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

const guideJob = jobSlot('motorGuideRun');

export function abortMotorGuide(): void {
  guideJob.abort();
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

      const job = guideJob.claim(set, simId, motors.length, { motorGuide: null });

      const fly = async (motor: CatalogMotor, delay: number): Promise<GuideRow> => {
        if (!hasLocalCurve(motor)) throw new Error(i18n.t('guide.noCurve'));
        const spec = await catalogMotorSpec(motor, delay);
        if (job.signal.aborted) throw new SimCanceledError();
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
          { signal: job.signal },
        );
        return guideRow(motor, keyOf(motor), spec, result);
      };
      try {
        const batch = await flyGuideBatch(motors, {
          fly,
          refly: true,
          row: (_motor, _key, flown) => flown,
          signal: job.signal,
          onSettled: () => job.tick(),
          reason: (e) => errorText(e, i18n.t),
        });
        if (!job.mine()) return;
        if (!flownStill(get(), simId, { tree: ranOn, inputs: flownFrom, key: flownKey })) return;
        set({
          motorGuide: {
            simId,
            mountId,
            tree: ranOn,
            inputs: flownFrom,
            key: flownKey,
            asked: motors.length,
            ...batch,
          },
        });
      } finally {
        job.release();
      }
    },

    cancelMotorGuide: () => guideJob.cancel(),

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
      const name = nextFreeName(
        label,
        s.sims.map((x) => x.name),
      );
      const sim0 = { ...newSimulation(name, made.id, src.launch), prefs: src.prefs };
      set({
        configs: insertAfter(s.configs, from.id, made),
        sims: insertAfter(s.sims, src.id, sim0),
        activeId: sim0.id,
      });
      return sim0.id;
    },
  });
