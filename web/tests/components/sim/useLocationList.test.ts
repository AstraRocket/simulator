// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLocationList } from '../../../src/components/sim/useLocationList';
import {
  setLaunchLocationStore,
  type LaunchLocation,
  type LaunchLocationStore,
} from '../../../src/services/storage/launchLocationStore';

// No StrictMode: its double invoke would issue the mount read twice.

const HOME: LaunchLocation = {
  id: 'home',
  name: 'Home field',
  latitudeDeg: 39.05,
  longitudeDeg: -104.8,
  launchAltitudeM: 1830,
};

const noWrites = { save: async () => undefined, remove: async () => undefined };

describe('useLocationList', () => {
  beforeEach(() => setLaunchLocationStore({ list: async () => [], ...noWrites }));

  it('reads the locations on mount', async () => {
    setLaunchLocationStore({ list: async () => [HOME], ...noWrites });
    const { result } = renderHook(() => useLocationList());
    await waitFor(() => expect(result.current.locations).toEqual([HOME]));
  });

  it('starts as null, so an unread list is not an empty one', () => {
    const { result } = renderHook(() => useLocationList());
    expect(result.current.locations).toBeNull();
  });

  it('drops a first read that lands after a later one', async () => {
    let landFirstRead!: (locations: LaunchLocation[]) => void;
    let reads = 0;
    const store: LaunchLocationStore = {
      list: async () => {
        reads += 1;
        if (reads === 1) return new Promise<LaunchLocation[]>((resolve) => (landFirstRead = resolve));
        return [HOME];
      },
      ...noWrites,
    };
    setLaunchLocationStore(store);

    const { result } = renderHook(() => useLocationList());
    expect(result.current.locations).toBeNull();

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.locations).toEqual([HOME]);

    await act(async () => {
      landFirstRead([]);
    });
    expect(result.current.locations).toEqual([HOME]);
  });

  it('applies the newest read when they land in order', async () => {
    let locations = [HOME];
    setLaunchLocationStore({ list: async () => locations, ...noWrites });
    const { result } = renderHook(() => useLocationList());
    await waitFor(() => expect(result.current.locations).toEqual([HOME]));

    locations = [];
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.locations).toEqual([]);
  });

  it('settles on an empty list when the very first read fails', async () => {
    setLaunchLocationStore({
      list: async () => {
        throw new Error('blocked');
      },
      ...noWrites,
    });
    const { result } = renderHook(() => useLocationList());
    await waitFor(() => expect(result.current.locations).toEqual([]));
  });
});

describe('useLocationList when storage fails', () => {
  it('reports the failure rather than reading it as no locations', async () => {
    setLaunchLocationStore({
      list: async () => {
        throw new Error('IndexedDB is unavailable');
      },
      ...noWrites,
    });
    const { result } = renderHook(() => useLocationList());
    await waitFor(() => expect(result.current.error).toMatch(/IndexedDB is unavailable/));
  });

  it('clears the failure once a read succeeds', async () => {
    let fail = true;
    setLaunchLocationStore({
      list: async () => {
        if (fail) throw new Error('busy');
        return [HOME];
      },
      ...noWrites,
    });
    const { result } = renderHook(() => useLocationList());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    fail = false;
    await act(() => result.current.refresh());
    expect(result.current.error).toBeNull();
    expect(result.current.locations).toEqual([HOME]);
  });
});
