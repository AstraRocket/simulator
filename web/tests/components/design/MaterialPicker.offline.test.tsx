// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MaterialPicker } from '../../../src/components/design/MaterialPicker';
import { renderWithProviders } from '../../testing/renderWithProviders';

const stubFetch = (impl: () => Promise<unknown>) => vi.stubGlobal('fetch', impl);

describe('MaterialPicker with no catalog', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubFetch(() => Promise.reject(new Error('offline')));
  });

  it('says the list could not be loaded', async () => {
    renderWithProviders(<MaterialPicker value={undefined} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeTruthy());
  });

  it('still names the material the part is made of', async () => {
    renderWithProviders(<MaterialPicker value="Plywood (birch)" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeTruthy());
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('Plywood (birch)');
  });

  it('does not claim the part has no material', async () => {
    renderWithProviders(<MaterialPicker value="Plywood (birch)" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeTruthy());
    expect(screen.queryByText(/No material assigned/i)).toBeNull();
  });
});
