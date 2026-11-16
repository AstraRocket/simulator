import { useWorkspaceStore } from './store';
import { useConfirmStore } from './confirmStore';
import { usePromptStore } from './promptStore';
import { jobRunning } from './runSlice';

// Open dialogs count: an import can be waiting on one mid-action.
export function workInProgress(): boolean {
  return (
    jobRunning(useWorkspaceStore.getState()) ||
    useConfirmStore.getState().request !== null ||
    usePromptStore.getState().request !== null
  );
}
