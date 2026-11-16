import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { getDesignLibrary, type DesignMeta } from '../services/storage/designLibrary';
import { getWorkspaceStore, lean, resultsOf } from '../services/storage/workspaceStore';
import { migrateWorkspace } from '../services/storage/workspaceMigrate';
import { workspaceSnapshot } from './workspaceSelectors';
import type { WorkspaceState } from './store';
import { LAND_ON_DESIGN } from './viewSlice';
import { claimWorkspace, observeWorkspace, workspaceHandoff } from './workspaceHandoff';
import { holdSaves, voidPendingAutosave } from './writtenWorkspace';

// Only types from './store': store.ts calls `createDesignLibrarySlice` while still loading.
export interface DesignLibrarySlice {
  designs: DesignMeta[];
  activeDesignId: string | null;
  refreshDesigns: () => Promise<void>;
  openDesign: (id: string) => Promise<void>;
  saveDesignAs: (name: string) => Promise<void>;
  renameDesign: (id: string, name: string) => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;
}

interface DesignLibrarySliceShared {
  clearHistory: () => void;
}

let designsGen = 0;

export const createDesignLibrarySlice =
  ({ clearHistory }: DesignLibrarySliceShared): StateCreator<WorkspaceState, [], [], DesignLibrarySlice> =>
  (set, get) => {
    const { flushActive, flushOutgoing, pointAtShown } = workspaceHandoff(get);

    return {
      designs: [],
      activeDesignId: null,

      refreshDesigns: async () => {
        const mine = ++designsGen;
        const lib = getDesignLibrary();
        const [designs, activeDesignId] = [await lib.list(), await lib.activeId()];
        if (mine !== designsGen) return;
        set({ designs, activeDesignId });
      },

      openDesign: async (id) => {
        const stale = claimWorkspace();
        const missing = async () => {
          set({ err: i18n.t('library.missing') });
          await pointAtShown();
          await get().refreshDesigns();
        };

        const lib = getDesignLibrary();
        // The boot path's shape check: a malformed blob would reach the kernel.
        const w = migrateWorkspace(await lib.read(id));
        if (stale()) return;
        if (!w) return missing();
        await flushOutgoing(stale);
        if (stale()) return;
        if (!(await lib.setActive(id))) {
          if (!stale()) get().warnStorageFull();
          return;
        }
        if (stale()) return;
        const store = getWorkspaceStore();
        let opened: typeof w | null = w;
        if (store.openActive) {
          try {
            opened = await store.openActive(id, stale);
          } catch {
            opened = null;
          }
        } else store.setActiveId?.(id);
        if (stale()) return;
        if (!opened) return missing();
        clearHistory();
        get().hydrate(opened);
        set({ selectedId: null, ...LAND_ON_DESIGN });
        await get().refreshDesigns();
      },

      saveDesignAs: async (name) => {
        const s = get();
        // Replaced mid-create: stay detached, or autosaves would write the new design into this entry.
        const stale = observeWorkspace();
        const lib = getDesignLibrary();
        const snapshot = workspaceSnapshot(s);
        let meta;
        try {
          // Flights live under their own key; they can overflow the 5 MB localStorage fallback.
          meta = await lib.create(name.trim() || i18n.t('library.untitled'), lean(snapshot));
        } catch {
          if (stale()) return;
          get().warnStorageFull();
          return;
        }
        await lib.writeResults(meta.id, resultsOf(snapshot)).catch(() => false);
        if (stale()) return;
        getWorkspaceStore().setActiveId?.(meta.id);
        await get().refreshDesigns();
      },

      renameDesign: async (id, name) => {
        if (!(await getDesignLibrary().rename(id, name.trim() || i18n.t('library.untitled')))) {
          get().warnStorageFull();
        }
        await get().refreshDesigns();
      },

      deleteDesign: async (id) => {
        const lib = getDesignLibrary();
        const wasActive = get().activeDesignId === id;
        // An autosave landing during the remove would write the entry back.
        if (wasActive) voidPendingAutosave();
        const release = wasActive ? holdSaves() : () => {};
        let removed: boolean;
        try {
          removed = await lib.remove(id);
        } catch (e) {
          release();
          throw e;
        }
        if (!removed) {
          release();
          if (wasActive && get().activeDesignId === id) await flushActive();
          get().warnStorageFull();
          await get().refreshDesigns();
          return;
        }
        // Rechecked after the await: a design opened during remove() must not be reset.
        if (wasActive && get().activeDesignId === id) {
          getWorkspaceStore().setActiveId?.(null);
          get().resetWorkspace();
        }
        release();
        await get().refreshDesigns();
      },
    };
  };
