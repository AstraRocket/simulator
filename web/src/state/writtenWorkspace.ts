import type { WorkspaceState } from './store';

type Written = Pick<WorkspaceState, 'tree' | 'sims' | 'configs' | 'activeId' | 'loadedMeta'>;

// Compared by identity: every edit replaces the object it changes.
let written: Written | null = null;

export function markWritten(s: Written): void {
  written = { tree: s.tree, sims: s.sims, configs: s.configs, activeId: s.activeId, loadedMeta: s.loadedMeta };
}

// `s` is passed in because the store imports this module.
export function recordWrite(fields: Written, s: Pick<WorkspaceState, 'clearSaveWarning' | 'markSaved'>): void {
  markWritten(fields);
  s.clearSaveWarning();
  s.markSaved();
}

export function unchangedSinceWrite(s: Written): boolean {
  return (
    written !== null &&
    written.tree === s.tree &&
    written.sims === s.sims &&
    written.configs === s.configs &&
    written.activeId === s.activeId &&
    written.loadedMeta === s.loadedMeta
  );
}

// React clears the autosave timer only after the store changes, so the timer checks this token.
let autosaveToken = 0;

export function currentAutosaveToken(): number {
  return autosaveToken;
}

export function voidPendingAutosave(): void {
  autosaveToken++;
}

// A save during a delete would re-add the removed index row, so saves are held.
let saveHolds = 0;

export function holdSaves(): () => void {
  saveHolds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    saveHolds--;
  };
}

export function savesHeld(): boolean {
  return saveHolds > 0;
}
