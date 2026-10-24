// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { PropertyPane } from '../../../src/components/design/PropertyPane';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import type { RocketTree } from '../../../src/engine/openRocketEngine';

/**
 * The editor belongs to one part. An await still running in it (a custom
 * material being saved, say) applies its result through the selection, so if
 * the same editor stayed mounted when another part of the same kind was
 * selected, the result would land on that part instead.
 */
describe('the property editor and the selection', () => {
  const tree = {
    name: 'Two tubes',
    components: [
      {
        type: 'stage',
        id: 'st',
        children: [
          { type: 'bodytube', id: 'a', name: 'Upper', length: 0.3, outerRadius: 0.025, thickness: 0.001 },
          { type: 'bodytube', id: 'b', name: 'Lower', length: 0.3, outerRadius: 0.025, thickness: 0.001 },
        ],
      },
    ],
  } as unknown as RocketTree;

  it('is a fresh editor for each part selected, even one of the same kind', () => {
    act(() => useWorkspaceStore.setState({ tree, selectedId: 'a' }));
    renderWithProviders(<PropertyPane />);
    const before = screen.getAllByRole('spinbutton')[0]!;
    act(() => useWorkspaceStore.setState({ selectedId: 'b' }));
    expect(screen.getAllByRole('spinbutton')[0]).not.toBe(before);
    expect(before.isConnected).toBe(false);
  });
});
