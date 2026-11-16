import type { WorkspaceState } from './store';
import {
  getWorkspaceStore,
  pickWorkspace,
  WORKSPACE_FIELDS,
  type WorkspaceField,
} from '../services/storage/workspaceStore';
import { workspaceSnapshot } from './workspaceSelectors';

type Written = Pick<WorkspaceState, WorkspaceField>;

// Compared by identity: every edit replaces the object it changes.
let written: Written | null = null;

export function markWritten(s: Written): void {
  written = pickWorkspace(s);
}

// `s` is passed in because the store imports this module.
function recordWrite(fields: Written, s: Pick<WorkspaceState, 'clearSaveWarning' | 'markSaved'>): void {
  markWritten(fields);
  s.clearSaveWarning();
  s.markSaved();
}

export function unchangedSinceWrite(s: Written): boolean {
  const w = written;
  return w !== null && WORKSPACE_FIELDS.every((k) => w[k] === s[k]);
}

/** Held during a delete (see `holdSaves`) or already stored. */
export function nothingToWrite(s: Written): boolean {
  return savesHeld() || unchangedSinceWrite(s);
}

// `now` reads the store after the await, for the same reason `recordWrite` takes `s`.
export async function writeWorkspace(
  fields: Written,
  now: () => Pick<WorkspaceState, 'clearSaveWarning' | 'markSaved'>,
): Promise<void> {
  await getWorkspaceStore().save(workspaceSnapshot(fields));
  recordWrite(fields, now());
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
