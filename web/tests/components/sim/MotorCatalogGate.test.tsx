// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MotorCatalogGate } from '../../../src/components/sim/MotorCatalogGate';
import { renderWithProviders } from '../../testing/renderWithProviders';

describe('MotorCatalogGate', () => {
  it('renders nothing once the catalog has loaded', () => {
    const { container } = renderWithProviders(<MotorCatalogGate loading={false} error={null} onRetry={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('shows the progress while loading', () => {
    renderWithProviders(<MotorCatalogGate loading error={null} onRetry={() => {}} />);
    expect(screen.getByRole('progressbar', { name: 'Loading motor catalog…' })).toBeTruthy();
  });

  it('shows the failure over the progress, with a retry', () => {
    const onRetry = vi.fn();
    renderWithProviders(<MotorCatalogGate loading error="offline" onRetry={onRetry} centered />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(/offline/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
