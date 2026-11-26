import { useWorkspaceStore } from './store';
import { useConfirmStore } from './confirmStore';
import { usePromptStore } from './promptStore';
import { jobRunning } from './runSlice';
import { unchangedSinceWrite } from './writtenWorkspace';

// Open dialogs count: an import can be waiting on one mid-action.
export function workInProgress(): boolean {
  return (
    jobRunning(useWorkspaceStore.getState()) ||
    useConfirmStore.getState().request !== null ||
    usePromptStore.getState().request !== null
  );
}

/**
 * What a reload this tab did not ask for would take away: the above, the undo history, an edit not
 * yet stored, or a save that is failing. The active-design pointer is shared, so a reloaded tab can
 * also come back on another tab's design.
 */
export function reloadLosesWork(): boolean {
  const s = useWorkspaceStore.getState();
  return (
    workInProgress() ||
    s.past.length > 0 ||
    s.future.length > 0 ||
    s.storageNotices.save !== null ||
    !unchangedSinceWrite(s)
  );
}
