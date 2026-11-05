import type { StateCreator } from 'zustand';
import { scalePart, scaleRocket, type ScaleOptions, type ScaleScope } from '../tree/scaleRocket';
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
import { reconcileConfigs, followMountIgnition } from '../services/flight/flightConfigs';
import { loadSettings } from '../services/storage/settings';
import { defaultMaterialPatch } from '../services/design/materialSlots';
import type { WorkspaceState } from './store';

// Only types from './store': store.ts calls `createEditSlice` while still loading.
export interface EditSlice {
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
}

interface EditSliceShared {
  beginEdit: () => void;
  recordStep: () => void;
  commitTree: (next: RocketTree, extra?: Partial<WorkspaceState>, origins?: ReadonlyMap<string, string>) => boolean;
}

export const createEditSlice =
  ({ beginEdit, recordStep, commitTree }: EditSliceShared): StateCreator<WorkspaceState, [], [], EditSlice> =>
  (set, get) => {
    const setDocumentMaterials = (change: (list: DocumentMaterial[]) => DocumentMaterial[]) => {
      const { tree } = get();
      const list = documentMaterialsOf(tree);
      const next = change(list);
      if (next.length === list.length && next.every((m, i) => m === list[i])) return;
      // Its own step: folded into an open field edit, Undo would revert both.
      recordStep();
      set((s) => ({ tree: withDocumentMaterials(s.tree, next) }));
    };

    return {
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
        const was = findNode(tree, selectedId);
        const now = findNode(next, selectedId);
        set({
          tree: next,
          configs: touchesIgnition && was && now ? followMountIgnition(reconciled, selectedId, was, now) : reconciled,
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
    };
  };
