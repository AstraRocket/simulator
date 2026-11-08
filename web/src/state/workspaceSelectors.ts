// Only a type edge back to store.ts: the slices read these while store.ts is still loading.
import i18n from '../i18n';
import type { RocketTree } from '../engine/openRocketEngine';
import { configFor, newFlightConfig, reconcileConfig, type FlightConfig } from '../services/flight/flightConfigs';
import { repairedText, type RepairedValue } from '../services/design/repairValues';
import type { Simulation, SimPrefs } from '../services/flight/simulations';
import { loadSettings, type Settings } from '../services/storage/settings';
import type { Workspace } from '../services/storage/workspaceStore';
import { designNameOf } from '../services/app/appInfo';
import { unitSymbols } from '../prefs/units';
import type { WorkspaceState } from './store';

export const displayUnits = () => {
  const s = loadSettings();
  return unitSymbols(s.units, s.unitOverrides);
};

// Length unit from settings: the kernel's own unit lags a pending or failed build.
export const simPrefsOf = (s: Settings): SimPrefs => ({ ...s.simulation, lengthUnit: s.units.length });

export const repairNotes = (repaired: RepairedValue[]): string[] => repaired.map((r) => repairedText(r, i18n.t));

export type StorageWarningKind = 'full' | 'degraded' | 'loadFailed' | 'conflict';

export const saveFailure = (e: unknown): { msg: string; kind: StorageWarningKind } =>
  e instanceof Error && e.message === 'conflict'
    ? { msg: i18n.t('storage.conflict'), kind: 'conflict' }
    : { msg: i18n.t('storage.full'), kind: 'full' };

export const selectActive = (s: WorkspaceState): Simulation => s.sims.find((x) => x.id === s.activeId) ?? s.sims[0]!;

// Same rule as `resultFlight`, so tiles and charts describe the same flight.
export const selectShownSim = (s: WorkspaceState): Simulation => {
  const chosen = s.resultSimId == null ? undefined : s.sims.find((x) => x.id === s.resultSimId);
  return chosen?.result ? chosen : selectActive(s);
};

export const selectDesignName = (s: WorkspaceState): string => designNameOf(s.tree, s.loadedMeta);

/** Safe to subscribe to: it returns a stored object. */
export const selectConfig = (s: WorkspaceState): FlightConfig => configFor(s.configs, selectActive(s).configId);

export const configOf = (configs: readonly FlightConfig[], sim: Simulation): FlightConfig =>
  configFor(configs, sim.configId);

export function defaultConfig(tree: RocketTree): FlightConfig {
  return reconcileConfig(tree, newFlightConfig());
}

export const workspaceSnapshot = (
  s: Pick<WorkspaceState, 'tree' | 'sims' | 'configs' | 'activeId' | 'loadedMeta'>,
): Workspace => ({
  version: 3,
  tree: s.tree,
  sims: s.sims,
  configs: s.configs,
  activeId: s.activeId,
  loadedMeta: s.loadedMeta,
});
