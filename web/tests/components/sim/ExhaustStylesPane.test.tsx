// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

const { ExhaustStylesPane } = await import('../../../src/components/sim/ExhaustStylesPane');
const { MotorDashboard } = await import('../../../src/components/sim/MotorDashboard');

const tile = (name: string) => screen.getByRole('heading', { name }).closest('li')!;

describe('the exhaust styles pane', () => {
  it('shows every style, with the catalog propellants that take it', async () => {
    renderWithProviders(<ExhaustStylesPane />);
    expect(screen.getByRole('heading', { name: 'Exhaust styles' })).toBeTruthy();
    await waitFor(() => expect(tile('Dark smoke').textContent).toMatch(/Black Max, Blackjack/));
    expect(tile('White smoke').textContent).toMatch(/White Lightning/);
    expect(tile('Blue flame').textContent).toMatch(/No propellant in the catalog uses this style/);
  });

  it('counts the motors with no named propellant under the classic style, and sparky ones that add sparks', async () => {
    renderWithProviders(<ExhaustStylesPane />);
    await waitFor(() => expect(tile('Classic composite').textContent).toMatch(/does not name \(1\)/));
    expect(within(tile('Dark smoke')).getByText(/Sparky motors among them add sparks \(1\)/)).toBeTruthy();
  });

  it('opens from a motor in the dashboard, by the style its detail names', async () => {
    // jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = () => {};
    renderWithProviders(<MotorDashboard onClose={() => {}} />);
    fireEvent.click(await screen.findByText('H3'));
    fireEvent.click(await screen.findByRole('button', { name: 'In the 3D flight path: White smoke.' }));
    await waitFor(() => expect(tile('White smoke').textContent).toMatch(/White Lightning/));
  });
});
