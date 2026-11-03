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

/**
 * The simulations: the rows of the Simulate tab, each flying one flight
 * configuration under its own launch conditions and run overrides, and which of
 * them are active, ticked and shown.
 */
export interface SimSlice {
  sims: Simulation[];
  activeId: string;
  /**
   * Rows ticked for running, which is a different question from `activeId`.
   *
   * `activeId` is the simulation the editor is pointed at - exactly one, always.
   * This is the set the Run button will fly, and it is normally empty: with
   * nothing ticked, Run flies the active one, which is what you want when there
   * is only one simulation or you are iterating on a single setup. Ticking rows
   * is how you say "these several".
   */
  selectedSimIds: string[];
  /**
   * Which flight the Results tab is showing, chosen from its own picker.
   *
   * Null means "whichever simulation is active", the right default: open
   * Results and you see the row you were just working on, without having
   * chosen anything.
   *
   * Separate from `selectedSimIds` on purpose. The ticks answer "which rows
   * should Run fly"; this answers "which flight am I reading". They are
   * different questions asked at different moments, and tying them together
   * would mean that reading one result silently re-arms the Run button, or that
   * ticking rows to fly them yanks the charts around.
   *
   * An id that no longer names a simulation falls back rather than being pruned,
   * so deleting a row cannot leave the tab empty mid-read.
   */
  resultSimId: string | null;
  /**
   * The simulations the last run actually flew, in the order they were asked for.
   *
   * This, not "every simulation that has a result", is what decides whether the
   * Results tab shows a plain name or a picker: results persist, so counting
   * them would put a dropdown on screen for a single run whenever another
   * simulation had been run earlier. One run, one name.
   */
  lastRunIds: string[];
  /**
   * The global run preferences (Settings > Simulation), mirrored from the
   * settings so the store can tell whether a result is outdated
   * ({@link selectOutdated}). Synced by useWorkspaceEffects.
   */
  simPrefs: SimPrefs;

  /** Replace the mirrored globals. A no-op when none of the flight keys moved. */
  setSimPrefs: (prefs: SimPrefs) => void;
  setActiveId: (id: string) => void;
  /** Point one simulation at a configuration. */
  setSimConfig: (simId: string, configId: string) => void;
  patchLaunch: (p: LaunchPatch) => void;
  /**
   * Patch the active simulation's launch conditions alone, as one undo step.
   *
   * For surfaces away from the simulation editor (Launch Locations, opened
   * from the menu), where the "editing N simulations" banner is not on screen
   * to say that the ticked rows would be written too.
   */
  patchActiveLaunch: (p: Partial<LaunchConditions>) => void;
  addSim: () => void;
  duplicateSim: (id: string) => void;
  deleteSim: (id: string) => void;
  renameSim: (id: string, name: string) => void;
  /** Override a global run preference for the active sim; null clears the override. */
  setSimPref: <K extends keyof SimPrefs>(key: K, value: SimPrefs[K] | null) => void;
  /** Drop every override on the active simulation, so all of them follow the globals again. */
  clearSimPrefs: () => void;
  /** Choose which flight the Results tab shows; null follows the active row. */
  setResultSimId: (id: string | null) => void;
  /** Tick or untick one row for the next run. */
  toggleSimSelected: (id: string) => void;
  /** Tick every row, or none. */
  setSimsSelected: (ids: string[]) => void;
}

/**
 * What the Run button will fly: the ticked rows, or the active simulation when
 * nothing is ticked. One place decides it, so the button's label, its enabled
 * state and the action itself can never disagree.
 *
 * Not for `useWorkspaceStore(selectRunIds)`: it builds a fresh array per call
 * and zustand compares by reference, so subscribing to it re-renders forever.
 * Components subscribe to `selectedSimIds` and the active id and derive it.
 */
export const selectRunIds = (s: WorkspaceState): string[] =>
  s.selectedSimIds.length ? s.selectedSimIds : [selectActive(s).id];

/**
 * What an edit in the right-hand editor applies to: the ticked rows, or the
 * active simulation when nothing is ticked.
 *
 * Deliberately the same rule as {@link selectRunIds}. A tick already means
 * "these ones" for Run and for Delete; making it mean something else for Edit
 * would be a third selection concept for the user to hold. The editor says so
 * in a banner, so a multi-target edit is never silent.
 *
 * Same subscription caveat as `selectRunIds`: it builds a fresh array, so
 * components derive it rather than subscribing to it.
 */
const selectEditIds = (s: WorkspaceState): string[] => selectRunIds(s);

/**
 * Whether a row's result was flown from inputs other than the current ones: the
 * design, its configuration, its launch conditions or the run preferences it
 * reads. Derived on every read rather than stored, so no edit has to remember to
 * set it. The active row when `sim` is omitted.
 */
export const selectOutdated = (s: WorkspaceState, sim: Simulation = selectActive(s)): boolean =>
  isOutdated(sim, s.tree, configOf(s.configs, sim), s.simPrefs);

/**
 * True when a sim's last run (the active one by default) threw on the design
 * that is still loaded.
 *
 * Self-expiring by construction: it compares the recorded tree against the
 * current one, so any edit makes it false again and a retry is allowed:
 * auto-run must not retry a configuration it already knows fails, but it must
 * try again the moment the user changes something.
 */
export const selectRunFailed = (s: WorkspaceState, sim: Simulation = selectActive(s)): boolean => {
  const run = s.simRuns[sim.id];
  return run?.phase === 'failed' && run.tree === s.tree;
};

/**
 * Repair a persisted workspace so a stale/partial blob can't blank the app.
 *
 * Each launch is merged over the current defaults (a `launch` missing fields
 * would blank the Launch panel), and a simulation naming a configuration that is
 * not there is pointed at the first one, the way a stale `activeId` falls back to
 * the first row.
 */
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
    // Kept, not dropped: flights persist under their own key and are re-attached
    // by the workspace store before this sees them (workspaceStore.withResults).
    result: s.result ?? null,
  }));
}

/** First `label(n)` (n = start, start+1, …) not already used by a sim, so New
 *  and Duplicate never reuse a name, even after deletions. */
export function uniqueSimName(sims: Simulation[], label: (n: number) => string, start: number): string {
  const taken = new Set(sims.map((x) => x.name));
  let n = start;
  while (taken.has(label(n))) n++;
  return label(n);
}

/** What the simulation actions share with the editing core in store.ts. */
interface SimSliceShared extends EditSteps {
  /** The simulation the default workspace starts with. */
  seed: Simulation;
}

export const createSimSlice =
  ({ seed, beginEdit, recordStep }: SimSliceShared): StateCreator<WorkspaceState, [], [], SimSlice> =>
  (set, get) => {
    /**
     * Patch every simulation the editor is pointed at: the ticked rows, or the
     * active one when nothing is ticked (see {@link selectEditIds}).
     *
     * The patch is built per simulation rather than passed in whole, because a bulk
     * edit must merge into each target's own state -- `{...sim.launch, ...p}` off
     * the active sim would copy the active sim's entire launch block onto the
     * others and silently flatten every field the user never touched. Built per
     * target, only the key actually edited moves; everything else stays the
     * simulation's own.
     */
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
      setActiveId: (activeId) => set({ activeId }), // switching the active sim isn't an edit, so no history
      setSimConfig: (simId, configId) => {
        const s = get();
        const sim = s.sims.find((x) => x.id === simId);
        if (!sim || sim.configId === configId || !s.configs.some((c) => c.id === configId)) return;
        recordStep();
        set({ sims: replaceById(s.sims, simId, (x) => ({ ...x, configId })) });
      },
      patchLaunch: (p) => {
        // Each row's patch, made once: a row whose patch says what it already
        // holds is not an edit, and when no row changes there is no step.
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
        // Already so: no step, the way every other edit here treats a no-op.
        const keys = Object.keys(p) as (keyof LaunchConditions)[];
        if (keys.every((k) => p[k] === active.launch[k])) return;
        recordStep();
        set((s) => ({
          sims: replaceById(s.sims, active.id, (x) => ({ ...x, launch: { ...x.launch, ...p } })),
        }));
      },
      addSim: () => {
        // A fresh simulation flies the app default loadout under the user's global
        // launch defaults (duplicateSim carries an existing setup forward instead).
        // It joins an existing configuration that already holds that loadout rather
        // than minting a second identical one.
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
        // Carry the whole setup forward: the same flight configuration, and any
        // per-simulation option overrides. Duplicate exists to vary one thing
        // against an otherwise identical setup, so anything it silently reset would
        // be a trap. The copy shares the configuration rather than cloning it: a
        // configuration is a setup several rows can fly (see `patchConfig`), so a
        // motor change on the Configurations tab applies to both rows.
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
          // A tick on a simulation that no longer exists would silently pad the
          // Run button's count and then be skipped.
          selectedSimIds: s.selectedSimIds.filter((x) => x !== id),
          // Same for the Results picker: a deleted row must not stay in its list,
          // and dropping to one leaves a plain name behind.
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
          // A cleared override is removed, not stored as undefined: `prefs` is
          // spread over the globals at run time, and an explicit
          // `timeStep: undefined` would shadow the global with nothing.
          return { prefs: nonEmpty(withKey(sim.prefs, key, value)) };
        });
      },
      clearSimPrefs: () => {
        // Nothing to clear anywhere in the selection is not an edit: opening an
        // empty history entry would make Undo do nothing visible.
        const ids = new Set(selectEditIds(get()));
        if (!get().sims.some((x) => ids.has(x.id) && x.prefs)) return;
        beginEdit();
        // `undefined`, not `{}`: `prefs` is spread over the globals at run time and
        // the SimEditor reads "is anything overridden" from its key count, so an
        // empty object would read as overridden-with-nothing.
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
