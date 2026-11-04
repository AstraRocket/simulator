import { create } from 'zustand';
import i18n from '../i18n';
import { scalePart, scaleRocket, type ScaleOptions, type ScaleScope } from '../tree/scaleRocket';
import { defaultRocketTree } from '../services/design/defaultRocket';
import { buildRocketTree, type StaticInfo } from '../engine/api';
import type { RocketTree, ComponentNode, ComponentType as PartType } from '../engine/openRocketEngine';
import {
  findNode,
  patchChangesNode,
  updateNode,
  removeNode,
  addPart,
  addStage,
  moveNode,
  setStageDrogue,
  setStageMain,
  syncDerived,
} from '../services/design/treeEdit';
import { canRemove, duplicateNode, pasteNode } from '../services/design/clipboard';
import { withFilletDefault } from '../services/design/filletDefault';
import {
  documentMaterialsOf,
  withDocumentMaterial,
  withDocumentMaterials,
  type DocumentMaterial,
} from '../services/materials/documentMaterials';
import {
  carryToCopies,
  reconcileConfigs,
  followMountIgnition,
  type FlightConfig,
} from '../services/flight/flightConfigs';
import { repairValues } from '../services/design/repairValues';
import { withKernelEnds } from '../services/design/autoRadius';
import { newSimulation, resultKey, type Simulation, withoutResults } from '../services/flight/simulations';
import { loadSettings } from '../services/storage/settings';
import { defaultMaterialPatch } from '../services/design/materialSlots';
import { createViewSlice, type ViewSlice } from './viewSlice';
import { createFileSlice, type FileSlice } from './fileSlice';
import { createConfigSlice, sanitizeConfigs, type ConfigSlice } from './configSlice';
import { createSimSlice, sanitizeSims, type SimSlice } from './simSlice';
import { abortRunWork, createRunSlice, type RunSlice } from './runSlice';
import { createDriftSweepSlice, type DriftSweepSlice } from './driftSweepSlice';
import { createMotorGuideSlice, type MotorGuideSlice } from './motorGuideSlice';
import { markWritten, voidPendingAutosave } from './writtenWorkspace';
import { configOf, defaultConfig, repairNotes, type StorageWarningKind } from './workspaceSelectors';

// Defined in a leaf module so fileSlice can import them without a run-time cycle.
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
  extends ViewSlice, FileSlice, ConfigSlice, SimSlice, RunSlice, DriftSweepSlice, MotorGuideSlice {
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
  hydrate: (w: {
    tree: RocketTree;
    sims: Simulation[];
    configs: FlightConfig[];
    activeId: string;
    loadedMeta: LoadedMeta;
  }) => void;

  scaleDesign: (factor: number, scope?: ScaleScope, options?: ScaleOptions) => void;
  setSelectedId: (id: string | null) => void;
  patchSelected: (patch: Partial<ComponentNode>) => void;
  applyTreeAction: (change: (tree: RocketTree, origins: Map<string, string>) => RocketTree) => void;
  /** `null` deviceId means single deployment. */
  setStageDrogue: (stageId: string, deviceId: string | null) => void;
  setStageMain: (stageId: string, deviceId: string) => void;
  removeSelected: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: () => void;
  duplicateSelected: () => void;
  addPartToTree: (type: PartType) => void;
  addStageToTree: () => void;
  moveSelected: (dir: -1 | 1) => void;
  updateDesignMeta: (
    patch: Partial<Pick<RocketTree, 'name' | 'designer' | 'kitName' | 'comment' | 'revision' | 'designType'>>,
  ) => void;
  addDocumentMaterial: (m: DocumentMaterial) => void;
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
  const restore = (e: HistoryEntry) => {
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

  const setDocumentMaterials = (change: (list: DocumentMaterial[]) => DocumentMaterial[]) => {
    const { tree } = get();
    const list = documentMaterialsOf(tree);
    const next = change(list);
    if (next.length === list.length && next.every((m, i) => m === list[i])) return;
    // Its own step: folded into an open field edit, Undo would revert both.
    recordStep();
    set((s) => ({ tree: withDocumentMaterials(s.tree, next) }));
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
  const tree0 = defaultRocketTree();
  const config0 = defaultConfig(tree0);
  const sim0 = newSimulation(i18n.t('sims.untitled', { n: 1 }), config0.id, loadSettings().launchDefaults);
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
    ...createConfigSlice({ ...steps, seed: config0 })(set, get, api),
    ...createSimSlice({ ...steps, seed: sim0 })(set, get, api),
    ...createRunSlice(set, get, api),
    ...createDriftSweepSlice(set, get, api),
    ...createMotorGuideSlice({ recordStep })(set, get, api),

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

    scaleDesign: (factor, scope = 'rocket', options = {}) => {
      const { tree, selectedId } = get();
      if (scope !== 'rocket') {
        if (!selectedId) return;
        commitTree(syncDerived(scalePart(tree, selectedId, factor, scope === 'subtree', options)));
        return;
      }
      // Scaling bypasses `treeEdit`, so it re-resolves derived radii itself.
      commitTree(syncDerived(scaleRocket(tree, factor, options)), { selectedId: null });
    },
    setSelectedId: (selectedId) => set((s) => ({ selectedId, selectionSeq: s.selectionSeq + 1 })),
    patchSelected: (edit) => {
      const { selectedId, tree, configs } = get();
      if (!selectedId) return;
      // A fillet added here starts as epoxy rather than desktop's Cardboard.
      const patch = withFilletDefault(findNode(tree, selectedId), edit);
      // Otherwise a clamped keystroke costs a kernel rebuild and an empty undo step.
      if (!patchChangesNode(tree, selectedId, patch)) return;
      beginEdit();
      const next = updateNode(tree, selectedId, patch);
      const touchesMounts = 'motorMount' in patch;
      const reconciled = touchesMounts ? reconcileConfigs(next, configs) : configs;
      const touchesIgnition = 'ignitionEvent' in patch || 'ignitionDelay' in patch;
      set({
        tree: next,
        configs: touchesIgnition
          ? followMountIgnition(reconciled, selectedId, findNode(tree, selectedId)!, findNode(next, selectedId)!)
          : reconciled,
      });
    },
    applyTreeAction: (change) => {
      const origins = new Map<string, string>();
      void commitTree(change(get().tree, origins), {}, origins);
    },
    setStageDrogue: (stageId, deviceId) => {
      const { tree } = get();
      const next = setStageDrogue(tree, stageId, deviceId);
      if (next === tree) return;
      commitTree(next);
    },
    setStageMain: (stageId, deviceId) => {
      const { tree } = get();
      const next = setStageMain(tree, stageId, deviceId);
      if (next === tree) return;
      commitTree(next);
    },
    removeSelected: () => {
      const { selectedId, tree } = get();
      if (!selectedId) return;
      commitTree(removeNode(tree, selectedId), { selectedId: null });
    },
    copySelected: () => {
      const { selectedId, tree } = get();
      const node = selectedId ? findNode(tree, selectedId) : null;
      if (node) set({ clipboard: structuredClone(node) });
    },
    cutSelected: () => {
      const { selectedId, tree } = get();
      const node = selectedId ? findNode(tree, selectedId) : null;
      if (!node || !selectedId || !canRemove(tree, selectedId)) return;
      set({ clipboard: structuredClone(node) });
      commitTree(removeNode(tree, selectedId), { selectedId: null });
    },
    pasteClipboard: () => {
      const { clipboard, tree, selectedId, selectionSeq } = get();
      const done = clipboard ? pasteNode(tree, clipboard, selectedId) : null;
      if (done) commitTree(done.tree, { selectedId: done.id, selectionSeq: selectionSeq + 1 }, done.origins);
    },
    duplicateSelected: () => {
      const { tree, selectedId, selectionSeq } = get();
      const done = selectedId ? duplicateNode(tree, selectedId) : null;
      if (done) commitTree(done.tree, { selectedId: done.id, selectionSeq: selectionSeq + 1 }, done.origins);
    },
    addPartToTree: (type) => {
      const { tree, selectedId, selectionSeq } = get();
      const seed = defaultMaterialPatch(type, loadSettings().defaultMaterials) as Partial<ComponentNode>;
      const { tree: next, id } = addPart(tree, type, selectedId, seed);
      commitTree(next, { selectedId: id, selectionSeq: selectionSeq + 1 });
    },
    addStageToTree: () => {
      const { tree: next, id } = addStage(get().tree);
      commitTree(next, { selectedId: id, selectionSeq: get().selectionSeq + 1 });
    },
    moveSelected: (dir) => {
      const { selectedId, tree } = get();
      if (!selectedId) return;
      commitTree(moveNode(tree, selectedId, dir));
    },
    updateDesignMeta: (patch) => {
      // An absent design type reads as "original", so OK on an unedited dialog records nothing.
      const { tree } = get();
      const differs = (Object.keys(patch) as (keyof typeof patch)[]).some((k) =>
        k === 'designType' ? (patch[k] ?? 'original') !== (tree[k] ?? 'original') : patch[k] !== tree[k],
      );
      if (!differs) return;
      recordStep();
      set((s) => ({ tree: { ...s.tree, ...patch } }));
    },
    addDocumentMaterial: (m) => setDocumentMaterials((list) => withDocumentMaterial(list, m)),
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
