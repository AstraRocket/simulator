// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { MotorRow } from '../../../src/components/sim/MotorRow';
import { C6 } from '../../../src/engine/api';
import type { IgnitionEvent } from '../../../src/engine/openRocketEngine';

afterEach(cleanup);

function row(event: IgnitionEvent, delay: number, everywhere = false) {
  const onIgnitionChange = vi.fn();
  renderWithProviders(
    <MotorRow
      motor={C6}
      onChange={() => {}}
      onError={() => {}}
      ignition={{ event, delay }}
      onIgnitionChange={onIgnitionChange}
      ignitionEverywhere={everywhere}
    />,
  );
  return onIgnitionChange;
}

describe('a motor whose curve the builder would skip', () => {
  it('is shown as missing, with no curve to open, as Run treats it', () => {
    // An embedded motor with every mass zero: `curveProblem` refuses it.
    const damaged = { ...C6, masses: C6.masses.map(() => 0) };
    renderWithProviders(<MotorRow motor={damaged} onChange={() => {}} onError={() => {}} />);
    expect(screen.getByText('Not in the catalog: choose a motor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thrust curve' })).toBeNull();
  });

  it('shows a usable curve as a motor', () => {
    renderWithProviders(<MotorRow motor={C6} onChange={() => {}} onError={() => {}} />);
    expect(screen.queryByText('Not in the catalog: choose a motor')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thrust curve' })).toBeTruthy();
  });
});

describe('ignition scope and reset', () => {
  it('changes this configuration until "All configurations" is picked', () => {
    const onIgnitionChange = row('automatic', 0);
    const select = screen.getByRole('combobox', { name: 'Ignition' });
    fireEvent.change(select, { target: { value: 'burnout' } });
    expect(onIgnitionChange).toHaveBeenLastCalledWith('burnout', 0, 'config');

    fireEvent.click(screen.getByRole('radio', { name: 'All configurations' }));
    expect(screen.getByText(/in every configuration/)).toBeTruthy();
    fireEvent.change(select, { target: { value: 'launch' } });
    expect(onIgnitionChange).toHaveBeenLastCalledWith('launch', 0, 'all');
  });

  it('applies the ignition as it stands to all configurations, unless they already have it', () => {
    const onIgnitionChange = row('launch', 1);
    expect(screen.queryByRole('button', { name: 'Apply to all configurations' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'All configurations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all configurations' }));
    expect(onIgnitionChange).toHaveBeenLastCalledWith('launch', 1, 'all');
    cleanup();

    row('launch', 1, true);
    fireEvent.click(screen.getByRole('radio', { name: 'All configurations' }));
    expect((screen.getByRole('button', { name: 'Apply to all configurations' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('resets this configuration to Automatic with no delay', () => {
    const onIgnitionChange = row('burnout', 2);
    fireEvent.click(screen.getByRole('radio', { name: 'All configurations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset ignition' }));
    expect(onIgnitionChange).toHaveBeenLastCalledWith('automatic', 0, 'config');
  });

  it('commits no delay while the delay box is cleared to retype', () => {
    const onIgnitionChange = row('burnout', 2);
    const box = screen.getByRole('spinbutton', { name: 'Ignition delay (s)' });
    fireEvent.change(box, { target: { value: '' } });
    expect(onIgnitionChange).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '3' } });
    expect(onIgnitionChange).toHaveBeenLastCalledWith('burnout', 3, 'config');
  });

  it('offers no reset when the ignition is already Automatic with no delay', () => {
    row('automatic', 0);
    expect((screen.getByRole('button', { name: 'Reset ignition' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
