import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import {
  launchPatchFor,
  overLaunchDefaults,
  type LaunchConditions,
  type LaunchPatch,
} from '../services/design/orkTree';
import { ensureConfig, type FlightConfig } from '../services/flight/flightConfigs';
import {
  changedPrefKeys,
  isOutdated,
  newSimulation,
  type Simulation,
  type SimPrefs,
} from '../services/flight/simulations';
import { loadSettings } from '../services/storage/settings';
import { holdsKey, nonEmpty, withKey } from '../services/app/objectKeys';
import type { WorkspaceState } from './store';
import { configOf, defaultConfig, selectActive, simPrefsOf } from './workspaceSelectors';
import { insertAfter, replaceById, type EditSteps } from './sliceShared';

export interface SimSlice {
  sims: Simulation[];
  activeId: string;
  selectedSimIds: string[];
  /** Null follows the active row; an id naming no row falls back rather than being pruned. */
  resultSimId: string | null;
  lastRunIds: string[];
  simPrefs: SimPrefs;

  setSimPrefs: (prefs: SimPrefs) => void;
  setActiveId: (id: string) => void;
  setSimConfig: (simId: string, configId: string) => void;
  patchLaunch: (p: LaunchPatch) => void;
  patchActiveLaunch: (p: Partial<LaunchConditions>) => void;
  addSim: () => void;
  duplicateSim: (id: string) => void;
  deleteSim: (id: string) => void;
  renameSim: (id: string, name: string) => void;
  setSimPref: <K extends keyof SimPrefs>(key: K, value: SimPrefs[K] | null) => void;
  clearSimPrefs: () => void;
  setResultSimId: (id: string | null) => void;
  toggleSimSelected: (id: string) => void;
  setSimsSelected: (ids: string[]) => void;
}

// Do not subscribe to this: a fresh array per call makes zustand re-render forever.
export const selectRunIds = (s: WorkspaceState): string[] =>
  s.selectedSimIds.length ? s.selectedSimIds : [selectActive(s).id];

// Same subscription caveat as `selectRunIds`.
const selectEditIds = (s: WorkspaceState): string[] => selectRunIds(s);

export const selectOutdated = (s: WorkspaceState, sim: Simulation = selectActive(s)): boolean =>
  isOutdated(sim, s.tree, configOf(s.configs, sim), s.simPrefs);

export const selectRunFailed = (s: WorkspaceState, sim: Simulation = selectActive(s)): boolean => {
  const run = s.simRuns[sim.id];
  return run?.phase === 'failed' && run.tree === s.tree;
};

export function sanitizeSims(sims: Simulation[], configs: FlightConfig[]): Simulation[] {
  const launchDefaults = loadSettings().launchDefaults;
  const known = new Set(configs.map((c) => c.id));
  const fallback = configs[0]!.id;
  const safe = (Array.isArray(sims) ? sims : []).filter((s) => s && typeof s.id === 'string');
  if (!safe.length) return [newSimulation(i18n.t('sims.untitled', { n: 1 }), fallback, launchDefaults)];
  return safe.map((s) => ({
    ...s,
    launch: overLaunchDefaults(launchDefaults, s.launch),
    configId: known.has(s.configId) ? s.configId : fallback,
    // Re-attached by the workspace store before this sees them (workspaceStore.withResults).
    result: s.result ?? null,
  }));
}

/** Names are never reused, even after deletions. */
export function uniqueSimName(sims: Simulation[], label: (n: number) => string, start: number): string {
  const taken = new Set(sims.map((x) => x.name));
  let n = start;
  while (taken.has(label(n))) n++;
  return label(n);
}

interface SimSliceShared extends EditSteps {
  seed: Simulation;
}

export const createSimSlice =
  ({ seed, beginEdit, recordStep }: SimSliceShared): StateCreator<WorkspaceState, [], [], SimSlice> =>
  (set, get) => {
    // Per target: merging the active sim's whole block would flatten fields the user never touched.
    const patchTargets = (make: (sim: Simulation) => Partial<Simulation>) => {
      const ids = new Set(selectEditIds(get()));
      set((s) => ({ sims: s.sims.map((x) => (ids.has(x.id) ? { ...x, ...make(x) } : x)) }));
    };

    return {
      sims: [seed],
      activeId: seed.id,
      selectedSimIds: [],
      resultSimId: null,
      lastRunIds: [],
      simPrefs: simPrefsOf(loadSettings()),

      setSimPrefs: (prefs) => set((s) => (changedPrefKeys(s.simPrefs, prefs).length ? { simPrefs: prefs } : {})),
      setActiveId: (activeId) => set({ activeId }),
      setSimConfig: (simId, configId) => {
        const s = get();
        const sim = s.sims.find((x) => x.id === simId);
        if (!sim || sim.configId === configId || !s.configs.some((c) => c.id === configId)) return;
        recordStep();
        set({ sims: replaceById(s.sims, simId, (x) => ({ ...x, configId })) });
      },
      patchLaunch: (p) => {
        const ids = new Set(selectEditIds(get()));
        const patches = new Map<string, Partial<LaunchConditions>>();
        for (const sim of get().sims) if (ids.has(sim.id)) patches.set(sim.id, launchPatchFor(p, sim.launch, sim.id));
        const changes = (sim: Simulation) => {
          const patch = patches.get(sim.id) ?? {};
          return (Object.keys(patch) as (keyof LaunchConditions)[]).some((k) => patch[k] !== sim.launch[k]);
        };
        if (!get().sims.some(changes)) return;
        beginEdit();
        patchTargets((sim) => ({ launch: { ...sim.launch, ...patches.get(sim.id) } }));
      },
      patchActiveLaunch: (p) => {
        const active = selectActive(get());
        const keys = Object.keys(p) as (keyof LaunchConditions)[];
        if (keys.every((k) => p[k] === active.launch[k])) return;
        recordStep();
        set((s) => ({
          sims: replaceById(s.sims, active.id, (x) => ({ ...x, launch: { ...x.launch, ...p } })),
        }));
      },
      addSim: () => {
        recordStep();
        const s = get();
        const name = uniqueSimName(s.sims, (n) => i18n.t('sims.untitled', { n }), s.sims.length + 1);
        const { configs, id: configId } = ensureConfig(s.configs, defaultConfig(s.tree).motors);
        const s0 = newSimulation(name, configId, loadSettings().launchDefaults);
        set({ sims: [...s.sims, s0], configs, activeId: s0.id });
      },
      duplicateSim: (id) => {
        const s = get();
        const src = s.sims.find((x) => x.id === id);
        if (!src) return;
        recordStep();
        const copy = i18n.t('sims.copyName', { name: src.name });
        const name = uniqueSimName(s.sims, (n) => (n === 1 ? copy : `${copy} ${n}`), 1);
        // Shares the configuration, not a clone, so a motor change applies to both.
        const s0 = { ...newSimulation(name, src.configId, src.launch), prefs: src.prefs };
        set({ sims: insertAfter(s.sims, id, s0), activeId: s0.id });
      },
      deleteSim: (id) => {
        const s = get();
        const rest = s.sims.filter((x) => x.id !== id);
        if (!rest.length) return;
        recordStep();
        set({
          sims: rest,
          activeId: id === selectActive(s).id ? rest[0]!.id : s.activeId,
          selectedSimIds: s.selectedSimIds.filter((x) => x !== id),
          lastRunIds: s.lastRunIds.filter((x) => x !== id),
          resultSimId: s.resultSimId === id ? null : s.resultSimId,
        });
      },
      renameSim: (id, name) => {
        const sim = get().sims.find((x) => x.id === id);
        if (!sim || sim.name === name) return;
        beginEdit();
        set((s) => ({ sims: replaceById(s.sims, id, (x) => ({ ...x, name })) }));
      },
      setSimPref: (key, value) => {
        const ids = new Set(selectEditIds(get()));
        if (get().sims.every((x) => !ids.has(x.id) || holdsKey(x.prefs, key, value))) return;
        beginEdit();
        patchTargets((sim) => {
          // Removed, not set undefined: an explicit undefined would shadow the global when spread.
          return { prefs: nonEmpty(withKey(sim.prefs, key, value)) };
        });
      },
      clearSimPrefs: () => {
        const ids = new Set(selectEditIds(get()));
        if (!get().sims.some((x) => ids.has(x.id) && x.prefs)) return;
        beginEdit();
        // `undefined`, not `{}`: SimEditor reads an empty object as overridden.
        patchTargets(() => ({ prefs: undefined }));
      },
      setResultSimId: (id) => set({ resultSimId: id }),
      toggleSimSelected: (id) =>
        set((st) => ({
          selectedSimIds: st.selectedSimIds.includes(id)
            ? st.selectedSimIds.filter((x) => x !== id)
            : [...st.selectedSimIds, id],
        })),
      setSimsSelected: (ids) => set({ selectedSimIds: ids }),
    };
  };
