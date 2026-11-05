// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { TreePanel } from '../../../src/components/design/TreePanel';
import { useWorkspaceStore } from '../../../src/state/store';
import type { RocketTree } from '../../../src/engine/openRocketEngine';

const TREE = {
  name: 'Test',
  components: [
    {
      id: 's1',
      type: 'stage',
      name: 'Sustainer',
      children: [
        { id: 'n1', type: 'nosecone', name: 'Nose', length: 0.1 },
        { id: 'b1', type: 'bodytube', name: 'Body', length: 0.3 },
      ],
    },
  ],
} as unknown as RocketTree;

const row = (name: RegExp) => screen.getByRole('treeitem', { name });

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  // jsdom has no matchMedia, which each row's export button queries (useCapability).
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  useWorkspaceStore.setState({ tree: TREE, selectedId: 'b1', clipboard: null });
});

describe('tree shortcuts on the focused row', () => {
  it('copies the row the arrow key reached, not the earlier selection', () => {
    renderWithProviders(<TreePanel />);
    row(/Body/).focus();
    fireEvent.keyDown(row(/Body/), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(row(/Nose/));
    fireEvent.keyDown(row(/Nose/), { key: 'c', ctrlKey: true });
    expect(useWorkspaceStore.getState().clipboard?.id).toBe('n1');
    expect(useWorkspaceStore.getState().selectedId).toBe('n1');
  });

  it('still acts on the selected row when focus is on it', () => {
    renderWithProviders(<TreePanel />);
    row(/Body/).focus();
    fireEvent.keyDown(row(/Body/), { key: 'c', ctrlKey: true });
    expect(useWorkspaceStore.getState().clipboard?.id).toBe('b1');
    expect(useWorkspaceStore.getState().selectedId).toBe('b1');
  });
});
