// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { RevisionLog } from '../../../src/components/design/RevisionLog';
import { useWorkspaceStore } from '../../../src/state/store';
import { renderWithProviders } from '../../testing/renderWithProviders';

vi.mock('../../../src/state/confirmStore', () => ({ confirm: vi.fn(async () => true) }));

describe('RevisionLog', () => {
  const updateDesignMeta = vi.fn();
  const older = { id: 'a', date: '2026-01-01', note: 'First' };
  const newer = { id: 'b', date: '2026-02-01', note: 'Second' };

  beforeEach(() => {
    updateDesignMeta.mockClear();
    useWorkspaceStore.setState({
      tree: { name: 'R', components: [], revisionLog: [older, newer] },
      updateDesignMeta,
    } as never);
  });

  it('lists newest first', () => {
    renderWithProviders(<RevisionLog />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Second');
    expect(items[1]).toContain('First');
  });

  it('adds a trimmed note on the chosen date, and needs a note first', () => {
    renderWithProviders(<RevisionLog />);
    const add = screen.getByRole('button', { name: 'Add revision' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Entry date'), { target: { value: '2026-03-04' } });
    fireEvent.change(screen.getByLabelText('Revision note'), { target: { value: '  Longer tube ' } });
    fireEvent.click(add);
    expect(updateDesignMeta).toHaveBeenCalledWith({
      revisionLog: [older, newer, { id: expect.any(String), date: '2026-03-04', note: 'Longer tube' }],
    });
    expect((screen.getByLabelText('Revision note') as HTMLTextAreaElement).value).toBe('');
  });

  it('removes an entry, and clears the field with the last one', async () => {
    renderWithProviders(<RevisionLog />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove the revision from 2026-02-01' }));
    await waitFor(() => expect(updateDesignMeta).toHaveBeenCalledWith({ revisionLog: [older] }));
    useWorkspaceStore.setState({ tree: { name: 'R', components: [], revisionLog: [older] } } as never);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the revision from 2026-01-01' }));
    await waitFor(() => expect(updateDesignMeta).toHaveBeenLastCalledWith({ revisionLog: undefined }));
  });
});
