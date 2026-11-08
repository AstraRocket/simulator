import { configOf, selectOutdated, useWorkspaceStore, type WorkspaceState } from '../../src/state/store';
import { resultKey, type Simulation } from '../../src/services/flight/simulations';

// A planted `result` without its `resultKey` reads outdated from the start.
export const asFlown = (st: WorkspaceState, sim: Simulation): Simulation => ({
  ...sim,
  resultKey: resultKey(st.tree, configOf(st.configs, sim), sim, st.simPrefs),
});

export const isStale = (sim: Simulation): boolean => selectOutdated(useWorkspaceStore.getState(), sim);
