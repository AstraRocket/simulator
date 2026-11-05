import { getDesignLibrary } from '../services/storage/designLibrary';
import { getWorkspaceStore } from '../services/storage/workspaceStore';
import { saveFailure, workspaceSnapshot } from './workspaceSelectors';
import type { WorkspaceState } from './store';
import { recordWrite, savesHeld, unchangedSinceWrite, voidPendingAutosave } from './writtenWorkspace';

// Every workspace replace bumps this; each continuation re-checks it after every await.
let workspaceGen = 0;
export const claimWorkspace = (): (() => boolean) => {
  const mine = ++workspaceGen;
  return () => mine !== workspaceGen;
};
// Saves must not claim: that would make an in-flight import stale and silently drop it.
export const observeWorkspace = (): (() => boolean) => {
  const mine = workspaceGen;
  return () => mine !== workspaceGen;
};

export function workspaceHandoff(get: () => WorkspaceState) {
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

  return { flushActive, flushOutgoing, pointAtShown };
}
