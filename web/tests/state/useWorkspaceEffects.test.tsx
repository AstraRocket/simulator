// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';

const load = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const saveSync = vi.hoisted(() => vi.fn());
const setActiveId = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/storage/workspaceStore', async (orig) => ({
  ...(await orig<typeof import('../../src/services/storage/workspaceStore')>()),
  getWorkspaceStore: () => ({ load, save, saveSync, setActiveId }),
}));

const computeStaticInfo = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/design/buildRocket', async (orig) => ({
  ...(await orig<typeof import('../../src/services/design/buildRocket')>()),
  computeStaticInfo,
}));

vi.mock('../../src/engine/simClient', () => ({ warmSimWorker: vi.fn() }));
vi.mock('../../src/services/storage/persistStorage', () => ({
  requestPersistentStorage: vi.fn(() => Promise.resolve(true)),
}));
// Never settles, so a test can observe the gap between a retry's reset and the new engine.
vi.mock('../../src/engine/openRocketEngine', async (orig) => ({
  ...(await orig<typeof import('../../src/engine/openRocketEngine')>()),
  initEngine: () => new Promise<never>(() => {}),
}));
vi.mock('../../src/services/motors/motorDb', async (orig) => ({
  ...(await orig<typeof import('../../src/services/motors/motorDb')>()),
  loadCatalog: async () => [],
}));

const degraded = vi.hoisted(() => ({ fire: null as null | (() => void) }));
vi.mock('../../src/services/storage/idbKeyValueStore', async (orig) => ({
  ...(await orig<typeof import('../../src/services/storage/idbKeyValueStore')>()),
  onStorageDegraded: (cb: () => void) => {
    degraded.fire = cb;
    return () => {
      degraded.fire = null;
    };
  },
}));

import { REBUILD_DEBOUNCE_MS, useWorkspaceEffects } from '../../src/state/useWorkspaceEffects';
import { useWorkspaceStore } from '../../src/state/store';
import { asFlown, isStale } from '../testing/flown';
import { useEngineStore } from '../../src/state/engineStore';
import { getDesignLibrary, setDesignLibrary, type DesignLibrary } from '../../src/services/storage/designLibrary';
import { renderWithProviders } from '../testing/renderWithProviders';
import i18n from '../../src/i18n';
import { AeroAnalysis } from '../../src/components/canvas/AeroAnalysis';
import { unchangedSinceWrite } from '../../src/state/writtenWorkspace';

function Host() {
  useWorkspaceEffects();
  return null;
}

const orkFile = (name: string): Blob => {
  const bytes = new TextEncoder().encode(`<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="OpenRocket 24.12">
  <rocket>
    <name>${name}</name>
    <subcomponents>
      <stage>
        <name>Sustainer</name>
        <subcomponents>
          <bodytube>
            <name>Body</name>
            <length>0.3</length>
            <thickness>0.0005</thickness>
            <radius>0.0125</radius>
          </bodytube>
        </subcomponents>
      </stage>
    </subcomponents>
  </rocket>
</openrocket>`);
  return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer as ArrayBuffer } as unknown as Blob;
};

const s = () => useWorkspaceStore.getState();
const saved = () => ({
  version: 3 as const,
  tree: { ...s().tree, name: 'Restored' },
  sims: s().sims,
  configs: s().configs,
  activeId: s().activeId,
  loadedMeta: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  s().resetWorkspace();
  s().setStorageWarning(null);
  load.mockReset().mockResolvedValue(null);
  save.mockReset().mockResolvedValue(undefined);
  saveSync.mockReset();
  setActiveId.mockReset();
  computeStaticInfo.mockReset().mockReturnValue({ info: { length: 1 }, rocket: {} });
  useEngineStore.setState({ phase: 'ready', backend: 'js', status: null, slow: false, error: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const settleRebuild = () => act(() => void vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS));

const mount = async (ui = <Host />) => {
  const r = renderWithProviders(ui);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return r;
};

describe('hydration', () => {
  it('hydrates the saved workspace and then builds once', async () => {
    load.mockResolvedValue(saved());
    await mount();
    expect(s().tree.name).toBe('Restored');
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    expect((computeStaticInfo.mock.calls[0]![0] as { name: string }).name).toBe('Restored');
  });

  it('keeps an edit made before the stored design arrived, as a design of its own', async () => {
    let settle!: (v: unknown) => void;
    load.mockReturnValue(new Promise((r) => (settle = r)));
    const stored = saved();
    renderWithProviders(<Host />);

    act(() => s().addPartToTree('bodytube'));
    const edited = s().tree;
    const bootIds = new Set(stored.tree.components.flatMap((c) => [c.id, ...(c.children ?? []).map((k) => k.id)]));
    const added = edited.components
      .flatMap((c) => (c.children ?? []).map((k) => k.id))
      .filter((id) => !bootIds.has(id));
    expect(added).toHaveLength(1);

    await act(async () => {
      settle(stored);
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    expect(s().tree).toBe(edited);
    expect(s().tree.name).not.toBe('Restored');
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    expect(computeStaticInfo.mock.calls[0]![0]).toBe(edited);
    expect(setActiveId).toHaveBeenCalledWith(null);
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0]![0] as { tree: unknown }).tree).toBe(edited);
    expect(setActiveId.mock.invocationCallOrder[0]!).toBeLessThan(save.mock.invocationCallOrder[0]!);
  });

  it('does not reload or re-hydrate when the language changes', async () => {
    load.mockResolvedValue(saved());
    await mount();
    expect(load).toHaveBeenCalledTimes(1);

    act(() => useWorkspaceStore.setState({ sims: s().sims.map((x) => ({ ...x, result: { fake: true } })) } as never));

    await act(async () => {
      await i18n.changeLanguage('es');
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(s().sims.every((x) => x.result)).toBe(true);
    await act(async () => void (await i18n.changeLanguage('en')));
  });

  it('degrades to a working workspace when the load rejects, and says so', async () => {
    load.mockRejectedValue(new Error('idb blocked'));
    await mount();

    // Not `setErr`: the rebuild's success path calls `setErr(null)` in the same tick.
    expect(s().storageWarning).toBeTruthy();
    expect((s().storageNotices.save ?? s().storageNotices.standing)?.kind).toBe('loadFailed');
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);

    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalled();
  });

  it('keeps an edit made before the load rejected, unwritten and detached', async () => {
    let fail!: (e: unknown) => void;
    load.mockReturnValue(new Promise((_r, reject) => (fail = reject)));
    renderWithProviders(<Host />);

    act(() => s().addPartToTree('bodytube'));
    const edited = s().tree;

    await act(async () => {
      fail(new Error('idb blocked'));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    expect(s().tree).toBe(edited);
    expect((s().storageNotices.save ?? s().storageNotices.standing)?.kind).toBe('loadFailed');
    expect(setActiveId).toHaveBeenCalledWith(null);
    expect(unchangedSinceWrite(s())).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveSync).toHaveBeenCalledTimes(1);
    expect((saveSync.mock.calls[0]![0] as { tree: unknown }).tree).toBe(edited);
  });

  it('keeps an edit made before an empty load resolved, unwritten', async () => {
    let resolve!: (w: null) => void;
    load.mockReturnValue(new Promise((r) => (resolve = r)));
    renderWithProviders(<Host />);

    act(() => s().addPartToTree('bodytube'));
    const edited = s().tree;

    await act(async () => {
      resolve(null);
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    expect(s().tree).toBe(edited);
    expect(unchangedSinceWrite(s())).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveSync).toHaveBeenCalledTimes(1);
    expect((saveSync.mock.calls[0]![0] as { tree: unknown }).tree).toBe(edited);
  });

  it('detaches the store when the loaded design fails to hydrate', async () => {
    load.mockResolvedValue({ ...saved(), tree: null });
    await mount();

    expect((s().storageNotices.save ?? s().storageNotices.standing)?.kind).toBe('loadFailed');
    expect(s().tree.name).not.toBe('Restored');
    expect(setActiveId).toHaveBeenCalledWith(null);
  });
});

describe('a build that fails', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it("shows a keyed failure in the app's language", async () => {
    await i18n.changeLanguage('de');
    computeStaticInfo.mockReturnValue({ error: { key: 'errors.motorCurve.noMass', values: { motor: 'F67' } } });
    await mount();
    expect(s().buildErr).toBe(i18n.t('errors.motorCurve.noMass', { motor: 'F67' }));
    expect(s().buildErr).toContain('F67');
    expect(s().buildErr).not.toContain('thrust curve');
  });

  it('shows a plain failure as its own text', async () => {
    computeStaticInfo.mockReturnValue({ error: 'kernel blew up' });
    await mount();
    expect(s().buildErr).toBe('kernel blew up');
  });
});

describe('autosave', () => {
  it('debounces to one write per 500 ms of quiet', async () => {
    await mount();
    save.mockClear();

    act(() => s().addPartToTree('bodytube'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => s().addPartToTree('bodytube'));
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('records when the write landed, and not when it failed', async () => {
    await mount();
    act(() => useWorkspaceStore.setState({ lastSavedAt: null }));

    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    const saved = s().lastSavedAt;
    expect(saved).not.toBeNull();

    save.mockRejectedValueOnce(new Error('QuotaExceeded'));
    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(s().lastSavedAt).toBe(saved);
  });

  it('does not save before hydration has finished', async () => {
    let settle!: (v: unknown) => void;
    load.mockReturnValue(new Promise((r) => (settle = r)));
    renderWithProviders(<Host />);

    act(() => s().addPartToTree('bodytube'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      settle(null);
      await Promise.resolve();
    });
  });

  it('raises a storage warning when the write fails, and a later save retires it', async () => {
    await mount();

    save.mockRejectedValueOnce(new Error('QuotaExceeded'));
    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(s().storageWarning).toBeTruthy();

    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(s().storageWarning).toBeNull();
  });

  it.each([
    ['degraded', () => degraded.fire!()],
    ['loadFailed', null],
  ] as const)('a successful save does not retire the %s warning', async (_kind, raise) => {
    if (!raise) load.mockRejectedValue(new Error('idb blocked'));
    await mount();
    if (raise) act(() => raise());

    const standing = s().storageWarning;
    expect(standing).toBeTruthy();

    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalled();
    expect(s().storageWarning).toBe(standing);
  });

  it('warns when IndexedDB is unavailable at all', async () => {
    await mount();
    act(() => degraded.fire!());
    expect(s().storageWarning).toBeTruthy();
  });
});

describe('the unload journal', () => {
  it('flushes synchronously on pagehide', async () => {
    await mount();
    act(() => s().addPartToTree('bodytube'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    // Synchronous path: an async IndexedDB write cannot finish during teardown.
    expect(saveSync).toHaveBeenCalledTimes(1);
  });

  const leave = (): boolean => {
    const e = new Event('beforeunload', { cancelable: true });
    act(() => void window.dispatchEvent(e));
    return e.defaultPrevented;
  };

  it('asks before leaving while a save is failing and edits are unwritten', async () => {
    await mount();
    save.mockRejectedValueOnce(new Error('QuotaExceeded'));
    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(s().storageWarning).toBeTruthy();
    expect(leave()).toBe(true);
    expect(saveSync).toHaveBeenCalled();
  });

  it('leaves without asking when the last write landed, or no save is failing', async () => {
    await mount();
    act(() => s().addPartToTree('bodytube'));
    expect(leave()).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(leave()).toBe(false);
  });

  it('does not journal a workspace it never hydrated', () => {
    load.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Host />);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveSync).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', async () => {
    const { unmount } = await mount();
    unmount();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveSync).not.toHaveBeenCalled();
  });
});

describe('what triggers a rebuild', () => {
  it('editing the design metadata neither rebuilds nor invalidates', async () => {
    await mount();
    computeStaticInfo.mockClear();
    act(() => {
      useWorkspaceStore.setState((st) => ({
        sims: st.sims.map((x) => asFlown(st, { ...x, result: { summary: { maxAltitude: 271 } } as never })),
      }));
    });

    act(() => s().updateDesignMeta({ designer: 'Ada Lovelace' }));

    expect(computeStaticInfo).not.toHaveBeenCalled();
    expect(s().sims.every((x) => !isStale(x))).toBe(true);
  });

  it('renaming a part rebuilds: the engine labels its rows with the name', async () => {
    await mount();
    computeStaticInfo.mockClear();

    act(() => {
      s().setSelectedId(s().tree.components[0]!.id as string);
      s().patchSelected({ name: 'Ogive' });
    });
    settleRebuild();

    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
  });

  it('builds once for a burst of edits, after the last one', async () => {
    await mount();
    computeStaticInfo.mockClear();
    act(() => s().setSelectedId(s().tree.components[0]!.id as string));

    for (const length of [0.21, 0.22, 0.23, 0.24]) {
      act(() => s().patchSelected({ length }));
      act(() => void vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS - 1));
    }
    expect(computeStaticInfo).not.toHaveBeenCalled();

    settleRebuild();
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    const built = computeStaticInfo.mock.calls[0]![0] as { components: { length?: number }[] };
    expect(built.components[0]!.length).toBe(0.24);
  });

  it('rebuilds the open design when an import that reset the engine did not replace it', async () => {
    await mount();
    computeStaticInfo.mockClear();
    act(() => useWorkspaceStore.setState((st) => ({ rebuildSeq: st.rebuildSeq + 1 })));
    settleRebuild();
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
  });

  it('builds the first time at once, without waiting out the debounce', async () => {
    await mount();
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
  });

  it('changing a dimension rebuilds and ages the results without destroying them', async () => {
    await mount();
    computeStaticInfo.mockClear();
    // Seeded, or the keep check passes vacuously.
    act(() => {
      useWorkspaceStore.setState((st) => ({
        sims: st.sims.map((x) => asFlown(st, { ...x, result: { summary: { maxAltitude: 271 } } as never })),
      }));
    });

    act(() => {
      s().setSelectedId(s().tree.components[0]!.id as string);
      s().patchSelected({ length: 0.2 });
    });
    settleRebuild();

    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    expect(s().sims.every((x) => !!x.result)).toBe(true);
    expect(s().sims.every((x) => isStale(x))).toBe(true);
  });

  it('grounding a stage rebuilds, because a grounded stage is a different rocket', async () => {
    await mount();
    // Two stages: grounding the only one is refused, a no-op that would pass.
    act(() => s().addStageToTree());
    await act(async () => void (await Promise.resolve()));
    settleRebuild();
    computeStaticInfo.mockClear();
    const cfg = s().configs[0]!;
    const booster = s().tree.components.at(-1)!.id as string;

    act(() => s().setStageFlies(cfg.id, booster, false));
    settleRebuild();
    expect(s().configs[0]!.grounded).toContain(booster);
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);

    act(() => s().setStageFlies(cfg.id, booster, true));
    settleRebuild();
    expect(computeStaticInfo).toHaveBeenCalledTimes(2);
  });

  it('does not rebuild when the grounded set is set to what it already was', async () => {
    await mount();
    act(() => s().addStageToTree());
    await act(async () => void (await Promise.resolve()));
    const cfg = s().configs[0]!;
    const booster = s().tree.components.at(-1)!.id as string;
    act(() => s().setStageFlies(cfg.id, booster, false));
    settleRebuild();
    computeStaticInfo.mockClear();

    act(() => s().setStageFlies(cfg.id, booster, false));
    settleRebuild();
    expect(computeStaticInfo).not.toHaveBeenCalled();
  });

  it('surfaces a build failure instead of leaving stale stats on screen', async () => {
    await mount();
    computeStaticInfo.mockReturnValue({ error: 'fin tab longer than the root chord' });

    act(() => {
      s().setSelectedId(s().tree.components[0]!.id as string);
      s().patchSelected({ length: 0.3 });
    });
    settleRebuild();

    expect(s().info).toBeNull();
    expect(s().buildErr).toBe('fin tab longer than the root chord');
  });

  it('waits for the kernel, and builds the moment it arrives', async () => {
    useEngineStore.setState({ phase: 'loading', backend: null });
    await mount();

    expect(computeStaticInfo).not.toHaveBeenCalled();
    expect(s().info).toBeNull();
    expect(s().buildErr).toBeNull();
    expect(s().err).toBeNull();

    await act(async () => {
      useEngineStore.setState({ phase: 'ready', backend: 'wasm' });
      await Promise.resolve();
    });

    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    expect(s().info).not.toBeNull();
  });

  it('opens a file before the kernel has loaded, and builds it when the kernel arrives', async () => {
    useEngineStore.setState({ phase: 'loading', backend: null });
    await mount();
    const original = getDesignLibrary();
    setDesignLibrary({
      list: async () => [],
      setActive: async () => true,
      activeId: async () => null,
    } as unknown as DesignLibrary);
    try {
      await act(async () => {
        await s().openOrkFile(orkFile('Early'));
      });
    } finally {
      setDesignLibrary(original);
    }
    expect(s().err).toBeNull();
    expect(s().tree.name).toBe('Early');
    expect(computeStaticInfo).not.toHaveBeenCalled();

    await act(async () => {
      useEngineStore.setState({ phase: 'ready', backend: 'wasm' });
      await Promise.resolve();
    });
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    expect((computeStaticInfo.mock.calls[0]![0] as { name: string }).name).toBe('Early');
  });

  it('keeps an action error through a build of the same design', async () => {
    useEngineStore.setState({ phase: 'loading', backend: null });
    await mount();
    act(() => s().setErr('Could not open that file'));
    await act(async () => {
      useEngineStore.setState({ phase: 'ready', backend: 'wasm' });
      await Promise.resolve();
    });
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);
    expect(s().err).toBe('Could not open that file');
  });

  it('clears an action error once the design is edited and builds', async () => {
    await mount();
    act(() => s().setErr('Could not open that file'));
    act(() => {
      s().setSelectedId(s().tree.components[0]!.id as string);
      s().patchSelected({ length: 0.3 });
    });
    settleRebuild();
    expect(s().err).toBeNull();
  });

  it('builds again after a retry that swaps the engine underneath it', async () => {
    await mount();
    expect(computeStaticInfo).toHaveBeenCalledTimes(1);

    await act(async () => {
      useEngineStore.setState({ phase: 'loading', backend: null });
      await Promise.resolve();
    });
    await act(async () => {
      useEngineStore.setState({ phase: 'ready', backend: 'js' });
      await Promise.resolve();
    });

    expect(computeStaticInfo).toHaveBeenCalledTimes(2);
  });

  it('clears the built rocket the moment a retry throws the engine away', async () => {
    await mount();
    expect(s().rocket).not.toBeNull();

    act(() => useEngineStore.getState().retry());

    expect(useEngineStore.getState().phase).toBe('loading');
    expect(s().rocket).toBeNull();
    expect(s().info).toBeNull();
    renderWithProviders(<AeroAnalysis />);
    expect(screen.getByText('Build a valid rocket to see its drag.')).toBeTruthy();
  });
});

describe('a hydrate does not re-stamp the design', () => {
  it('writes nothing after loading a saved workspace', async () => {
    load.mockResolvedValue(saved());
    await mount();
    save.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('still saves the first REAL edit after that hydrate', async () => {
    load.mockResolvedValue(saved());
    await mount();
    save.mockClear();

    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('writes nothing after opening a library design', async () => {
    await mount();
    const original = getDesignLibrary();
    setDesignLibrary({
      read: async () => saved(),
      setActive: async () => true,
      list: async () => [],
      activeId: async () => 'lib-1',
    } as unknown as DesignLibrary);
    try {
      await act(async () => {
        await s().openDesign('lib-1');
      });
    } finally {
      setDesignLibrary(original);
    }
    expect(s().tree.name).toBe('Restored');
    save.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('does not store an untouched New when a library design is opened', async () => {
    await mount();
    act(() => s().resetWorkspace());
    save.mockClear();
    const original = getDesignLibrary();
    setDesignLibrary({
      read: async () => saved(),
      setActive: async () => true,
      list: async () => [],
      activeId: async () => 'lib-1',
    } as unknown as DesignLibrary);
    try {
      await act(async () => {
        await s().openDesign('lib-1');
      });
    } finally {
      setDesignLibrary(original);
    }
    expect(s().tree.name).toBe('Restored');
    expect(save).not.toHaveBeenCalled();
  });

  it('writes nothing after New until the first edit', async () => {
    load.mockResolvedValue(saved());
    await mount();
    act(() => s().resetWorkspace());
    save.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();

    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  const hideTab = async () => {
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
    } finally {
      vis.mockRestore();
    }
  };

  it('records a save the hidden tab made', async () => {
    load.mockResolvedValue(saved());
    await mount();
    act(() => useWorkspaceStore.setState({ lastSavedAt: null }));
    act(() => s().addPartToTree('bodytube'));
    await hideTab();
    await act(async () => {
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalled();
    expect(s().lastSavedAt).not.toBeNull();
  });

  it('writes nothing when the tab is hidden after New', async () => {
    load.mockResolvedValue(saved());
    await mount();
    act(() => s().resetWorkspace());
    save.mockClear();
    await hideTab();
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(save).not.toHaveBeenCalled();
    expect(saveSync).not.toHaveBeenCalled();
  });

  it('writes nothing when the tab is hidden on a first visit', async () => {
    useWorkspaceStore.setState({ tree: { ...s().tree } });
    load.mockResolvedValue(null);
    await mount();
    save.mockClear();
    await hideTab();
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(save).not.toHaveBeenCalled();
    expect(saveSync).not.toHaveBeenCalled();
  });

  it('writes nothing when the tab is hidden after a load', async () => {
    load.mockResolvedValue(saved());
    await mount();
    save.mockClear();
    await hideTab();
    expect(save).not.toHaveBeenCalled();
    expect(saveSync).not.toHaveBeenCalled();
  });

  it('writes an edit when the tab is hidden, and nothing on the next hide once it is stored', async () => {
    load.mockResolvedValue(saved());
    await mount();
    act(() => s().addPartToTree('bodytube'));
    save.mockClear();
    await hideTab();
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveSync).toHaveBeenCalledTimes(1);
    await hideTab();
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveSync).toHaveBeenCalledTimes(1);
  });

  it('saves normally when there was no saved workspace to hydrate from', async () => {
    load.mockResolvedValue(null);
    await mount();
    save.mockClear();

    act(() => s().addPartToTree('bodytube'));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
});

// `flightKey` strips `name`, so the fixture differs structurally.
describe('restoring a saved design does not invalidate its flights', () => {
  const savedWithFlight = () => {
    const tree = structuredClone(s().tree) as typeof s extends never ? never : ReturnType<typeof s>['tree'];
    const bumpLength = (n: { type?: string; length?: number; children?: unknown[] }) => {
      if (n.type === 'bodytube') n.length = (n.length ?? 0.2) + 0.123;
      for (const c of (n.children ?? []) as (typeof n)[]) bumpLength(c);
    };
    for (const c of tree.components as unknown as Parameters<typeof bumpLength>[0][]) bumpLength(c);
    return {
      version: 3 as const,
      tree,
      sims: s().sims.map((x) =>
        asFlown({ ...s(), tree }, { ...x, result: { summary: { maxAltitude: 100 }, events: [], series: {} } as never }),
      ),
      configs: s().configs,
      activeId: s().activeId,
      loadedMeta: null,
    };
  };

  it('keeps a restored result current', async () => {
    load.mockResolvedValue(savedWithFlight());
    await mount();

    expect(s().sims[0]!.result).not.toBeNull();
    expect(isStale(s().sims[0]!)).toBe(false);
  });

  it('still invalidates when the user actually edits the geometry', async () => {
    load.mockResolvedValue(savedWithFlight());
    await mount();
    expect(isStale(s().sims[0]!)).toBe(false);

    const tube = s().tree.components[0]!.children?.find((c) => c.type === 'bodytube') ?? s().tree.components[0]!;
    await act(async () => {
      s().setSelectedId(tube.id ?? null);
      s().patchSelected({ length: 0.42 });
      await Promise.resolve();
    });

    expect(isStale(s().sims[0]!)).toBe(true);
  });

  it('keeps the results current when a library design is opened over the boot design', async () => {
    await mount();
    const original = getDesignLibrary();
    const w = savedWithFlight();
    setDesignLibrary({
      read: async () => w,
      setActive: async () => true,
      list: async () => [],
      activeId: async () => 'lib-1',
    } as unknown as DesignLibrary);
    try {
      await act(async () => {
        await s().openDesign('lib-1');
      });
    } finally {
      setDesignLibrary(original);
    }

    expect(s().sims[0]!.result).not.toBeNull();
    expect(isStale(s().sims[0]!)).toBe(false);

    const tube = s().tree.components[0]!.children?.find((c) => c.type === 'bodytube') ?? s().tree.components[0]!;
    await act(async () => {
      s().setSelectedId(tube.id ?? null);
      s().patchSelected({ length: 0.42 });
      await Promise.resolve();
    });
    expect(isStale(s().sims[0]!)).toBe(true);
  });
});
