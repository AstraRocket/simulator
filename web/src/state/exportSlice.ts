import type { StateCreator } from 'zustand';
import i18n from '../i18n';
import { mergePalette } from '../services/design/partColors';
import type { DesignInfo } from '../services/files/orkTypes';
import type { buildRocketTree } from '../engine/api';
import type { ComponentInfo, OpenRocketDesign, RocketTree } from '../engine/openRocketEngine';
import type { StageLaunch } from '../services/files/rasaero/stageLaunch';
import { buildDesignInfo } from '../services/report/designInfo';
import { buildExportMotorMap, fillMotorDigests } from '../services/motors/exportMotors';
import { builtFrom, computeStaticInfo } from '../services/design/buildRocket';
import { stageNodes, walkNodes } from '../tree/treeWalk';
import { effectivePrefs, isOutdated } from '../services/flight/simulations';
import { loadSettings } from '../services/storage/settings';
import { configuredTree, stageFlies, type FlightConfig } from '../services/flight/flightConfigs';
import { overridesStages, stageStacks } from '../services/files/rocksim/stageStacks';
import { designNameOf } from '../services/app/appInfo';
import { errorText, keyedText, type Keyed } from '../i18n/keyedError';
import { fmtList, partLabel } from '../i18n/format';
import { configOf, selectActive, selectConfig, selectDesignName } from './workspaceSelectors';
import { reportSource } from './reportSource';
import type { WorkspaceState } from './store';
import { observeWorkspace } from './workspaceHandoff';

// Only types from './store': store.ts calls `createExportSlice` while still loading.
export interface ExportSlice {
  saveOrk: () => Promise<void>;
  saveRkt: () => Promise<void>;
  exportPrint: (opts: import('../services/exports/rocketPrintExport').PrintExportOptions) => Promise<void>;
  saveRasaero: () => Promise<void>;
  exportJson: () => Promise<void>;
  exportComponent: (nodeId: string, format: import('../services/files/componentFormats').ExportFormat) => Promise<void>;
}

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

export const createExportSlice: StateCreator<WorkspaceState, [], [], ExportSlice> = (set, get) => {
  const rebuildNow = (tree: RocketTree, config: FlightConfig): OpenRocketDesign | undefined => {
    const built = computeStaticInfo(tree, config);
    if ('error' in built) return undefined;
    get().applyBuild(built.info, built.rocket);
    return built.rocket;
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

  return {
    saveOrk: async () => {
      try {
        const replaced = observeWorkspace();
        // Lazy, to stay out of the first load, and before the snapshot, so the report matches it.
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
          const report = assembleReport(reportSource(get()));
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
