import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { confirm } from './confirmStore';
import { prompt } from './promptStore';
import { defaultRocketTree } from '../services/design/defaultRocket';
import { launcherKind } from '../services/design/launcher';
import { mergePalette } from '../services/design/partColors';
import type { DesignInfo } from '../services/files/orkTypes';
import type { buildRocketTree } from '../engine/api';
import type { ComponentInfo, OpenRocketDesign, RocketTree } from '../engine/openRocketEngine';
import type { LaunchConditions } from '../services/design/orkTree';
import type { StageLaunch } from '../services/files/rasaero/stageLaunch';
import { buildDesignInfo } from '../services/report/designInfo';
import { buildExportMotorMap, fillMotorDigests } from '../services/motors/exportMotors';
import { repairValues } from '../services/design/repairValues';
import { builtFrom, computeStaticInfo } from '../services/design/buildRocket';
import { stageNodes, walkNodes } from '../tree/treeWalk';
import { wireLoadedOrk } from '../services/files/wireLoadedOrk';
import { assertImportSize } from '../services/files/decodeText';
// Static: a dynamic import here only triggers rolldown's ineffective-dynamic-import warning.
import { fetchExample } from '../services/storage/exampleLibrary';
import { effectivePrefs, isOutdated, newSimulation } from '../services/flight/simulations';
import { loadSettings } from '../services/storage/settings';
import { importNotes } from '../services/files/importBanner';
import { configPowerClass } from '../services/flight/powerClass';
import { configFor, configuredTree, stageFlies, type FlightConfig } from '../services/flight/flightConfigs';
import { overridesStages, stageStacks } from '../services/files/rocksim/stageStacks';
import { defaultDesignName, designNameOf } from '../services/app/appInfo';
import { getDesignLibrary, type DesignMeta } from '../services/storage/designLibrary';
import { getWorkspaceStore, lean, resultsOf } from '../services/storage/workspaceStore';
import { migrateWorkspace } from '../services/storage/workspaceMigrate';
import { errorText, keyedText, KeyedError, type Keyed } from '../i18n/keyedError';
import { hasCapability } from '../services/app/device';
import { fmtList, partLabel } from '../i18n/format';
import {
  configOf,
  defaultConfig,
  displayUnits,
  repairNotes,
  saveFailure,
  selectActive,
  selectConfig,
  selectDesignName,
  workspaceSnapshot,
} from './workspaceSelectors';
import type { WorkspaceState } from './store';
import { showing } from './viewSlice';
import {
  holdSaves,
  markWritten,
  recordWrite,
  savesHeld,
  unchangedSinceWrite,
  voidPendingAutosave,
} from './writtenWorkspace';

// Only types from './store': store.ts calls `createFileSlice` while still loading.
export interface FileSlice {
  openOrkFile: (file: Blob) => Promise<void>;
  openExample: (file: string) => Promise<void>;
  openNewDesign: (tree: RocketTree, config: FlightConfig, launch: Partial<LaunchConditions>) => Promise<void>;
  resetWorkspace: () => void;
  designs: DesignMeta[];
  activeDesignId: string | null;
  importSeq: number;
  rebuildSeq: number;
  refreshDesigns: () => Promise<void>;
  openDesign: (id: string) => Promise<void>;
  saveDesignAs: (name: string) => Promise<void>;
  renameDesign: (id: string, name: string) => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;
  newWorkspace: () => Promise<void>;
  /** `resetWorkspace` alone voids the pending autosave, losing an edit inside its debounce. */
  leaveForNew: () => Promise<void>;
  saveOrk: () => Promise<void>;
  saveRkt: () => Promise<void>;
  exportPrint: (opts: import('../services/exports/rocketPrintExport').PrintExportOptions) => Promise<void>;
  saveRasaero: () => Promise<void>;
  exportJson: () => Promise<void>;
  exportComponent: (nodeId: string, format: import('../services/files/componentFormats').ExportFormat) => Promise<void>;
}

interface FileSliceShared {
  replaceWorkspace: (patch: Partial<WorkspaceState> | ((s: WorkspaceState) => Partial<WorkspaceState>)) => void;
  clearHistory: () => void;
}

// Every workspace replace bumps this; each continuation re-checks it after every await.
let workspaceGen = 0;
let designsGen = 0;
const claimWorkspace = (): (() => boolean) => {
  const mine = ++workspaceGen;
  return () => mine !== workspaceGen;
};
// Saves must not claim: that would make an in-flight import stale and silently drop it.
const observeWorkspace = (): (() => boolean) => {
  const mine = workspaceGen;
  return () => mine !== workspaceGen;
};

type KernelFigures = (id: string) => ComponentInfo | undefined;

// Read eagerly: the next build frees this handle, and a save awaits before it writes.
function figuresOf(rocket: ReturnType<typeof buildRocketTree>, tree: RocketTree): KernelFigures {
  const figures = new Map<string, ComponentInfo>();
  for (const node of walkNodes(tree.components)) {
    if (typeof node.id !== 'string') continue;
    try {
      figures.set(node.id, rocket.componentInfo(node.id));
    } catch {
      // not in this build
    }
  }
  return (id: string) => figures.get(id);
}

export const createFileSlice =
  ({ replaceWorkspace, clearHistory }: FileSliceShared): StateCreator<WorkspaceState, [], [], FileSlice> =>
  (set, get) => {
    const rebuildNow = (tree: RocketTree, config: FlightConfig): OpenRocketDesign | undefined => {
      const built = computeStaticInfo(tree, config);
      if ('error' in built) return undefined;
      get().applyBuild(built.info, built.rocket);
      return built.rocket;
    };

    // False if storage refused it; callers report it, since only the autosave raises the banner.
    const flushActive = async (): Promise<boolean> => {
      const fields = get();
      if (unchangedSinceWrite(fields)) return true;
      // The open design is being deleted (see `holdSaves`).
      if (savesHeld()) return true;
      try {
        await getWorkspaceStore().save(workspaceSnapshot(fields));
        recordWrite(fields, get());
        return true;
      } catch (e) {
        lastFlushFailure = e;
        return false;
      }
    };

    const flushOutgoing = async (stale: () => boolean): Promise<void> => {
      // Else the autosave timer could fire after the store moves to the incoming design.
      voidPendingAutosave();
      if (!(await flushActive()) && !stale()) {
        const { msg, kind } = saveFailure(lastFlushFailure);
        get().setStorageWarning(msg, kind);
      }
    };
    let lastFlushFailure: unknown = null;

    // Call only from the non-stale action, so it never moves a pointer a later action set.
    const pointAtShown = async (): Promise<void> => {
      const shown = get().activeDesignId;
      if (!shown) return;
      const lib = getDesignLibrary();
      if ((await lib.activeId()) !== shown) await lib.setActive(shown);
    };

    const figuresFor = (tree: RocketTree): KernelFigures | undefined => {
      const built = buildFor(tree);
      return built ? figuresOf(built, tree) : undefined;
    };

    // The store's build inside the rebuild debounce is stale, so check it was made from `tree`.
    const buildFor = (tree: RocketTree): OpenRocketDesign | undefined => {
      const { rocket } = get();
      if (rocket && builtFrom(rocket) === tree.components) return rocket;
      return rebuildNow(tree, selectConfig(get()));
    };

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
      designs: [],
      activeDesignId: null,
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
            tab: 'design',
            designPane: 'stats',
            view: '2d',
            activeDesignId: home.id,
            importSeq: get().importSeq + 1,
          });
          engineTouched = false;
        } catch (e) {
          if (stale()) return;
          set({ err: i18n.t('errors.openOrk', { reason: errorText(e, i18n.t) }) });
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
        const s0 = newSimulation(i18n.t('sims.untitled', { n: 1 }), config.id, {
          ...loadSettings().launchDefaults,
          ...launch,
        });
        replaceWorkspace((s) => ({
          tree: { ...tree, name: home.name },
          loadedMeta: null,
          sims: [s0],
          configs: [config],
          activeId: s0.id,
          selectedId: null,
          tab: 'design',
          activeDesignId: home.id,
          ...showing(s, '2d'),
        }));
      },
      openExample: async (file) => {
        try {
          const bytes = await fetchExample(file);
          await get().openOrkFile(new Blob([bytes]));
        } catch (e) {
          set({ err: i18n.t('errors.openExample', { reason: errorText(e, i18n.t) }) });
        }
      },
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
        set((s) => ({ selectedId: null, ...showing(s, '2d') }));
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

      resetWorkspace: () => {
        claimWorkspace();
        const tree = defaultRocketTree();
        const config = defaultConfig(tree);
        const s0 = newSimulation(i18n.t('sims.untitled', { n: 1 }), config.id, loadSettings().launchDefaults);
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
          ...showing(s, '2d'),
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
      saveOrk: async () => {
        try {
          const replaced = observeWorkspace();
          // Lazy (a static import closes a store cycle) and before the snapshot, so the report matches it.
          const reportMods = loadSettings().saveDesignInfo ? await import('../services/report/reportModel') : null;
          // Snapshot everything before the next await, or edits could mix into the save.
          const { tree, loadedMeta } = get();
          const activeConfigId = selectConfig(get()).id;
          const launch = selectActive(get()).launch;
          const configSnapshot = get().configs;
          // Ahead of the design-info build below, which this can make for it.
          const componentInfo = figuresFor(tree);
          const { sims: simSnapshot, simPrefs: prefsSnapshot } = get();
          let designInfo: DesignInfo | undefined;
          if (reportMods) {
            const { assembleReport } = reportMods;
            if (!get().info) rebuildNow(tree, selectConfig(get()));
            const report = assembleReport();
            if (report) designInfo = buildDesignInfo(report);
          }
          const infoLeftOut = reportMods !== null && !designInfo;
          const simulations = simSnapshot.map((sim) => {
            const summary = sim.result?.summary ?? sim.fileSummary?.summary;
            const stale = isOutdated(sim, tree, configOf(configSnapshot, sim), prefsSnapshot);
            return {
              name: sim.name,
              configId: sim.configId,
              launch: sim.launch,
              ...(summary ? { summary } : {}),
              status: !summary ? ('notsimulated' as const) : stale ? ('outdated' as const) : ('uptodate' as const),
              ...(sim.xmlExtra?.length ? { xmlExtra: sim.xmlExtra } : {}),
              ...(prefsSnapshot ? { prefs: effectivePrefs(prefsSnapshot, sim.prefs) } : {}),
            };
          });
          const base = loadedMeta?.exportMotors ?? {};
          // Digests from the catalog, not the persisted spec, which may predate them.
          const configs = await Promise.all(
            configSnapshot.map(async (c) => ({
              id: c.id,
              name: c.name,
              motors: await fillMotorDigests(buildExportMotorMap(tree, c, base)),
              deployments: c.deployments,
              separations: c.separations,
              grounded: c.grounded,
            })),
          );
          const { downloadOrk } = await import('../services/files/saveOrk');
          if (replaced()) return;
          downloadOrk({
            name: designNameOf(tree, loadedMeta),
            tree,
            componentInfo,
            configs,
            activeConfigId,
            launch,
            simulations,
            designInfo,
          });
          if (infoLeftOut) set({ err: i18n.t('errors.saveOrkNoDesignInfo') });
        } catch (e) {
          set({ err: i18n.t('errors.saveOrk', { reason: errorText(e, i18n.t) }) });
        }
      },
      saveRkt: async () => {
        try {
          const { tree, loadedMeta } = get();
          const built = buildFor(tree);
          const figures = built ? figuresOf(built, tree) : undefined;
          // RockSim stage overrides are all or nothing, so every stage is weighed.
          const config = selectConfig(get());
          const stages =
            built && overridesStages(tree) ? stageStacks(built, tree, (id) => !stageFlies(config, id)) : undefined;
          const { downloadRkt } = await import('../services/files/saveOrk');
          const name = designNameOf(tree, loadedMeta);
          const skipped = await downloadRkt(name, tree, figures, stages);
          if (skipped.length) {
            set({
              err: i18n.t('errors.exportRktPartial', { parts: fmtList(skipped.map((k) => keyedText(k, i18n.t))) }),
            });
          }
        } catch (e) {
          set({ err: i18n.t('errors.exportRkt', { reason: errorText(e, i18n.t) }) });
        }
      },
      exportPrint: async (opts) => {
        try {
          const { tree, loadedMeta } = get();
          const { downloadRocket3mf } = await import('../services/exports/rocketPrintExport');
          const name = designNameOf(tree, loadedMeta);
          const { skipped } = await downloadRocket3mf(name, tree, opts);
          if (skipped.length) set({ err: i18n.t('errors.exportPrintPartial', { parts: fmtList(skipped) }) });
        } catch (e) {
          set({ err: i18n.t('errors.exportPrint', { reason: errorText(e, i18n.t) }) });
        }
      },
      saveRasaero: async () => {
        try {
          const { tree, loadedMeta, info } = get();
          const active = selectActive(get());
          const motors = buildExportMotorMap(tree, selectConfig(get()), loadedMeta?.exportMotors ?? {});
          const { downloadCdx1 } = await import('../services/files/rasaeroExport');
          const config = selectConfig(get());
          // The selected configuration's deployments, as desktop's exporter reads them.
          const flown = configuredTree(tree, config);
          // A scratch build per stage resets the shared engine, hence the rebuild.
          let stageLaunch: StageLaunch[] | undefined;
          if (info && stageNodes(tree).length > 1) {
            const { cumulativeStageLaunch } = await import('../services/files/rasaero/stageLaunch');
            const { buildConfiguredRocket } = await import('../services/design/buildRocket');
            stageLaunch = cumulativeStageLaunch(flown, buildConfiguredRocket(flown, config));
            rebuildNow(tree, config);
          }
          const warnings: Keyed[] = [];
          downloadCdx1({
            name: designNameOf(tree, loadedMeta),
            tree: flown,
            motors,
            grounded: config.grounded,
            launch: active.launch,
            launchMassKg: info?.mass,
            launchCgM: info?.cg,
            stageLaunch,
            warnings,
          });
          if (warnings.length) set({ err: warnings.map((k) => keyedText(k, i18n.t)).join(' ') });
        } catch (e) {
          set({ err: i18n.t('errors.exportRasaero', { reason: errorText(e, i18n.t) }) });
        }
      },
      exportJson: async () => {
        try {
          const { tree, loadedMeta } = get();
          const config = selectConfig(get());
          // `cp` is read after `figuresFor`, which may rebuild the `info` it comes from.
          const figures = figuresFor(tree);
          const cp = figures ? get().info?.cp : undefined;
          const motors = await fillMotorDigests(buildExportMotorMap(tree, config, loadedMeta?.exportMotors ?? {}));
          const { downloadOnshapeJson } = await import('../services/files/onshapeExport');
          const { skipped } = await downloadOnshapeJson({
            name: designNameOf(tree, loadedMeta),
            tree,
            figures,
            cp,
            motors,
            configId: config.id,
            palette: mergePalette(loadSettings().partColors),
          });
          if (skipped.length) {
            const parts = fmtList(skipped.map((p) => partLabel(i18n.t, p)));
            set({ err: i18n.t('errors.exportJsonPartial', { parts }) });
          }
        } catch (e) {
          set({ err: i18n.t('errors.exportJson', { reason: errorText(e, i18n.t) }) });
        }
      },
      exportComponent: async (nodeId, format) => {
        try {
          const { exportComponent } = await import('../services/files/componentExport');
          const ok = await exportComponent(get().tree, nodeId, format, selectDesignName(get()), i18n.t);
          if (!ok) set({ err: i18n.t('errors.exportUnsupported', { format: format.toUpperCase() }) });
        } catch (e) {
          set({
            err: i18n.t('errors.exportFailed', {
              format: format.toUpperCase(),
              reason: errorText(e, i18n.t),
            }),
          });
        }
      },
    };
  };
