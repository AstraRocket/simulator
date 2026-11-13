// Only a type edge back to store.ts: the slices read these while store.ts is still loading.
import i18n from '../i18n';
import type { RocketTree } from '../engine/openRocketEngine';
import { configFor, newFlightConfig, reconcileConfig, type FlightConfig } from '../services/flight/flightConfigs';
import { repairedText, type RepairedValue } from '../services/design/repairValues';
import { newSimulation, type Simulation, type SimPrefs } from '../services/flight/simulations';
import type { LaunchConditions } from '../services/design/orkTree';
import { defaultRocketTree } from '../services/design/defaultRocket';
import { loadSettings, type Settings } from '../services/storage/settings';
import { pickWorkspace, type Workspace, type WorkspaceField } from '../services/storage/workspaceStore';
import { designNameOf } from '../services/app/appInfo';
import { unitFor, unitSymbols, type Quantity } from '../prefs/units';
import { fmtSymIn } from '../prefs/useUnits';
import type { WorkspaceState } from './store';

export const displayUnits = () => {
  const s = loadSettings();
  return unitSymbols(s.units, s.unitOverrides);
};

// Length unit from settings: the kernel's own unit lags a pending or failed build.
export const simPrefsOf = (s: Settings): SimPrefs => ({ ...s.simulation, lengthUnit: s.units.length });

export const repairNotes = (repaired: RepairedValue[]): string[] => {
  const s = loadSettings();
  const fmt = (q: Quantity, si: number) => fmtSymIn(q, unitFor(s.units, s.unitOverrides, q), si);
  return repaired.map((r) => repairedText(r, i18n.t, fmt));
};

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

export const firstSimName = (): string => i18n.t('sims.untitled', { n: 1 });

/** "Simulation 1" on the launch defaults, with `launch` laid over them. */
export const firstSim = (configId: string, launch?: Partial<LaunchConditions>): Simulation =>
  newSimulation(firstSimName(), configId, { ...loadSettings().launchDefaults, ...launch });

/** The blank workspace: the default rocket, its configuration and its first simulation. */
export function freshWorkspace(): { tree: RocketTree; config: FlightConfig; sim: Simulation } {
  const tree = defaultRocketTree();
  const config = defaultConfig(tree);
  return { tree, config, sim: firstSim(config.id) };
}

export const workspaceSnapshot = (s: Pick<WorkspaceState, WorkspaceField>): Workspace => ({
  version: 3,
  ...pickWorkspace(s),
});
