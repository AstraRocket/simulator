// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';

const loadCatalog = vi.fn(() => Promise.resolve([]));
vi.mock('../../../src/services/motors/motorDb', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadCatalog: () => loadCatalog(),
}));

const { MotorDashboard } = await import('../../../src/components/sim/MotorDashboard');
const { MotorDialog } = await import('../../../src/components/sim/MotorDialog');

describe('the motor catalog is only fetched when a dialog opens', () => {
  beforeEach(() => loadCatalog.mockClear());

  it('MotorDashboard does not fetch while closed', () => {
    const open = false;
    renderWithProviders(<>{open && <MotorDashboard onClose={() => {}} />}</>);
    expect(loadCatalog).not.toHaveBeenCalled();
  });

  it('MotorDashboard fetches once it is opened', () => {
    renderWithProviders(<MotorDashboard onClose={() => {}} />);
    expect(loadCatalog).toHaveBeenCalledTimes(1);
  });

  it('MotorDialog does not fetch while closed', () => {
    const open = false;
    renderWithProviders(
      <>{open && <MotorDialog onClose={() => {}} onSelect={() => {}} onError={() => {}} mount={{ bore: 18 }} />}</>,
    );
    expect(loadCatalog).not.toHaveBeenCalled();
  });

  it('MotorDialog fetches once it is opened', () => {
    renderWithProviders(<MotorDialog onClose={() => {}} onSelect={() => {}} onError={() => {}} mount={{ bore: 18 }} />);
    expect(loadCatalog).toHaveBeenCalledTimes(1);
  });
});

describe('the motor search box', () => {
  it('is named in the motor dashboard, not only by its placeholder', () => {
    const { unmount } = renderWithProviders(<MotorDashboard onClose={() => {}} />);
    expect(screen.getByRole('textbox', { name: /Search by code/ })).toBeTruthy();
    unmount();
  });
});
