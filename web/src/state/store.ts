import { create } from 'zustand';
import type { WorkspaceFields } from '../services/storage/workspaceStore';
import i18n from '../i18n';
import { buildRocketTree, type StaticInfo } from '../engine/api';
import type { RocketTree, ComponentNode } from '../engine/openRocketEngine';
import { carryToCopies, reconcileConfigs, type FlightConfig } from '../services/flight/flightConfigs';
import { repairValues } from '../services/design/repairValues';
import { withKernelEnds } from '../services/design/autoRadius';
import { resultKey, type Simulation, withoutResults } from '../services/flight/simulations';
import { createEditSlice, type EditSlice } from './editSlice';
import { createViewSlice, type ViewSlice } from './viewSlice';
import { createFileSlice, type FileSlice } from './fileSlice';
import { createDesignLibrarySlice, type DesignLibrarySlice } from './designLibrarySlice';
import { createExportSlice, type ExportSlice } from './exportSlice';
import { createConfigSlice, sanitizeConfigs, type ConfigSlice } from './configSlice';
import { createSimSlice, sanitizeSims, type SimSlice } from './simSlice';
import { abortRunWork, createRunSlice, type RunSlice } from './runSlice';
import { createDriftSweepSlice, type DriftSweepSlice } from './driftSweepSlice';
import { createMotorGuideSlice, type MotorGuideSlice } from './motorGuideSlice';
import { markWritten, voidPendingAutosave } from './writtenWorkspace';
import { configOf, freshWorkspace, repairNotes, type StorageWarningKind } from './workspaceSelectors';

// Defined in a leaf module so the slices can import them without a run-time cycle.
export {
  configOf,
  saveFailure,
  selectActive,
  selectConfig,
  selectDesignName,
  selectShownSim,
  workspaceSnapshot,
} from './workspaceSelectors';
export { selectEditedConfig, selectMotorDims, type IgnitionScope } from './configSlice';
export { selectOutdated, selectRunFailed, selectRunIds } from './simSlice';
export { isDriftSweepStale, selectDriftSweepFor } from './driftSweepSlice';
export { isMotorGuideStale, selectMotorGuideFor } from './motorGuideSlice';
import type { LoadedMeta as LoadedFileMeta } from '../services/files/wireLoadedOrk';

type Rocket = ReturnType<typeof buildRocketTree>;
type LoadedMeta = LoadedFileMeta | null;

type HistoryEntry = {
  tree: RocketTree;
  selectedId: string | null;
  sims: Simulation[];
  configs: FlightConfig[];
  activeId: string;
  selectedSimIds: string[];
  lastRunIds: string[];
  resultSimId: string | null;
};
const HISTORY_LIMIT = 100;

export interface WorkspaceState
  extends
    EditSlice,
    ViewSlice,
    FileSlice,
    DesignLibrarySlice,
    ExportSlice,
    ConfigSlice,
    SimSlice,
    RunSlice,
    DriftSweepSlice,
    MotorGuideSlice {
  tree: RocketTree;
  info: StaticInfo | null;
  err: string | null;
  /** Kept apart from `err` so a rebuild cannot wipe an action's message before it is read. */
  buildErr: string | null;
  /** Transient: the repair is saved, so a note kept in `loadedMeta` would repeat forever. */
  repairNotes: string[];
  /** The `standing` slot is never retired: `markDegraded()` never notifies twice. */
  storageWarning: string | null;
  storageNotices: { standing: StorageNotice | null; save: StorageNotice | null };
  selectedId: string | null;
  /** Bumped even when re-picking the selected part, which `selectedId` cannot signal. */
  selectionSeq: number;
  clipboard: ComponentNode | null;
  loadedMeta: LoadedMeta;
  rocket: Rocket | null;
  past: HistoryEntry[];
  future: HistoryEntry[];

  setErr: (err: string | null) => void;
  setBuildErr: (buildErr: string | null) => void;
  setStorageWarning: (msg: string | null, kind?: StorageWarningKind) => void;
  warnStorageFull: () => void;
  clearSaveWarning: () => void;
  /** Epoch ms. */
  lastSavedAt: number | null;
  /** Bumped by a workspace swap that must not autosave; an import is not quiet. */
  quietReplace: number;
  markSaved: () => void;
  applyBuild: (info: StaticInfo | null, rocket: Rocket | null) => void;
  hydrate: (w: WorkspaceFields) => void;

  commitEdit: () => void;
  undo: () => void;
  redo: () => void;
}

type StorageNotice = { msg: string; kind: StorageWarningKind | null };

function storageWarningOf(
  notices: WorkspaceState['storageNotices'],
): Pick<WorkspaceState, 'storageWarning' | 'storageNotices'> {
  const shown = [notices.standing, notices.save].filter((n): n is StorageNotice => n !== null);
  return {
    storageNotices: notices,
    storageWarning: shown.length ? shown.map((n) => n.msg).join(' ') : null,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get, api) => {
  let txn: HistoryEntry | null = null;
  const snap = (): HistoryEntry => {
    const s = get();
    // Held by reference: a restored tree keeps the identity a run or sweep recorded.
    return {
      tree: s.tree,
      selectedId: s.selectedId,
      sims: withoutResults(s.sims),
      configs: s.configs,
      activeId: s.activeId,
      selectedSimIds: s.selectedSimIds,
      lastRunIds: s.lastRunIds,
      resultSimId: s.resultSimId,
    };
  };
  // Live results carry across with their `resultKey`, so they read outdated unless inputs match.
  const restore = (e: HistoryEntry): HistoryEntry => {
    const live = new Map(get().sims.map((x) => [x.id, x]));
    return {
      tree: e.tree,
      selectedId: e.selectedId,
      sims: e.sims.map((x) => {
        const held = live.get(x.id);
        return held?.result
          ? { ...x, result: held.result, resultKey: held.resultKey, resultLaunch: held.resultLaunch }
          : x;
      }),
      configs: e.configs,
      activeId: e.activeId,
      selectedSimIds: e.selectedSimIds,
      lastRunIds: e.lastRunIds,
      resultSimId: e.resultSimId,
    };
  };
  const pushPast = (entry: HistoryEntry) =>
    set((s) => ({ past: [...s.past, entry].slice(-HISTORY_LIMIT), future: [] }));
  const beginEdit = () => {
    if (!txn) txn = snap();
  };
  const commitEdit = () => {
    if (txn) {
      pushPast(txn);
      txn = null;
    }
  };
  const recordStep = () => {
    commitEdit();
    pushPast(snap());
  };

  const commitTree = (
    next: RocketTree,
    extra: Partial<WorkspaceState> = {},
    origins?: ReadonlyMap<string, string>,
  ): boolean => {
    const { tree, configs } = get();
    if (next === tree) return false;
    recordStep();
    const carried = origins ? carryToCopies(configs, origins) : configs;
    set({ tree: next, configs: reconcileConfigs(next, carried), ...extra });
    return true;
  };

  const clearHistory = () => {
    txn = null;
    set({ past: [], future: [] });
  };

  // The autosave timer clears only when its effect re-runs, so void it here first.
  const replaceWorkspace = (patch: Partial<WorkspaceState> | ((s: WorkspaceState) => Partial<WorkspaceState>)) => {
    voidPendingAutosave();
    abortRunWork();
    set((s) => ({
      hiddenParts: new Set<string>(),
      simRuns: {},
      lastRunIds: [],
      resultSimId: null,
      selectedSimIds: [],
      simBusy: false,
      driftSweep: null,
      driftSweepRun: null,
      motorGuide: null,
      motorGuideRun: null,
      err: null,
      buildErr: null,
      repairNotes: [],
      selectedConfigId: null,
      // Else the new design shows the old one's figures for a frame.
      info: null,
      rocket: null,
      ...(s.storageNotices.save?.kind === 'conflict' ? storageWarningOf({ ...s.storageNotices, save: null }) : {}),
      ...(typeof patch === 'function' ? patch(s) : patch),
    }));
  };

  // The app mounts before hydration, so the default must be a complete workspace.
  const { tree: tree0, config: config0, sim: sim0 } = freshWorkspace();
  const steps = { beginEdit, commitEdit, recordStep };

  return {
    tree: tree0,
    info: null,
    err: null,
    buildErr: null,
    storageWarning: null,
    storageNotices: { standing: null, save: null },
    lastSavedAt: null,
    quietReplace: 0,
    selectedId: null,
    selectionSeq: 0,
    clipboard: null,
    loadedMeta: null,
    repairNotes: [],
    rocket: null,
    past: [],
    future: [],
    ...createViewSlice(set, get, api),
    ...createFileSlice({ replaceWorkspace, clearHistory })(set, get, api),
    ...createDesignLibrarySlice({ clearHistory })(set, get, api),
    ...createExportSlice(set, get, api),
    ...createConfigSlice({ ...steps, seed: config0 })(set, get, api),
    ...createSimSlice({ ...steps, seed: sim0 })(set, get, api),
    ...createRunSlice(set, get, api),
    ...createDriftSweepSlice(set, get, api),
    ...createMotorGuideSlice({ recordStep })(set, get, api),

    ...createEditSlice({ beginEdit, recordStep, commitTree })(set, get, api),

    setErr: (err) => set({ err }),
    setBuildErr: (buildErr) => set({ buildErr }),
    setStorageWarning: (msg, kind) =>
      set((s) => {
        const notice = msg ? { msg, kind: kind ?? null } : null;
        // A clear that names no kind clears both slots.
        if (!notice && !kind) return storageWarningOf({ standing: null, save: null });
        return storageWarningOf(
          kind === 'degraded' || kind === 'loadFailed'
            ? { ...s.storageNotices, standing: notice }
            : { ...s.storageNotices, save: notice },
        );
      }),
    warnStorageFull: () => get().setStorageWarning(i18n.t('storage.full'), 'full'),
    clearSaveWarning: () =>
      set((s) => {
        const kind = s.storageNotices.save?.kind;
        return kind === 'full' || kind === 'conflict' ? storageWarningOf({ ...s.storageNotices, save: null }) : {};
      }),
    markSaved: () => set({ lastSavedAt: Date.now() }),
    applyBuild: (info, rocket) => set({ info, rocket }),
    hydrate: (w) => {
      const configs = sanitizeConfigs(w.tree, w.configs);
      const repaired = repairValues(w.tree);
      // The flight is unchanged, so a current result's key is rewritten to stay current.
      const fixed = { ...repaired, tree: withKernelEnds(repaired.tree) };
      const prefs = get().simPrefs;
      const sims = sanitizeSims(w.sims, configs).map((x) =>
        fixed.tree !== repaired.tree &&
        x.resultKey !== undefined &&
        x.resultKey === resultKey(repaired.tree, configOf(configs, x), x, prefs)
          ? { ...x, resultKey: resultKey(fixed.tree, configOf(configs, x), x, prefs) }
          : x,
      );
      const activeId = sims.some((s) => s.id === w.activeId) ? w.activeId : sims[0]!.id;
      clearHistory();
      replaceWorkspace((s) => ({
        // Not quiet when repaired: the autosave keeps the repair, so the note shows once.
        quietReplace: fixed.repaired.length ? s.quietReplace : s.quietReplace + 1,
        repairNotes: repairNotes(fixed.repaired),
        tree: fixed.tree,
        sims,
        configs,
        activeId,
        loadedMeta: w.loadedMeta ?? null,
      }));
      if (!fixed.repaired.length) markWritten(get());
    },

    commitEdit,
    undo: () => {
      commitEdit();
      const { past, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1]!;
      set({ past: past.slice(0, -1), future: [...future, snap()], ...restore(prev) });
    },
    redo: () => {
      // An in-flight edit is a new edit, so committing it clears the redo stack.
      commitEdit();
      const { past, future } = get();
      if (!future.length) return;
      const next = future[future.length - 1]!;
      set({ future: future.slice(0, -1), past: [...past, snap()], ...restore(next) });
    },
  };
});
