import { describe, it, expect } from 'vitest';
import { useWorkspaceStore } from '../../src/state/store';

describe('where a newly opened design lands', () => {
  it('lands a reset on Design, its stats and the 2D view, from whatever tab was showing', () => {
    useWorkspaceStore.setState({ tab: 'results', designPane: 'sketch', view: 'flight' });
    useWorkspaceStore.getState().resetWorkspace();
    const s = useWorkspaceStore.getState();
    expect({ tab: s.tab, designPane: s.designPane, view: s.view }).toEqual({
      tab: 'design',
      designPane: 'stats',
      view: '2d',
    });
  });
});
