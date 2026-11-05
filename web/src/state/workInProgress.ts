import { useWorkspaceStore } from './store';
import { useConfirmStore } from './confirmStore';
import { usePromptStore } from './promptStore';

// Open dialogs count: an import can be waiting on one mid-action.
export function workInProgress(): boolean {
  const s = useWorkspaceStore.getState();
  return (
    s.simBusy ||
    s.driftSweepRun !== null ||
    useConfirmStore.getState().request !== null ||
    usePromptStore.getState().request !== null
  );
}
