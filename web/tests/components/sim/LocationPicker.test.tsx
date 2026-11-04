// @vitest-environment jsdom
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { LocationPicker } from '../../../src/components/sim/LocationPicker';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useConfirmStore } from '../../../src/state/confirmStore';
import {
  setLaunchLocationStore,
  type LaunchLocation,
  type LaunchLocationStore,
} from '../../../src/services/storage/launchLocationStore';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import { loadSettings } from '../../../src/services/storage/settings';

const DEFAULT_SITE = loadSettings().launchDefaults;

// StrictMode: its double-invoked cleanup would leave `useLocationList`'s `useLatest` guard stale.

function memoryStore(seed: LaunchLocation[] = []): LaunchLocationStore {
  let items = [...seed];
  return {
    list: async () => items,
    save: async (p) => {
      items = [p, ...items.filter((x) => x.id !== p.id)];
    },
    remove: async (id) => {
      items = items.filter((x) => x.id !== id);
    },
  };
}

const HOME: LaunchLocation = {
  id: 'home',
  name: 'Home field',
  latitudeDeg: 39.05,
  longitudeDeg: -104.8,
  launchAltitudeM: 1830,
};

const launch = (over: Partial<LaunchConditions> = {}): LaunchConditions =>
  ({
    launchRodLengthM: 1,
    launchRodAngleDeg: 0,
    windAverage: 2,
    windStdDev: 0.2,
    launchAltitudeM: 0,
    latitudeDeg: 28.6,
    longitudeDeg: -80.6,
    temperatureC: null,
    pressureHPa: null,
    ...over,
  }) as LaunchConditions;

const render = (props: Partial<Parameters<typeof LocationPicker>[0]> = {}) => {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  renderWithProviders(
    <StrictMode>
      <LocationPicker launch={launch()} onChange={onChange} onCommit={onCommit} {...props} />
    </StrictMode>,
  );
  return { onChange, onCommit };
};

describe('LocationPicker', () => {
  beforeEach(() => setLaunchLocationStore(memoryStore([HOME])));

  it('lists saved locations after the store round-trip', async () => {
    render();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Home field' })).toBeTruthy());
  });

  it('applies the three site fields, and nothing else', async () => {
    const { onChange, onCommit } = render();
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'home' } });

    expect(onChange).toHaveBeenCalledWith({
      latitudeDeg: 39.05,
      longitudeDeg: -104.8,
      launchAltitudeM: 1830,
    });
    expect(onCommit).toHaveBeenCalled();
  });

  it('applies an unknown elevation as blank and recognizes it on screen', async () => {
    setLaunchLocationStore(memoryStore([{ ...HOME, id: 'club', name: 'Club field', launchAltitudeM: null }]));
    const { onChange } = render();
    await waitFor(() => screen.getByRole('option', { name: 'Club field' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'club' } });
    expect(onChange).toHaveBeenCalledWith({ latitudeDeg: 39.05, longitudeDeg: -104.8, launchAltitudeM: null });
  });

  it('returns the site to the launch defaults when Custom location is picked', async () => {
    // The select's value derives from the fields, so the option must change them or React restores the match.
    const { onChange, onCommit } = render({
      launch: launch({ latitudeDeg: 39.05, longitudeDeg: -104.8, launchAltitudeM: 1830 }),
    });
    const select = () => screen.getByRole('combobox') as HTMLSelectElement;
    await waitFor(() => expect(select().value).toBe('home'));

    fireEvent.change(select(), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({
      latitudeDeg: DEFAULT_SITE.latitudeDeg,
      longitudeDeg: DEFAULT_SITE.longitudeDeg,
      launchAltitudeM: DEFAULT_SITE.launchAltitudeM,
    });
    for (const v of Object.values(onChange.mock.calls[0]![0] as Record<string, unknown>)) {
      expect(typeof v).toBe('number');
    }
    expect(onCommit).toHaveBeenCalled();
  });

  it('ships the Kennedy Space Center as that default', () => {
    expect(DEFAULT_SITE.latitudeDeg).toBeCloseTo(28.61, 6);
    expect(DEFAULT_SITE.longitudeDeg).toBeCloseTo(-80.6, 6);
    expect(DEFAULT_SITE.launchAltitudeM).toBeCloseTo(0, 6);
  });

  it('shows Custom when the fields match no saved location, and the location when they do', async () => {
    render();
    const select = () => screen.getByRole('combobox') as HTMLSelectElement;
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    expect(select().value).toBe('');

    renderWithProviders(
      <LocationPicker
        launch={launch({ latitudeDeg: 39.05, longitudeDeg: -104.8, launchAltitudeM: 1830 })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      const matches = screen.getAllByRole('combobox') as HTMLSelectElement[];
      expect(matches.some((s) => s.value === 'home')).toBe(true);
    });
  });

  it('saves the fields on screen under a name', async () => {
    render();
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save this location' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'The Cape' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('option', { name: 'The Cape' })).toBeTruthy());
    const saved = await setPadThenList();
    expect(saved.find((p) => p.name === 'The Cape')).toMatchObject({
      latitudeDeg: 28.6,
      longitudeDeg: -80.6,
      launchAltitudeM: 0,
    });
  });

  it('updates a location rather than duplicating it when the name is reused', async () => {
    render();
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save this location' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Home field' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useConfirmStore.getState().request).not.toBeNull());
    act(() => useConfirmStore.getState().settle(true));

    await waitFor(async () => {
      const list = await setPadThenList();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 'home', latitudeDeg: 28.6 });
    });
  });

  it('updates a location when the name is reused in another case', async () => {
    render();
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save this location' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'home FIELD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useConfirmStore.getState().request).not.toBeNull());
    act(() => useConfirmStore.getState().settle(true));

    await waitFor(async () => {
      const list = await setPadThenList();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 'home', latitudeDeg: 28.6 });
    });
  });

  it('keeps the other location when the user declines to replace it', async () => {
    render();
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save this location' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Home field' } });
    expect(screen.getByText('Another location already has this name.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useConfirmStore.getState().request?.message).toContain('Home field'));
    act(() => useConfirmStore.getState().settle(false));

    const list = await setPadThenList();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'home', latitudeDeg: HOME.latitudeDeg });
  });

  it('says so when the store refuses the write', async () => {
    setLaunchLocationStore({
      list: async () => [],
      save: async () => {
        throw new Error('storage-full');
      },
      remove: async () => undefined,
    });
    render();
    // Most screen readers ignore a live region created with its text.
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save this location' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nowhere' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(region.textContent).toMatch(/could not be saved/i));
    expect(screen.getByRole('status')).toBe(region);
  });

  it('manages saved locations: the list shows their coordinates', async () => {
    render();
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage saved locations' }));

    const dialog = await screen.findByRole('dialog', { name: 'Manage saved locations' });
    expect(dialog.textContent).toContain('39.0500');
    // The thousands separator depends on locale.
    expect(dialog.textContent).toMatch(/1[,. ]?830\s*m/);
  });

  it('applies a location from the manage dialog to its own fields, not the active simulation', async () => {
    const { useWorkspaceStore } = await import('../../../src/state/store');
    act(() => {
      useWorkspaceStore.getState().resetWorkspace();
    });
    const st = () => useWorkspaceStore.getState();
    const activeBefore = st().sims.find((x) => x.id === st().activeId)!.launch;
    const { onChange, onCommit } = render();
    await waitFor(() => screen.getByRole('option', { name: 'Home field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage saved locations' }));
    const dialog = await screen.findByRole('dialog', { name: 'Manage saved locations' });
    fireEvent.click(await within(dialog).findByText('Home field'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use' }));

    expect(onChange).toHaveBeenCalledWith({
      latitudeDeg: HOME.latitudeDeg,
      longitudeDeg: HOME.longitudeDeg,
      launchAltitudeM: HOME.launchAltitudeM,
    });
    expect(onCommit).toHaveBeenCalled();
    expect(st().sims.find((x) => x.id === st().activeId)!.launch).toEqual(activeBefore);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Manage saved locations' })).toBeNull());
  });

  it('has nothing to manage before anything is saved', async () => {
    setLaunchLocationStore(memoryStore([]));
    render();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Manage saved locations' }) as HTMLButtonElement).disabled).toBe(true);
    });
  });
});

async function setPadThenList(): Promise<LaunchLocation[]> {
  const { getLaunchLocationStore } = await import('../../../src/services/storage/launchLocationStore');
  return getLaunchLocationStore().list();
}
