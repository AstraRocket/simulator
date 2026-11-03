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

// Defined in a leaf module so fileSlice, which this file builds while it loads,
// can import them without importing this file at run time; re-exported here for
// the modules that import them from the store.
export {
  configOf,
  saveFailure,
  selectActive,
  selectConfig,
  selectDesignName,
  selectShownSim,
  workspaceSnapshot,
} from './workspaceSelectors';
// The slices' selectors, re-exported for the modules that import them from the store.
export { selectEditedConfig, selectMotorDims, type IgnitionScope } from './configSlice';
export { selectOutdated, selectRunFailed, selectRunIds } from './simSlice';
export { isDriftSweepStale, selectDriftSweepFor } from './driftSweepSlice';
export { isMotorGuideStale, selectMotorGuideFor } from './motorGuideSlice';
import type { LoadedMeta as LoadedFileMeta } from '../services/files/wireLoadedOrk';

type Rocket = ReturnType<typeof buildRocketTree>;
type LoadedMeta = LoadedFileMeta | null;

/** One undo/redo checkpoint: the whole editable workspace: the design tree (and
 *  which part was selected, so undo re-focuses what changed) plus the simulations,
 *  the active sim, and the flight configurations, all of which persist to the same
 *  file. Cached flight `result`s are stripped in {@link snap}: they're large,
 *  recomputable outputs, not edits. */
type HistoryEntry = {
  tree: RocketTree;
  selectedId: string | null;
  sims: Simulation[];
  /** The motor loadouts live here, so an undo of a motor change has to restore them. */
  configs: FlightConfig[];
  activeId: string;
  /**
   * The three fields `deleteSim` prunes alongside `sims`.
   *
   * Without them, undoing a delete would bring the row back but not its tick
   * (so the Run button's count would be wrong) and not its place in `lastRunIds`
   * (so the Results picker would collapse to a single name even though the run
   * had flown it).
   */
  selectedSimIds: string[];
  lastRunIds: string[];
  resultSimId: string | null;
};
/** Cap the stack so a long session can't grow memory without bound. */
const HISTORY_LIMIT = 100;

export interface WorkspaceState
  extends ViewSlice, FileSlice, ConfigSlice, SimSlice, RunSlice, DriftSweepSlice, MotorGuideSlice {
  // --- design ---
  tree: RocketTree;
  info: StaticInfo | null;
  /** Transient failure of the thing the user just did: a bad .ork, a sim that
   *  threw. Cleared by the next successful rebuild of a design edited since. */
  err: string | null;
  /**
   * Why the design on screen does not build, or null. Owned by the rebuild
   * effect (useWorkspaceEffects), which sets and clears it on every build.
   *
   * Apart from `err` so that a rebuild cannot wipe an action's message: the
   * engine arriving after an import failed, or a debounced build landing just
   * after a run reported a fault, would otherwise clear it before it was read.
   */
  buildErr: string | null;
  /**
   * Values a design arrived with that no value of their quantity can be, pulled
   * back to the limit on the way in (`design/repairValues`).
   *
   * Transient, unlike the import notes beside them in the banner. The repair is
   * saved with the design, so it is done once and there is nothing left to
   * report on the next load; a note kept in `loadedMeta` would persist and say
   * it again forever. Every load path fills this, including the autosaved
   * session, which has no notes of its own.
   */
  repairNotes: string[];
  /**
   * Browser storage is not keeping the user's work (quota hit, or IndexedDB
   * blocked and we are back on the 5 MB localStorage cap).
   *
   * A separate slot from `err`, because `err` is cleared by switching designs
   * and by a successful rebuild after any edit (the rebuild effect keeps it only
   * while the tree is still the one it was raised on), and this warning has to
   * outlive both.
   *
   * Two slots behind it (`storageNotices`), shown together. A save's own
   * failure (`full`, `conflict`) is retired by the next save that lands, and a
   * conflict also by a workspace swap, which points saving at a design this
   * tab can write. `degraded` and `loadFailed` are facts about this session
   * that a later save does not undo, and `idbKeyValueStore.markDegraded()` is
   * one-way and never notifies twice, so a message cleared or overwritten
   * there would never be raised again.
   */
  storageWarning: string | null;
  storageNotices: { standing: StorageNotice | null; save: StorageNotice | null };
  selectedId: string | null;
  /**
   * Bumped by every selection gesture, including one that picks the part that
   * was already selected.
   *
   * `selectedId` alone cannot carry that: tapping the same part in the drawing
   * a second time writes the id it already holds, so nothing downstream sees an
   * event. The component dialog (the editor below the property column's
   * breakpoint) opens on this rather than on the id, or the part it left
   * selected when it closed could not be reopened without first selecting
   * something else.
   */
  selectionSeq: number;
  /**
   * The part Cut or Copy put aside, with its subtree. Not part of the design or
   * of undo, and kept across switching designs, so a part can be pasted into
   * another design as desktop allows.
   */
  clipboard: ComponentNode | null;
  loadedMeta: LoadedMeta;
  // The live engine handle, set by the rebuild effect; read by the aero sweep,
  // the dimension fields, the file writers' part figures and the report model.
  rocket: Rocket | null;
  // --- history (undo/redo of component edits) ---
  past: HistoryEntry[];
  future: HistoryEntry[];

  // --- actions ---
  setErr: (err: string | null) => void;
  setBuildErr: (buildErr: string | null) => void;
  /** Raise (or clear, with null) the persistent storage warning. */
  setStorageWarning: (msg: string | null, kind?: StorageWarningKind) => void;
  /** Storage refused a write: raise the clearable "storage full" warning. */
  warnStorageFull: () => void;
  /** A save landed: retire a "storage full" or conflict warning, leave the standing ones. */
  clearSaveWarning: () => void;
  /**
   * When the autosave last landed (epoch ms), or null before the first one.
   *
   * There is no Save command: editing autosaves on a 500 ms debounce, and
   * unload writes a synchronous journal. This is what SaveStatus reads to tell
   * the user that saving is happening at all.
   */
  lastSavedAt: number | null;
  /**
   * Bumped by a workspace swap that must not autosave: loading a stored design
   * (boot, File > Open) and starting a blank one (New, deleting the open
   * design). The autosave effect skips the save the swap would otherwise
   * schedule (useWorkspaceEffects).
   *
   * Writing a just-loaded design back changes nothing but its `updatedAt`, so
   * the library's "most recently updated" order would mean "most recently
   * opened". Writing an untouched blank one adds a "Rocket" row to File > Open
   * for a design nobody made. An import is not quiet: it is its own design,
   * and the save is what makes its library entry.
   */
  quietReplace: number;
  /** The autosave landed. From useWorkspaceEffects, on a successful write. */
  markSaved: () => void;
  applyBuild: (info: StaticInfo | null, rocket: Rocket | null) => void; // from the rebuild effect
  hydrate: (w: {
    tree: RocketTree;
    sims: Simulation[];
    configs: FlightConfig[];
    activeId: string;
    loadedMeta: LoadedMeta;
  }) => void;

  /**
   * Scale the design, or with `scope` only the selected part (with or without
   * what is inside it), as one undo step. `options` are the Scale dialog's
   * mass and offset choices (tree/scaleRocket).
   */
  scaleDesign: (factor: number, scope?: ScaleScope, options?: ScaleOptions) => void;
  setSelectedId: (id: string | null) => void;
  patchSelected: (patch: Partial<ComponentNode>) => void;
  /**
   * Run one of the tree-shape actions from services/design/componentActions: convert a
   * fin set to freeform, split a fin set / pod / booster / cluster, reset a
   * cluster's spacing. One undo step, and nothing at all when the action says
   * there was nothing to do. `origins` collects copied parts' ids (see `reid`),
   * so their per-configuration settings follow them.
   */
  applyTreeAction: (change: (tree: RocketTree, origins: Map<string, string>) => RocketTree) => void;
  /** Dual deployment for one stage: which of its recovery devices is the
   *  drogue, or `null` for single deployment. One undo step, because it clears
   *  the rest of the stage in the same breath. */
  setStageDrogue: (stageId: string, deviceId: string | null) => void;
  /** Pick a dual-deployment stage's main device (`setStageMain`). */
  setStageMain: (stageId: string, deviceId: string) => void;
  removeSelected: () => void;
  /** Put the selected part on the clipboard. */
  copySelected: () => void;
  /** Copy the selected part, then remove it (not the last stage). */
  cutSelected: () => void;
  /** Paste the clipboard at the selection (see services/design/clipboard), selecting the copy. */
  pasteClipboard: () => void;
  /** Copy the selected part to the end of its parent, selecting the copy. */
  duplicateSelected: () => void;
  addPartToTree: (type: PartType) => void;
  addStageToTree: () => void;
  moveSelected: (dir: -1 | 1) => void;
  updateDesignMeta: (
    patch: Partial<Pick<RocketTree, 'name' | 'designer' | 'kitName' | 'comment' | 'revision' | 'designType'>>,
  ) => void;
  /** Add a material to the design's own list (desktop's document materials); one undo step, none when it is already there. */
  addDocumentMaterial: (m: DocumentMaterial) => void;
  /** Finalize the in-flight edit (slider drag / text entry) into one undo entry.
   *  Called by the editors when an interaction ends (blur / discrete change). */
  commitEdit: () => void;
  undo: () => void;
  redo: () => void;
}

/** One storage warning and the condition that raised it. */
type StorageNotice = { msg: string; kind: StorageWarningKind | null };

/** The shown storage warning for these slots: the standing notice, then the save failure. */
function storageWarningOf(
  notices: WorkspaceState['storageNotices'],
): Pick<WorkspaceState, 'storageWarning' | 'storageNotices'> {
  const shown = [notices.standing, notices.save].filter((n): n is StorageNotice => n !== null);
  return {
    storageNotices: notices,
    storageWarning: shown.length ? shown.map((n) => n.msg).join(' ') : null,
  };
}

/**
 * The workspace: one store, built from the editing core below plus seven slices:
 * navigation (viewSlice.ts), files and the design library (fileSlice.ts), flight
 * configurations (configSlice.ts), simulations (simSlice.ts), batch runs
 * (runSlice.ts), the drift sweep (driftSweepSlice.ts) and the motor guide
 * (motorGuideSlice.ts).
 *
 * The core keeps the design tree, the undo history and the workspace swap. The
 * slices are split by the actions they own, not by the fields they touch: one
 * undo entry records the tree, the configurations and the simulations together
 * (see {@link HistoryEntry}), a result ages on all three, and deleting a
 * configuration moves the simulations that flew it, so a slice still reads and
 * writes the others' fields through the one shared state. What a slice needs
 * from the core (the undo steps, the workspace swap) is handed to it here.
 */
export const useWorkspaceStore = create<WorkspaceState>((set, get, api) => {
  // --- undo/redo plumbing ---
  // A user interaction = one history entry. Continuous edits (slider drag, text
  // entry) open a transaction on the first change (capturing the pre-edit
  // snapshot) and are finalized by commitEdit() when the interaction ends;
  // structural edits (add/remove/move) are atomic and record their own step.
  let txn: HistoryEntry | null = null;
  const snap = (): HistoryEntry => {
    const s = get();
    // Drop cached flight results: large per-timestep arrays and a recomputable
    // output, not an edit. Undo/redo restores inputs and leaves sims to re-run.
    //
    // Everything else is held by reference. Workspace state is replaced on every
    // edit and never mutated, so an entry shares whatever the steps around it
    // did not change: a hundred steps of one field cost a hundred small paths,
    // not a hundred copies of the design and its thrust curves. Sharing also
    // keeps identity, so a restored tree is the very object a drift sweep or a
    // run recorded, and reads as the design it flew.
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
  /**
   * Put the recorded inputs back, and carry the live results across.
   *
   * History entries hold no results (see {@link snap}), so the live ones are
   * carried across rather than blanked: an undo of a typo must not throw away
   * numbers that are still readable. Each carries the key it was flown from, so
   * it reads outdated against the restored inputs unless they are the ones it
   * flew.
   */
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
  }; // idempotent: open a txn
  const commitEdit = () => {
    if (txn) {
      pushPast(txn);
      txn = null;
    }
  }; // finalize the open txn
  const recordStep = () => {
    commitEdit();
    pushPast(snap());
  }; // flush pending, then log this step

  /**
   * Install a whole-tree edit as one undo step, with the configurations
   * reconciled to it (a mount or stage can appear or go). The edit is computed
   * before this runs, so one that throws leaves no empty step behind, and an
   * edit that returns the tree it was given records nothing. False when nothing
   * changed.
   */
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

  /** Replace the design's own material list as one undo step, recording nothing when it is unchanged. */
  const setDocumentMaterials = (change: (list: DocumentMaterial[]) => DocumentMaterial[]) => {
    const { tree } = get();
    const list = documentMaterialsOf(tree);
    const next = change(list);
    if (next.length === list.length && next.every((m, i) => m === list[i])) return;
    // Its own step, closing any field edit still open first, as every atomic
    // change does: folded into that edit, Undo would revert both.
    recordStep();
    set((s) => ({ tree: withDocumentMaterials(s.tree, next) }));
  };

  const clearHistory = () => {
    txn = null;
    set({ past: [], future: [] });
  }; // on load / new design

  /**
   * Swap the whole workspace in one `set`, always resetting the transient block.
   *
   * `hydrate`, `openOrkFile` and `resetWorkspace` all route through here so the
   * transient block cannot outlive the design it belongs to: a stale `simRuns`,
   * `lastRunIds` or `resultSimId` points the Results tab at a run id from the
   * previous design, a batch still in flight holds `simBusy` on the new one, and
   * a standing `err` shows the old design's error under the new one. The single
   * `set` keeps a subscriber from seeing either half alone.
   *
   * A batch still running belongs to the old design, so it is canceled here
   * (its answers would be dropped by the `ranOn` guard anyway). So is an
   * autosave still pending for it: the timer is cleared only once the effect
   * re-runs, and firing before that it would write the old design under the
   * new one's entry.
   */
  const replaceWorkspace = (patch: Partial<WorkspaceState> | ((s: WorkspaceState) => Partial<WorkspaceState>)) => {
    voidPendingAutosave();
    // Flights for the outgoing design go with it (see `abortRunWork`).
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
      // Notes about values repaired in the outgoing design. `hydrate` and
      // `openOrkFile` pass their own; a new blank design has none.
      repairNotes: [],
      // A configuration id from the outgoing design; the tab follows the
      // active simulation of the new one.
      selectedConfigId: null,
      // The build, too. `info` and `rocket` describe the design on its way out,
      // and the rebuild effect only replaces them on its next run, so for one
      // frame a brand-new blank design would show the previous one's mass, CG and
      // stability. Cleared here, which is the same state the rebuild effect uses
      // for "not built yet" (`applyBuild(null, null)`), so the stats read as
      // pending rather than as someone else's numbers.
      info: null,
      rocket: null,
      // A conflict is about the outgoing design's entry, which another tab
      // moved on; the incoming design saves on its own claim.
      ...(s.storageNotices.save?.kind === 'conflict' ? storageWarningOf({ ...s.storageNotices, save: null }) : {}),
      ...(typeof patch === 'function' ? patch(s) : patch),
    }));
  };

  // The app mounts before anything is hydrated, so the default design has to be
  // a complete workspace: one simulation flying one configuration. A reader that
  // finds no simulation at all has nothing to fall back to.
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
      // A stored workspace is shape-checked before it gets here
      // (services/storage/workspaceMigrate), so this only has to repair a blob that is
      // the right shape and still partial.
      const configs = sanitizeConfigs(w.tree, w.configs);
      // And the values, which nothing clamped on the way in: a design autosaved
      // by a build without a given limit, or opened from a file by one, can
      // carry a density no material has. See `repairValues`.
      const repaired = repairValues(w.tree);
      // Radii with no value on record (a transition end, a ring's outside or
      // bore), which a design stored by an older build can carry, resolved as
      // the bridge flies them (automatic), so
      // the report drawings, the templates and the printable solids, which read
      // the tree as given, draw the radius that flies. The flight is the same
      // either way, so a result current against the stored tree is current
      // against the resolved one.
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
      // A stored design is a fresh document. Edits made to whatever was on
      // screen before it arrived (the default rocket, before the boot load
      // resolves) must not stay undoable over it.
      clearHistory();
      replaceWorkspace((s) => ({
        // Quiet unless a value was repaired. A repaired design differs from the
        // stored one, and it is the autosave that keeps the repair, so the note
        // is said once rather than on every load until the next edit.
        quietReplace: fixed.repaired.length ? s.quietReplace : s.quietReplace + 1,
        repairNotes: repairNotes(fixed.repaired),
        tree: fixed.tree,
        sims,
        configs,
        activeId,
        loadedMeta: w.loadedMeta ?? null,
      }));
      // What storage holds, unless a repair changed it (see `writtenWorkspace`).
      if (!fixed.repaired.length) markWritten(get());
    },

    // Each structural/field edit reconciles the flight configurations to the new
    // tree (drop gone mounts, seed a default for new ones) so no loadout can
    // drift from the mounts. Every configuration, because the mounts belong to
    // the shared design even though the motors seated in them belong to the
    // configurations.
    scaleDesign: (factor, scope = 'rocket', options = {}) => {
      const { tree, selectedId } = get();
      if (scope !== 'rocket') {
        if (!selectedId) return;
        commitTree(syncDerived(scalePart(tree, selectedId, factor, scope === 'subtree', options)));
        return;
      }
      // Scaling is the one tree change that does not go through `treeEdit`, so
      // it re-resolves the radii and shoulders that follow a neighbor itself:
      // a part or subtree scale changes what its neighbors follow, and a
      // whole-rocket scale without offsets moves overlaps.
      // 1x, or a non-positive or non-finite factor, returns the tree unchanged.
      commitTree(syncDerived(scaleRocket(tree, factor, options)), { selectedId: null });
    },
    setSelectedId: (selectedId) => set((s) => ({ selectedId, selectionSeq: s.selectionSeq + 1 })),
    patchSelected: (edit) => {
      const { selectedId, tree, configs } = get();
      if (!selectedId) return;
      // A fillet added here starts as epoxy rather than desktop's Cardboard.
      const patch = withFilletDefault(findNode(tree, selectedId), edit);
      // Nothing at all when the patch says what the node already says, the way
      // `applyTreeAction` and `setStageDrogue` below both return on an unchanged
      // tree. Without it a clamped keystroke would be a full kernel rebuild and an
      // undo step that changes nothing.
      if (!patchChangesNode(tree, selectedId, patch)) return;
      beginEdit();
      const next = updateNode(tree, selectedId, patch);
      // Only a change to the motor-mount flag can alter mount topology; a
      // name/length/color/slider patch can't, so skip the full tree walk on the
      // hot per-keystroke edit path.
      const touchesMounts = 'motorMount' in patch;
      const reconciled = touchesMounts ? reconcileConfigs(next, configs) : configs;
      // The mount's own ignition reaches the motors still on its old one.
      const touchesIgnition = 'ignitionEvent' in patch || 'ignitionDelay' in patch;
      set({
        tree: next,
        configs: touchesIgnition
          ? followMountIgnition(reconciled, selectedId, findNode(tree, selectedId)!, findNode(next, selectedId)!)
          : reconciled,
      });
    },
    // Splitting a cluster duplicates the tube it is on, mounts included, so the
    // mount topology really can change here, unlike a field edit.
    applyTreeAction: (change) => {
      const origins = new Map<string, string>();
      void commitTree(change(get().tree, origins), {}, origins);
    },
    setStageDrogue: (stageId, deviceId) => {
      const { tree } = get();
      const next = setStageDrogue(tree, stageId, deviceId);
      if (next === tree) return; // already the drogue, or already none
      // A whole undo step rather than an in-flight edit: this is a discrete
      // choice that can touch several devices at once, not a slider drag. The
      // flag changes warnings only, so the reconcile commitTree runs is a no-op.
      commitTree(next);
    },
    setStageMain: (stageId, deviceId) => {
      const { tree } = get();
      const next = setStageMain(tree, stageId, deviceId);
      if (next === tree) return;
      // One undo step, as the drogue is. The pick flies nothing.
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
      // Settings ▸ Materials: a new part carries the material the user set for
      // its type, outright, so it shows in the panel and lands in the .ork.
      const seed = defaultMaterialPatch(type, loadSettings().defaultMaterials) as Partial<ComponentNode>;
      const { tree: next, id } = addPart(tree, type, selectedId, seed);
      // A new part is selected the moment it exists, and that counts as a
      // selection: on a narrow window it is what opens the editor over it.
      commitTree(next, { selectedId: id, selectionSeq: selectionSeq + 1 });
    },
    addStageToTree: () => {
      const { tree: next, id } = addStage(get().tree);
      commitTree(next, { selectedId: id, selectionSeq: get().selectionSeq + 1 });
    },
    moveSelected: (dir) => {
      const { selectedId, tree } = get();
      if (!selectedId) return;
      // At either end of its siblings the part has nowhere to go and the tree
      // comes back unchanged, which is not an undo step.
      commitTree(moveNode(tree, selectedId, dir));
    },
    updateDesignMeta: (patch) => {
      // Applied in one shot from the Rocket-configuration dialog → one undo step.
      // OK on an unedited dialog changes nothing, and must not record a step,
      // clear redo or replace the tree. An absent design type reads as
      // "original" everywhere (the exporter writes it so), so the dialog's
      // default for it is not a change either.
      const { tree } = get();
      const differs = (Object.keys(patch) as (keyof typeof patch)[]).some((k) =>
        k === 'designType' ? (patch[k] ?? 'original') !== (tree[k] ?? 'original') : patch[k] !== tree[k],
      );
      if (!differs) return;
      // Its own step, closing any field edit still open first (see setDocumentMaterials).
      recordStep();
      set((s) => ({ tree: { ...s.tree, ...patch } }));
    },
    addDocumentMaterial: (m) => setDocumentMaterials((list) => withDocumentMaterial(list, m)),
    commitEdit,
    undo: () => {
      commitEdit(); // fold any in-flight edit into history so it undoes in one step
      const { past, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1]!;
      set({ past: past.slice(0, -1), future: [...future, snap()], ...restore(prev) });
    },
    redo: () => {
      // As undo does: an in-flight edit is folded into history first. It is a
      // new edit, so it clears the redo stack rather than being overwritten by it.
      commitEdit();
      const { past, future } = get();
      if (!future.length) return;
      const next = future[future.length - 1]!;
      set({ future: future.slice(0, -1), past: [...past, snap()], ...restore(next) });
    },
  };
});
