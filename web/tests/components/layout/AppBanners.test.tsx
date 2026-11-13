// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { AppBanners } from '../../../src/components/layout/AppPanes';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';

// Screen readers skip a live region mounted together with its text.
describe('the storage warning', () => {
  it('speaks through a region that was already there, empty, before the warning', () => {
    useWorkspaceStore.setState({ storageWarning: null, err: null, buildErr: null });
    renderWithProviders(<AppBanners />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');

    act(() => useWorkspaceStore.setState({ storageWarning: 'Storage is full.' }));
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('Storage is full.');
  });
});
