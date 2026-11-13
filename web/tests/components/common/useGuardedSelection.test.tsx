// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

const confirmDelete = vi.fn<(message: string) => Promise<boolean>>();
vi.mock('../../../src/state/confirmStore', () => ({
  confirm: vi.fn(),
  confirmDelete: (message: string) => confirmDelete(message),
}));

const { useGuardedSelection } = await import('../../../src/components/common/useGuardedSelection');
const { MasterSection } = await import('../../../src/components/common/MasterDetail');

const picked = async () => {
  const hook = renderHook(() => useGuardedSelection('Discard?'));
  await act(() => hook.result.current.select('a'));
  return hook;
};

describe('removeWith', () => {
  beforeEach(() => confirmDelete.mockReset());

  it('does nothing when the delete is declined', async () => {
    confirmDelete.mockResolvedValue(false);
    const { result } = await picked();
    const remove = vi.fn(() => Promise.resolve());
    await act(() => result.current.removeWith('Delete it?', remove));
    expect(confirmDelete).toHaveBeenCalledWith('Delete it?');
    expect(remove).not.toHaveBeenCalled();
    expect(result.current.selectedId).toBe('a');
  });

  it('clears the selection after a delete', async () => {
    confirmDelete.mockResolvedValue(true);
    const { result } = await picked();
    await act(() => result.current.removeWith('Delete it?', () => Promise.resolve()));
    expect(result.current.selectedId).toBeNull();
  });

  it('keeps the selection when the delete reports false', async () => {
    confirmDelete.mockResolvedValue(true);
    const { result } = await picked();
    await act(() => result.current.removeWith('Delete it?', () => Promise.resolve(false)));
    expect(result.current.selectedId).toBe('a');
  });

  it('shows a thrown error and keeps the selection', async () => {
    confirmDelete.mockResolvedValue(true);
    const { result } = await picked();
    await act(() => result.current.removeWith('Delete it?', () => Promise.reject(new Error('disk full'))));
    expect(result.current.err).toContain('disk full');
    expect(result.current.selectedId).toBe('a');
  });
});

describe('MasterSection', () => {
  it('heads a list of rows', () => {
    render(
      <MasterSection title="Fins">
        <li>One</li>
      </MasterSection>,
    );
    expect(screen.getByRole('heading', { name: 'Fins' }).tagName).toBe('H3');
    expect(screen.getByRole('list').contains(screen.getByText('One'))).toBe(true);
  });
});
