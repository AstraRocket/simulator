import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../../src/state/store';
import { useConfirmStore, confirm } from '../../src/state/confirmStore';
import { usePromptStore, prompt } from '../../src/state/promptStore';
import { workInProgress } from '../../src/state/workInProgress';

describe('workInProgress', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ simBusy: false, driftSweepRun: null });
    useConfirmStore.getState().settle(false);
    usePromptStore.getState().settle(null);
  });

  it('is false with nothing going on', () => {
    expect(workInProgress()).toBe(false);
  });

  it('is true while a batch flies', () => {
    useWorkspaceStore.setState({ simBusy: true });
    expect(workInProgress()).toBe(true);
  });

  it('is true while a drift sweep flies', () => {
    useWorkspaceStore.setState({ driftSweepRun: { simId: 's', done: 0, total: 4 } });
    expect(workInProgress()).toBe(true);
  });

  it('is true while a confirm dialog waits on an answer', () => {
    void confirm({ message: 'Overwrite?' });
    expect(workInProgress()).toBe(true);
    useConfirmStore.getState().settle(true);
    expect(workInProgress()).toBe(false);
  });

  it('is true while a name dialog waits on an answer', () => {
    void prompt({ title: 'Name', confirmLabel: 'Save', initialName: 'Rocket' });
    expect(workInProgress()).toBe(true);
  });
});
