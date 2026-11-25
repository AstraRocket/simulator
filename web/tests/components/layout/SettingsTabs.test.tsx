// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { PlaybackTab, SimTab } from '../../../src/components/layout/SettingsTabs';
import { useConfirmStore } from '../../../src/state/confirmStore';
import { readSettings, renderWithProviders, seedSettings } from '../../testing/renderWithProviders';

beforeEach(() => localStorage.clear());

describe('a Settings tab alone', () => {
  it('writes the playback speed', () => {
    seedSettings({ replaySpeed: 1 });
    renderWithProviders(<PlaybackTab />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
    expect(readSettings()['replaySpeed']).toBe(4);
  });

  it('writes the flight path effects', () => {
    renderWithProviders(<PlaybackTab />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Effects' }));
    expect(readSettings()['flightEffects']).toBe(false);
  });

  it('shows the simulation defaults', () => {
    renderWithProviders(<SimTab />);
    expect(screen.getByLabelText('Time step')).toBeTruthy();
    expect(screen.getByLabelText('Max angle step')).toBeTruthy();
  });

  it('explains the max angle step, as the simulation editor does', () => {
    renderWithProviders(<SimTab />);
    expect(screen.getByText(/The most the rocket may rotate in one integration step/)).toBeTruthy();
  });
});

describe('a numeric setting', () => {
  const timeStep = () => (readSettings()['simulation'] as Record<string, number> | undefined)?.['timeStep'];

  it('is written on blur, not on each key', () => {
    renderWithProviders(<SimTab />);
    const box = screen.getByRole('spinbutton', { name: 'Time step' });
    const before = timeStep();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '0.0' } });
    fireEvent.change(box, { target: { value: '0.02' } });
    expect(timeStep()).toBe(before);
    fireEvent.blur(box);
    expect(timeStep()).toBe(0.02);
  });
});

describe('a speed warning limit', () => {
  it('takes a 0 as the smallest limit it keeps, not as the default it would come back as', () => {
    renderWithProviders(<SimTab />);
    const box = screen.getByRole('spinbutton', { name: 'Min launcher-exit velocity' });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '0' } });
    fireEvent.blur(box);
    const sim = readSettings()['simulation'] as Record<string, number>;
    expect(sim['railExitVelocityMin']).toBeCloseTo(0.1, 9);
  });
});

describe('RASAero fin interference', () => {
  const kbf = () => (readSettings()['simulation'] as Record<string, unknown> | undefined)?.['rogersKbf'];
  const box = () => screen.getByRole('checkbox', { name: /RASAero fin interference/ });
  const asked = () => useConfirmStore.getState().request;

  beforeEach(() => useConfirmStore.getState().settle(false));

  it('asks first, and stays off when the warning is canceled', async () => {
    renderWithProviders(<SimTab />);
    fireEvent.click(box());
    expect(asked()?.message).toMatch(/no longer match desktop OpenRocket/);
    useConfirmStore.getState().settle(false);
    await waitFor(() => expect(asked()).toBeNull());
    expect(kbf()).not.toBe(true);
  });

  it('turns on once confirmed', async () => {
    renderWithProviders(<SimTab />);
    fireEvent.click(box());
    useConfirmStore.getState().settle(true);
    await waitFor(() => expect(kbf()).toBe(true));
  });

  it('turns off without asking', () => {
    seedSettings({ simulation: { rogersKbf: true } });
    renderWithProviders(<SimTab />);
    fireEvent.click(box());
    expect(asked()).toBeNull();
    expect(kbf()).toBe(false);
  });
});
