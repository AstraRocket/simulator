// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const fetchSurfaceWind = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/tools/surfaceWind', async (orig) => ({
  ...(await orig<typeof import('../../../src/services/tools/surfaceWind')>()),
  fetchSurfaceWind,
}));

import { forgetOffTheRail, OffTheRail } from '../../../src/components/tools/OffTheRail';
import { renderWithProviders } from '../../testing/renderWithProviders';

beforeEach(() => {
  forgetOffTheRail();
  fetchSurfaceWind.mockReset();
});

/** The status lines that have something to say. */
const spoken = () => screen.getAllByRole('status').filter((s) => s.textContent);

/**
 * A failed wind fetch is announced in the status line the other forecast tools
 * use: always mounted, so a screen reader speaks the text when it appears,
 * which a live region created together with its text does not.
 */
describe('OffTheRail wind fetch', () => {
  it('reports the failure in its always-mounted status line', async () => {
    fetchSurfaceWind.mockRejectedValue(new Error('forecast service down'));
    renderWithProviders(<OffTheRail />);
    expect(spoken()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Get the forecast wind' }));
    await waitFor(() => expect(spoken()).toHaveLength(1));
  });
});

/** A forecast belongs to the site, time and wind it was fetched for. */
describe('OffTheRail forecast line', () => {
  it('clears when the wind field changes after the fetch', async () => {
    fetchSurfaceWind.mockResolvedValue({
      speedMs: 5,
      gustMs: 9,
      validUnix: 1_700_000_000,
      answer: { timezone: 'UTC' },
    });
    renderWithProviders(<OffTheRail />);
    fireEvent.click(screen.getByRole('button', { name: 'Get the forecast wind' }));
    expect(await screen.findByText(/gusting to/)).toBeTruthy();
    const wind = screen.getByRole('spinbutton', { name: /Wind speed/ });
    fireEvent.change(wind, { target: { value: '12' } });
    fireEvent.blur(wind);
    expect(screen.queryByText(/gusting to/)).toBeNull();
  });
});

describe('OffTheRail site elevation', () => {
  it('asks for the forecast at the typed site elevation', async () => {
    fetchSurfaceWind.mockResolvedValue({
      speedMs: 5,
      gustMs: null,
      validUnix: 1_700_000_000,
      answer: { timezone: 'UTC' },
    });
    renderWithProviders(<OffTheRail />);
    const site = screen.getByRole('spinbutton', { name: /Site elevation/ });
    fireEvent.change(site, { target: { value: '1400' } });
    fireEvent.blur(site);
    fireEvent.click(screen.getByRole('button', { name: 'Get the forecast wind' }));
    expect(fetchSurfaceWind.mock.calls[0]![0]).toMatchObject({ siteM: 1400 });
  });

  it('asks for the elevation when the terrain model has none', async () => {
    fetchSurfaceWind.mockResolvedValue('noElevation');
    renderWithProviders(<OffTheRail />);
    fireEvent.click(screen.getByRole('button', { name: 'Get the forecast wind' }));
    await waitFor(() => expect(spoken()[0]?.textContent).toMatch(/elevation/));
  });
});

describe('OffTheRail site fields', () => {
  it('name the map button by its words, not its glyph', () => {
    renderWithProviders(<OffTheRail />);
    expect(screen.getByRole('button', { name: 'Show on map' })).toBeTruthy();
  });
});
