import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18nGlobal, { isLanguageReady, languageReady } from '../i18n';
import { useWorkspaceStore, selectConfig, saveFailure, workspaceSnapshot, type WorkspaceState } from './store';
import { simPrefsOf } from './workspaceSelectors';
import { currentAutosaveToken, markWritten, recordWrite, savesHeld, unchangedSinceWrite } from './writtenWorkspace';
import { setKernelLengthUnit, type RocketTree } from '../engine/openRocketEngine';

import { useEngineStore } from './engineStore';
import { getWorkspaceStore } from '../services/storage/workspaceStore';
import { onStorageDegraded } from '../services/storage/idbKeyValueStore';
import { requestPersistentStorage } from '../services/storage/persistStorage';
import { computeStaticInfo, buildKey } from '../services/design/buildRocket';
import { buildFailureText } from '../services/flight/runnability';
import { useSettings } from './useSettings';
import { warmSimWorker } from '../engine/simClient';
import { appName, defaultDesignName } from '../services/app/appInfo';
import { defaultStageName } from '../services/design/orkTree';

export const REBUILD_DEBOUNCE_MS = 150;

type Boot = Pick<WorkspaceState, 'tree' | 'sims' | 'configs'>;

// Every edit replaces the object it changes, so identity means untouched.
function untouchedSinceBoot(boot: Boot): boolean {
  const s = useWorkspaceStore.getState();
  return s.tree === boot.tree && s.sims === boot.sims && s.configs === boot.configs;
}

// The store built the default before the language bundle landed, with English fallbacks.
function nameDefaultDesign(boot: Boot): void {
  if (!untouchedSinceBoot(boot)) return;
  const s = useWorkspaceStore.getState();
  const [stage, ...rest] = s.tree.components;
  const [sim, ...others] = s.sims;
  if (!stage || !sim) return;
  const name = defaultDesignName();
  const stageName = defaultStageName(0);
  const simName = i18nGlobal.t('sims.untitled', { n: 1 });
  if (s.tree.name === name && stage.name === stageName && sim.name === simName) return;
  useWorkspaceStore.setState({
    tree: { ...s.tree, name, components: [{ ...stage, name: stageName }, ...rest] },
    sims: [{ ...sim, name: simName }, ...others],
    quietReplace: s.quietReplace + 1,
  });
}

function persist(fields: Parameters<typeof workspaceSnapshot>[0]): void {
  getWorkspaceStore()
    .save(workspaceSnapshot(fields))
    .then(() => {
      recordWrite(fields, useWorkspaceStore.getState());
      void requestPersistentStorage();
    })
    .catch((e: unknown) => {
      const { msg, kind } = saveFailure(e);
      useWorkspaceStore.getState().setStorageWarning(msg, kind);
    });
}

export function useWorkspaceEffects() {
  // Effects use `i18nGlobal`, never the hook's `t`: in deps it would re-run hydration on a language switch.
  const { i18n } = useTranslation();
  useEffect(() => {
    document.title = appName();
  }, [i18n.language]);

  useEffect(() => {
    warmSimWorker();
  }, []);

  const hydrated = useRef(false);
  const seenQuiet = useRef(useWorkspaceStore.getState().quietReplace);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const language = languageReady();
    const boot: Boot = useWorkspaceStore.getState();
    const keepDefault = () => {
      nameDefaultDesign(boot);
      markWritten(useWorkspaceStore.getState());
    };
    const finish = () => {
      hydrated.current = true;
      setReady(true);
    };
    getWorkspaceStore()
      .load()
      .then(async (w) => {
        await language;
        // Inside the guard, or StrictMode's canceled first load builds the design twice.
        if (!live) return;
        if (w && untouchedSinceBoot(boot)) useWorkspaceStore.getState().hydrate(w);
        else if (w) {
          // Edited during the wait: detach so the stored design stays unchanged.
          getWorkspaceStore().setActiveId?.(null);
          persist(useWorkspaceStore.getState());
        } else if (untouchedSinceBoot(boot)) {
          keepDefault();
        }
        finish();
      })
      // Detach first, or the first edit would autosave over the design that failed to open.
      .catch(async () => {
        await language;
        if (!live) return;
        getWorkspaceStore().setActiveId?.(null);
        if (untouchedSinceBoot(boot)) keepDefault();
        finish();
        useWorkspaceStore.getState().setStorageWarning(i18nGlobal.t('storage.loadFailed'), 'loadFailed');
      });
    return () => {
      live = false;
    };
  }, []);

  const tree = useWorkspaceStore((s) => s.tree);
  const sims = useWorkspaceStore((s) => s.sims);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const configs = useWorkspaceStore((s) => s.configs);
  const loadedMeta = useWorkspaceStore((s) => s.loadedMeta);
  const quietReplace = useWorkspaceStore((s) => s.quietReplace);
  // A string because zustand v5 compares selector results by identity.
  const buildInputs = useWorkspaceStore((s) => buildKey(s.tree, selectConfig(s)));
  const enginePhase = useEngineStore((s) => s.phase);
  const lengthUnit = useSettings().settings.units.length;
  const rebuildSeq = useWorkspaceStore((s) => s.rebuildSeq);

  useEffect(() => {
    if (seenQuiet.current !== quietReplace) {
      seenQuiet.current = quietReplace;
      return;
    }
    if (!hydrated.current) return;
    // A swap before this fires voids it: the store may point at another design.
    const token = currentAutosaveToken();
    const id = setTimeout(() => {
      if (token !== currentAutosaveToken() || savesHeld()) return;
      persist({ tree, sims, configs, activeId, loadedMeta });
    }, 500);
    return () => clearTimeout(id);
  }, [tree, sims, configs, activeId, loadedMeta, quietReplace]);

  // IndexedDB blocked means the 5 MB localStorage cap.
  useEffect(
    () =>
      onStorageDegraded(() => {
        const warn = () => useWorkspaceStore.getState().setStorageWarning(i18nGlobal.t('storage.degraded'), 'degraded');
        if (isLanguageReady()) warn();
        else void languageReady().then(warn);
      }),
    [],
  );

  // An async IndexedDB write cannot finish during unload, so flush uses the sync localStorage journal.
  // On mobile, hidden is often the last event before the tab is discarded.
  useEffect(() => {
    const snapshot = () => workspaceSnapshot(useWorkspaceStore.getState());
    const flush = () => {
      if (!hydrated.current || savesHeld() || unchangedSinceWrite(useWorkspaceStore.getState())) return;
      const store = getWorkspaceStore();
      if (store.saveSync) store.saveSync(snapshot());
      else store.save(snapshot()).catch(() => {});
    };
    const onHidden = () => {
      if (!hydrated.current || savesHeld() || document.visibilityState !== 'hidden') return;
      const fields = useWorkspaceStore.getState();
      if (unchangedSinceWrite(fields)) return;
      getWorkspaceStore()
        .save(workspaceSnapshot(fields))
        .then(() => recordWrite(fields, useWorkspaceStore.getState()))
        .catch(() => {});
      flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush();
      const s = useWorkspaceStore.getState();
      if (!hydrated.current || s.storageNotices.save === null || unchangedSinceWrite(s)) return;
      e.preventDefault();
      // Chrome before 119 and older Safari ask only when this is set.
      e.returnValue = '';
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);

  // Keyed on `tree.components`, not `tree`, so a designer/comment edit does not rebuild.
  const components = tree.components;
  const builtOnce = useRef(false);
  const errTree = useRef<RocketTree | null>(null);
  useEffect(
    () =>
      useWorkspaceStore.subscribe((st, prev) => {
        if (st.err && st.err !== prev.err) errTree.current = st.tree;
      }),
    [],
  );
  useEffect(() => {
    if (!ready) return;
    if (enginePhase !== 'ready') {
      builtOnce.current = false;
      // A retry resets the engine, voiding every handle the old one issued.
      const store = useWorkspaceStore.getState();
      if (store.rocket || store.info) store.applyBuild(null, null);
      return;
    }
    const build = () => {
      setKernelLengthUnit(lengthUnit);
      const store = useWorkspaceStore.getState();
      // Read from the store, not closed over: the deps are only narrow rebuild keys.
      const res = computeStaticInfo(store.tree, selectConfig(store));
      if ('error' in res) {
        store.applyBuild(null, null);
        store.setBuildErr(buildFailureText(res, i18nGlobal.t.bind(i18nGlobal)));
      } else {
        store.applyBuild(res.info, res.rocket);
        store.setBuildErr(null);
        if (store.err && store.tree !== errTree.current) store.setErr(null);
      }
    };
    if (!builtOnce.current) {
      builtOnce.current = true;
      build();
      return;
    }
    const id = setTimeout(build, REBUILD_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [ready, enginePhase, components, buildInputs, lengthUnit, rebuildSeq]);

  const { settings } = useSettings();
  useEffect(() => {
    useWorkspaceStore.getState().setSimPrefs(simPrefsOf(settings));
  }, [settings]);
}
