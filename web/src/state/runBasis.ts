import i18n from '../i18n';
import { launcherKind, withLauncher } from '../services/design/launcher';
import type { RocketTree } from '../engine/openRocketEngine';
import type { FlightConfig } from '../services/flight/flightConfigs';
import {
  effectivePrefs,
  freshSeed,
  resultKey,
  sameSimInputs,
  simInputs,
  type SimInputs,
  type Simulation,
} from '../services/flight/simulations';
import { designBlocker, designBlockerText } from '../services/flight/runnability';
import type { WorkspaceState } from './store';
import { configOf } from './workspaceSelectors';

// A leaf module: the slices load while store.ts does.

export const launcherT = (tree: RocketTree) =>
  withLauncher(i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string, launcherKind(tree));

export function refusedDesign(s: WorkspaceState, set: (patch: Partial<WorkspaceState>) => void): boolean {
  const blocker = designBlocker(s.tree);
  if (blocker) set({ err: designBlockerText(blocker, i18n.t) });
  return blocker !== null;
}

export function flownStill(
  s: WorkspaceState,
  simId: string,
  from: { tree: RocketTree; inputs: SimInputs; key?: string },
): boolean {
  if (s.tree !== from.tree) return false;
  const sim = s.sims.find((x) => x.id === simId);
  if (!sim) return false;
  const config = configOf(s.configs, sim);
  if (!sameSimInputs(from.inputs, simInputs(sim, config))) return false;
  return from.key === undefined || resultKey(s.tree, config, sim, s.simPrefs) === from.key;
}

// Capture before any await: the state can change underneath it.
export function batchBasis(s: WorkspaceState, sim: Simulation, config: FlightConfig) {
  const runPrefs = effectivePrefs(s.simPrefs, sim.prefs);
  return {
    ranOn: s.tree,
    flownFrom: simInputs(sim, config),
    flownKey: resultKey(s.tree, config, sim, s.simPrefs),
    runPrefs,
    seed: runPrefs.randomSeed ?? freshSeed(),
  };
}
