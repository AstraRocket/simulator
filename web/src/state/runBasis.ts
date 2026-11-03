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

/**
 * What the batch runner (runSlice.ts), the drift sweep (driftSweepSlice.ts) and
 * the motor guide (motorGuideSlice.ts) share: one rule for whether a flight's
 * answer still describes its row, and the refusals and messages all three give.
 *
 * A leaf module, for the reason sliceShared.ts is one.
 */

/** The translator for messages about the design `tree`, naming its launcher the
 *  way its guides do (services/design/launcher). */
export const launcherT = (tree: RocketTree) =>
  withLauncher(i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string, launcherKind(tree));

/**
 * Refuse a design the engine cannot build, before a drift sweep or the motor
 * guide flies anything. True when it refused, with the reason in `err`.
 */
export function refusedDesign(s: WorkspaceState, set: (patch: Partial<WorkspaceState>) => void): boolean {
  const blocker = designBlocker(s.tree);
  if (blocker) set({ err: designBlockerText(blocker, i18n.t) });
  return blocker !== null;
}

/**
 * Whether row `simId` is still the one that was flown: the same design, the
 * same row with the same inputs and, when `from.key` is given, the same result
 * key (option overrides and preferences included). The batch runner, the drift
 * sweep and the sweep's staleness test all ask it, so a flight's answer is
 * dropped or kept by one rule.
 */
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

/**
 * What a batch of flights of one simulation is of, captured before the awaits
 * that can outlast it: the tree, inputs and key {@link flownStill} checks the
 * answers against. The row's own overrides win over the globals, exactly as a
 * normal run resolves them; only then is a missing seed filled in, one for
 * every flight of the batch.
 */
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
