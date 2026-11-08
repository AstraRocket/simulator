// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';

const saveSettings = vi.hoisted(() => vi.fn());
const loadSettings = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/storage/settings', async (orig) => {
  const real = await orig<typeof import('../../src/services/storage/settings')>();
  // The workspace store reads settings at import, before any test sets its own.
  loadSettings.mockImplementation(real.loadSettings);
  return { ...real, saveSettings, loadSettings };
});

import { SettingsProvider } from '../../src/state/SettingsProvider';
import { useSettings } from '../../src/state/useSettings';
import { DEFAULT_SETTINGS } from '../../src/services/storage/settings';
import { nsKey } from '../../src/services/storage/storageKeys';

type SettingsUpdate = ReturnType<typeof useSettings>['update'];

function Harness({ onReady }: { onReady: (u: (p: Record<string, unknown>) => void) => void }) {
  const { update } = useSettings();
  onReady(update as (p: Record<string, unknown>) => void);
  return null;
}

beforeEach(() => {
  saveSettings.mockClear();
  loadSettings.mockReset();
});

describe('SettingsProvider persistence', () => {
  it('does not write settings back on mount', () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    render(
      <SettingsProvider>
        <Harness onReady={() => {}} />
      </SettingsProvider>,
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('writes once the user actually changes something', () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    let update!: (p: Record<string, unknown>) => void;
    render(
      <SettingsProvider>
        <Harness onReady={(u) => (update = u)} />
      </SettingsProvider>,
    );
    expect(saveSettings).not.toHaveBeenCalled();

    act(() => update({ units: { ...DEFAULT_SETTINGS.units, length: 'in' } }));
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(saveSettings.mock.calls[0]![0].units.length).toBe('in');
  });

  // A "skip the first run" ref fails under StrictMode: effects run twice and refs persist.
  it('does not write on mount under StrictMode either', () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    render(
      <StrictMode>
        <SettingsProvider>
          <Harness onReady={() => {}} />
        </SettingsProvider>
      </StrictMode>,
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe('SettingsProvider with another tab writing', () => {
  const KEY = nsKey('settings:v1');

  function Probe({ onRender }: { onRender: (ctx: ReturnType<typeof useSettings>) => void }) {
    onRender(useSettings());
    return null;
  }

  afterEach(() => localStorage.clear());

  it('reloads when another tab writes the settings', () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS, theme: 'dark' });
    let theme = '';
    render(
      <SettingsProvider>
        <Probe onRender={(c) => (theme = c.settings.theme)} />
      </SettingsProvider>,
    );
    expect(theme).toBe('dark');

    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS, theme: 'light' });
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' })));
    expect(theme).toBe('dark');
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY })));
    expect(theme).toBe('light');
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('lays a change over what storage holds, not over the stale copy', () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS, theme: 'dark' });
    let update!: SettingsUpdate;
    render(
      <SettingsProvider>
        <Probe onRender={(c) => (update = c.update)} />
      </SettingsProvider>,
    );
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'light' }));

    act(() => update({ units: { ...DEFAULT_SETTINGS.units, length: 'in' } }));
    const written = saveSettings.mock.calls[0]![0] as typeof DEFAULT_SETTINGS;
    expect(written.units.length).toBe('in');
    expect(written.theme).toBe('light');
  });

  it('keeps a change storage refused, so the next change does not take it back', () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS, theme: 'dark' });
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'dark' }));
    let update!: SettingsUpdate;
    render(
      <SettingsProvider>
        <Probe onRender={(c) => (update = c.update)} />
      </SettingsProvider>,
    );
    saveSettings.mockReturnValueOnce(false).mockReturnValueOnce(true);
    act(() => update({ theme: 'light' }));
    act(() => update({ units: { ...DEFAULT_SETTINGS.units, length: 'in' } }));
    const written = saveSettings.mock.calls[1]![0] as typeof DEFAULT_SETTINGS;
    expect(written.theme).toBe('light');
    expect(written.units.length).toBe('in');
  });

  it("writes a newer build's keys back as stored", () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    let update!: SettingsUpdate;
    render(
      <SettingsProvider>
        <Probe onRender={(c) => (update = c.update)} />
      </SettingsProvider>,
    );
    const newer = { panelLayout: { rows: 3, pinned: ['stats'] }, beta: true };
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...newer }));
    const stored = JSON.parse(localStorage.getItem(KEY)!) as Record<string, unknown>;

    act(() => update({ theme: 'light' }));
    const written = saveSettings.mock.calls[0]![0] as Record<string, unknown>;
    expect(written['panelLayout']).toEqual(stored['panelLayout']);
    expect(written['beta']).toEqual(stored['beta']);
    expect(written['theme']).toBe('light');
  });
});

function Grab({ onReady }: { onReady: (api: ReturnType<typeof useSettings>) => void }) {
  onReady(useSettings());
  return null;
}

describe('SettingsProvider reset', () => {
  it('installs a copy of the defaults, not the shared constant', () => {
    loadSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    saveSettings.mockReturnValue(true);
    let api!: ReturnType<typeof useSettings>;
    render(
      <SettingsProvider>
        <Grab onReady={(a) => (api = a)} />
      </SettingsProvider>,
    );
    act(() => api.reset());
    expect(api.settings).toEqual(DEFAULT_SETTINGS);
    expect(api.settings).not.toBe(DEFAULT_SETTINGS);
    expect(api.settings.simulation).not.toBe(DEFAULT_SETTINGS.simulation);
  });
});
