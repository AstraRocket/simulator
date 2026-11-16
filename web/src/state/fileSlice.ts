import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { confirm } from './confirmStore';
import { prompt } from './promptStore';
import { launcherKind } from '../services/design/launcher';
import type { RocketTree } from '../engine/openRocketEngine';
import type { LaunchConditions } from '../services/design/orkTree';
import { repairValues } from '../services/design/repairValues';
import { wireLoadedOrk } from '../services/files/wireLoadedOrk';
import { assertImportSize } from '../services/files/decodeText';
// Static: a dynamic import here only triggers rolldown's ineffective-dynamic-import warning.
import { fetchExample } from '../services/storage/exampleLibrary';
import { loadSettings } from '../services/storage/settings';
import { importNotes } from '../services/files/importBanner';
import { configPowerClass } from '../services/flight/powerClass';
import { configFor, type FlightConfig } from '../services/flight/flightConfigs';
import { defaultDesignName } from '../services/app/appInfo';
import { getDesignLibrary } from '../services/storage/designLibrary';
import { getWorkspaceStore } from '../services/storage/workspaceStore';
import { actionError, KeyedError } from '../i18n/keyedError';
import { hasCapability } from '../services/app/device';
import { displayUnits, firstSim, freshWorkspace, repairNotes } from './workspaceSelectors';
import type { WorkspaceState } from './store';
import { LAND_ON_DESIGN } from './viewSlice';
import { claimWorkspace, observeWorkspace, workspaceHandoff } from './workspaceHandoff';
import { markWritten } from './writtenWorkspace';

// Only types from './store': store.ts calls `createFileSlice` while still loading.
export interface FileSlice {
  openOrkFile: (file: Blob) => Promise<void>;
  /** Claims the workspace before the fetch, so a slow first example cannot land after a later open. */
  openExample: (file: string) => Promise<void>;
  openNewDesign: (tree: RocketTree, config: FlightConfig, launch: Partial<LaunchConditions>) => Promise<void>;
  resetWorkspace: () => void;
  importSeq: number;
  rebuildSeq: number;
  newWorkspace: () => Promise<void>;
  /** `resetWorkspace` alone voids the pending autosave, losing an edit inside its debounce. */
  leaveForNew: () => Promise<void>;
}

interface FileSliceShared {
  replaceWorkspace: (patch: Partial<WorkspaceState> | ((s: WorkspaceState) => Partial<WorkspaceState>)) => void;
  clearHistory: () => void;
}

export const createFileSlice =
  ({ replaceWorkspace, clearHistory }: FileSliceShared): StateCreator<WorkspaceState, [], [], FileSlice> =>
  (set, get) => {
    const { flushOutgoing, pointAtShown } = workspaceHandoff(get);

    const uniqueName = (base: string, taken: string[]): string => {
      const used = new Set(taken.map((n) => n.trim().toLowerCase()));
      if (!used.has(base.toLowerCase())) return base;
      for (let n = 2; n < 1000; n++) {
        const candidate = `${base} (${n})`;
        if (!used.has(candidate.toLowerCase())) return candidate;
      }
      return `${base} (${Date.now()})`;
    };

    // Settle before `replaceWorkspace`, or the autosave would create the entry while the dialog is open.
    const homeForImport = async (
      importedName: string,
      stale: () => boolean,
    ): Promise<{ id: string | null; name: string } | null> => {
      const lib = getDesignLibrary();
      const wanted = importedName.trim() || defaultDesignName();
      const list = await lib.list();
      if (stale()) return null;
      const clash = list.find((m) => m.name.trim().toLowerCase() === wanted.toLowerCase());
      if (!clash) return { id: null, name: wanted };

      const overwrite = await confirm({
        title: i18n.t('library.importClashTitle'),
        message: i18n.t('library.importClash', { name: clash.name }),
        confirmLabel: i18n.t('library.overwrite'),
        cancelLabel: i18n.t('library.renameInstead'),
      });
      if (stale()) return null;
      if (overwrite) {
        if (!(await lib.setActive(clash.id))) {
          if (!stale()) get().warnStorageFull();
          return null;
        }
        return stale() ? null : { id: clash.id, name: clash.name };
      }

      const taken = list.map((m) => m.name);
      const suggested = uniqueName(wanted, taken);
      const chosen = await prompt({
        title: i18n.t('library.importNameTitle'),
        confirmLabel: i18n.t('common.save'),
        initialName: suggested,
        takenNames: taken,
      });
      if (stale()) return null;
      // Canceling the name dialog keeps the import under the suggested name.
      return { id: null, name: chosen?.trim() || suggested };
    };

    const enterHome = async (
      importedName: string,
      stale: () => boolean,
    ): Promise<{ id: string | null; name: string } | null> => {
      const home = await homeForImport(importedName, stale);
      if (stale()) return null;
      if (!home) {
        await pointAtShown();
        return null;
      }
      // The replace cancels the pending autosave, so flush first.
      await flushOutgoing(stale);
      if (stale()) return null;
      clearHistory();
      getWorkspaceStore().setActiveId?.(home.id);
      if (!home.id) getWorkspaceStore().setPendingName?.(home.name);
      return home;
    };

    return {
      importSeq: 0,
      rebuildSeq: 0,

      openOrkFile: async (file) => {
        const stale = claimWorkspace();
        let engineTouched = false;
        try {
          // Size first: arrayBuffer() holds the whole file in memory.
          assertImportSize(file.size);
          const bytes = await file.arrayBuffer();
          if (stale()) return;
          const { sniffDesignFormat } = await import('../services/files/designFile');
          if (!hasCapability('import:rocksim') && sniffDesignFormat(bytes) === 'rkt') {
            throw new KeyedError('errors.file.rktDesktopOnly');
          }
          const { loadOrk } = await import('../services/files/loadOrk');
          engineTouched = true;
          const res = await loadOrk(bytes);
          if (stale()) return;
          const { tree, configs, sims, activeId, loadedMeta } = wireLoadedOrk(
            res,
            loadSettings().launchDefaults,
            get().simPrefs,
          );
          const home = await enterHome(loadedMeta.name, stale);
          if (!home) return;
          const fixed = repairValues(tree);
          // From the imported tree: the store still holds the previous design.
          const launcher = launcherKind(fixed.tree);
          const flights = sims.map((sim) => ({
            launch: sim.launch,
            powerClass: configPowerClass(fixed.tree, configFor(configs, sim.configId), null),
          }));
          const notes = importNotes(loadedMeta.notes, flights, launcher, displayUnits());
          replaceWorkspace({
            repairNotes: repairNotes(fixed.repaired),
            tree: fixed.tree,
            loadedMeta: { ...loadedMeta, notes },
            sims,
            configs,
            activeId,
            selectedId: null,
            ...LAND_ON_DESIGN,
            activeDesignId: home.id,
            importSeq: get().importSeq + 1,
          });
          engineTouched = false;
        } catch (e) {
          if (stale()) return;
          set({ err: actionError('errors.openOrk', e, i18n.t) });
          await pointAtShown().catch(() => {});
        } finally {
          // The design still on screen holds a voided handle until rebuilt.
          if (engineTouched) set({ rebuildSeq: get().rebuildSeq + 1 });
        }
      },
      openNewDesign: async (tree, config, launch) => {
        const stale = claimWorkspace();
        const home = await enterHome(tree.name ?? '', stale);
        if (!home) return;
        const s0 = firstSim(config.id, launch);
        replaceWorkspace(() => ({
          tree: { ...tree, name: home.name },
          loadedMeta: null,
          sims: [s0],
          configs: [config],
          activeId: s0.id,
          selectedId: null,
          activeDesignId: home.id,
          ...LAND_ON_DESIGN,
        }));
      },
      openExample: async (file) => {
        const stale = claimWorkspace();
        try {
          const bytes = await fetchExample(file);
          if (!stale()) await get().openOrkFile(new Blob([bytes]));
        } catch (e) {
          if (!stale()) set({ err: actionError('errors.openExample', e, i18n.t) });
        }
      },

      resetWorkspace: () => {
        claimWorkspace();
        const { tree, config, sim: s0 } = freshWorkspace();
        clearHistory();
        // Detach, or the first autosave would write this blank design over the last one.
        getWorkspaceStore().setActiveId?.(null);
        replaceWorkspace((s) => ({
          quietReplace: s.quietReplace + 1,
          activeDesignId: null,
          tree,
          loadedMeta: null,
          sims: [s0],
          configs: [config],
          activeId: s0.id,
          selectedId: null,
          ...LAND_ON_DESIGN,
        }));
        // Not worth storing until it is edited (see `writtenWorkspace`).
        markWritten(get());
      },
      newWorkspace: async () => {
        const ok = await confirm({
          title: i18n.t('file.new'),
          message: i18n.t('file.newConfirm'),
          confirmLabel: i18n.t('file.new'),
        });
        if (!ok) return;
        await get().leaveForNew();
      },
      leaveForNew: async () => {
        const stale = observeWorkspace();
        await flushOutgoing(stale);
        if (!stale()) get().resetWorkspace();
      },
    };
  };
