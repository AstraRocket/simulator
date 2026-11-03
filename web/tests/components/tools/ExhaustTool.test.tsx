// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';

const base = { manufacturer: 'Test', class: 'H', diameter: 29, burn: 1, mass: 200, impulse: 200 };
const CATALOG: CatalogMotor[] = [
  { ...base, designation: 'H1', propInfo: 'Blackjack' },
  { ...base, designation: 'H2', propInfo: 'Black Max', sparky: true },
  { ...base, designation: 'H3', propInfo: 'White Lightning' },
  { ...base, designation: 'H4' },
];

vi.mock('../../../src/services/motors/motorDb', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadCatalog: () => Promise.resolve(CATALOG),
}));

const { ExhaustTool } = await import('../../../src/components/tools/ExhaustTool');

/** The tile under a look's heading. */
const tile = (name: string) => screen.getByRole('heading', { name }).closest('li')!;

describe('the exhaust looks tool', () => {
  it('shows every look, with the catalog propellants that take it', async () => {
    renderWithProviders(<ExhaustTool />);
    expect(screen.getByRole('heading', { name: 'Exhaust looks' })).toBeTruthy();
    await waitFor(() => expect(tile('Dark smoke').textContent).toMatch(/Black Max, Blackjack/));
    expect(tile('White smoke').textContent).toMatch(/White Lightning/);
    expect(tile('Blue flame').textContent).toMatch(/No propellant in the catalog takes this look/);
  });

  it('counts the motors with no named propellant under the classic look, and sparky ones that add sparks', async () => {
    renderWithProviders(<ExhaustTool />);
    await waitFor(() => expect(tile('Classic composite').textContent).toMatch(/does not name \(1\)/));
    expect(within(tile('Dark smoke')).getByText(/Sparky motors among them add sparks \(1\)/)).toBeTruthy();
  });
});
