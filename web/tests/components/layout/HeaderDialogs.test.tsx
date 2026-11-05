// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useHeaderDialogs } from '../../../src/components/layout/HeaderDialogs';
import { useWorkspaceStore } from '../../../src/state/store';
import { renderWithProviders } from '../../testing/renderWithProviders';

function Harness() {
  const { open, dialogs } = useHeaderDialogs();
  return (
    <>
      <button type="button" onClick={() => open('saveAs')}>
        open save as
      </button>
      {dialogs}
    </>
  );
}

describe('Save As', () => {
  const real = useWorkspaceStore.getState().saveDesignAs;
  afterEach(() => act(() => useWorkspaceStore.setState({ saveDesignAs: real, err: null })));

  it('reports a rejected save in the error banner', async () => {
    act(() =>
      useWorkspaceStore.setState({
        err: null,
        saveDesignAs: () => Promise.reject(new Error('library refused')),
      }),
    );
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'open save as' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useWorkspaceStore.getState().err).toContain('library refused'));
  });
});

describe('Save As name', () => {
  const before = useWorkspaceStore.getState();
  afterEach(() => act(() => useWorkspaceStore.setState({ tree: before.tree, loadedMeta: before.loadedMeta })));

  it("offers the rocket's own name over the imported file's", async () => {
    act(() =>
      useWorkspaceStore.setState({
        tree: { ...before.tree, name: 'Renamed' },
        loadedMeta: { name: 'imported', notes: [], exportMotors: {} },
      }),
    );
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'open save as' }));
    expect(await screen.findByDisplayValue('Renamed')).toBeTruthy();
  });

  it("falls back to the imported file's name when the rocket has none", async () => {
    act(() =>
      useWorkspaceStore.setState({
        tree: { ...before.tree, name: '' },
        loadedMeta: { name: 'imported', notes: [], exportMotors: {} },
      }),
    );
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'open save as' }));
    expect(await screen.findByDisplayValue('imported')).toBeTruthy();
  });
});
