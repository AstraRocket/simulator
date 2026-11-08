import { nsKey } from '../../../src/services/storage/storageKeys';
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { LibraryWorkspaceStore, lean, resultsOf, type Workspace } from '../../../src/services/storage/workspaceStore';
import { DesignLibrary, getDesignLibrary, setDesignLibrary } from '../../../src/services/storage/designLibrary';
import type { KeyValueStore } from '../../../src/services/storage/keyValueStore';
import { defaultDesignName } from '../../../src/services/app/appInfo';

class FakeKv implements KeyValueStore {
  map = new Map<string, string>();
  full = false;
  async get(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  async set(k: string, v: string) {
    if (this.full) return false;
    this.map.set(k, v);
    return true;
  }
  async remove(k: string) {
    this.map.delete(k);
  }
  // Must stay atomic like the real IndexedDB transaction, or the duplicate-entry case hides.
  private lock: Promise<unknown> = Promise.resolve();
  async update(k: string, fn: (raw: string | null) => string | null) {
    const prev = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((r) => (release = r));
    await prev;
    try {
      const next = fn(this.map.get(k) ?? null);
      if (next === null) {
        this.map.delete(k);
        return true;
      }
      return await this.set(k, next);
    } finally {
      release();
    }
  }
}

const flight = (time: number[] = [0, 1]) =>
  ({
    summary: {
      maxAltitude: 120,
      maxVelocity: 60,
      maxAcceleration: 90,
      maxMachNumber: 0.18,
      timeToApogee: 4.5,
      flightTime: 30,
      groundHitVelocity: 5,
      launchRodVelocity: 18,
      deploymentVelocity: null,
      optimumDelay: null,
    },
    events: [],
    series: {
      time,
      altitude: time.map(() => 1),
      velocity: time.map(() => 1),
      acceleration: time.map(() => 1),
      mass: time.map(() => 1),
      thrust: time.map(() => 1),
      drag: time.map(() => 1),
      mach: time.map(() => 1),
    },
  }) as unknown as NonNullable<Workspace['sims'][number]['result']>;

const workspace = (): Workspace =>
  ({
    version: 3,
    tree: { components: [] },
    sims: [{ id: 's1', name: 'Flight', configId: 'c1', launch: {}, result: flight() }],
    configs: [{ id: 'c1', name: null, motors: {} }],
    activeId: 's1',
    loadedMeta: null,
  }) as unknown as Workspace;

const blob = () => ({
  version: 3,
  tree: { components: [] },
  sims: [{ id: 's1' }],
  configs: [{ id: 'c1', motors: {} }],
});

const designKey = (kv: FakeKv) =>
  [...kv.map.keys()].find(
    (k) =>
      k.startsWith(nsKey('designs:')) && !k.endsWith(':index') && !k.endsWith(':active') && !k.endsWith(':results'),
  )!;

let kv: FakeKv;
let store: LibraryWorkspaceStore;
beforeEach(() => {
  kv = new FakeKv();
  setDesignLibrary(new DesignLibrary(kv));
  store = new LibraryWorkspaceStore();
  localStorage.clear();
});

describe('LibraryWorkspaceStore', () => {
  it('load() is null when nothing is stored', async () => {
    expect(await store.load()).toBeNull();
  });

  it('round-trips a saved workspace', async () => {
    await store.save(workspace());
    const w = await store.load();
    expect(w).not.toBeNull();
    expect(w!.activeId).toBe('s1');
    expect(w!.sims).toHaveLength(1);
  });

  it('creates a library entry on the first save', async () => {
    await store.save(workspace());
    expect(await new DesignLibrary(kv).list()).toHaveLength(1);
  });

  it('keeps saving into the SAME design rather than adding one per save', async () => {
    await store.save(workspace());
    await store.save(workspace());
    await store.save(workspace());
    expect(await new DesignLibrary(kv).list()).toHaveLength(1);
  });

  describe('a design changed by another tab', () => {
    const twoTabs = async () => {
      await store.save(workspace());
      const other = new LibraryWorkspaceStore();
      await other.load();
      await store.load();
      return other;
    };

    it('refuses to write over it, rather than overwriting silently', async () => {
      const other = await twoTabs();
      await other.save({ ...workspace(), activeId: 'theirs' });
      await expect(store.save({ ...workspace(), activeId: 'mine' })).rejects.toThrow('conflict');
    });

    it('leaves the other tab’s work in the library', async () => {
      const other = await twoTabs();
      await other.save({ ...workspace(), activeId: 'theirs' });
      await store.save({ ...workspace(), activeId: 'mine' }).catch(() => {});
      expect((await new LibraryWorkspaceStore().load())!.activeId).toBe('theirs');
    });

    it('keeps refusing, because the edits are still unsaved', async () => {
      const other = await twoTabs();
      await other.save({ ...workspace(), activeId: 'theirs' });
      await store.save(workspace()).catch(() => {});
      await expect(store.save(workspace())).rejects.toThrow('conflict');
    });

    it('does not refuse a tab saving over its own writes', async () => {
      await store.save(workspace());
      await store.save(workspace());
      await expect(store.save(workspace())).resolves.toBeUndefined();
    });

    it('lets only one of two tabs saving at once write', async () => {
      const other = await twoTabs();
      const outcomes = await Promise.allSettled([
        store.save({ ...workspace(), activeId: 'mine' }),
        other.save({ ...workspace(), activeId: 'theirs' }),
      ]);
      expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected']);
    });

    it('writes no unload journal once a save has been refused', async () => {
      const other = await twoTabs();
      await other.save({ ...workspace(), activeId: 'theirs' });
      await store.save({ ...workspace(), activeId: 'mine' }).catch(() => {});
      store.saveSync({ ...workspace(), activeId: 'mine' });
      const unload = nsKey('designs:unload');
      const journals = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) =>
        k.startsWith(`${unload}:`),
      );
      expect(journals).toEqual([]);
      expect((await new LibraryWorkspaceStore().load())!.activeId).toBe('theirs');
    });

    it('does not refuse two overlapping saves from the same tab', async () => {
      await store.save(workspace());
      await expect(Promise.all([store.save(workspace()), store.save(workspace())])).resolves.toBeDefined();
    });

    it('keeps the claim of a save queued before a switch', async () => {
      const other = await twoTabs();
      await other.save({ ...workspace(), activeId: 'theirs' });
      const queued = [
        store.save({ ...workspace(), activeId: 'mine' }),
        store.save({ ...workspace(), activeId: 'mine2' }),
      ];
      store.setActiveId(null);
      await Promise.allSettled(queued);
      expect((await new LibraryWorkspaceStore().load())!.activeId).toBe('theirs');
    });

    it('still writes a queued save to its own design after a switch', async () => {
      await store.save(workspace());
      await store.load();
      const queued = [store.save({ ...workspace(), activeId: 'one' }), store.save({ ...workspace(), activeId: 'two' })];
      store.setActiveId(null);
      await Promise.all(queued);
      expect((await new LibraryWorkspaceStore().load())!.activeId).toBe('two');
    });

    it('refuses a tab that read the old blob while a save was writing', async () => {
      const other = await twoTabs();
      const lib = new DesignLibrary(kv);
      const id = (await lib.activeId())!;
      const realSet = kv.set.bind(kv);
      let reader: LibraryWorkspaceStore | null = null;
      kv.set = async (k: string, v: string) => {
        if (k.endsWith(id) && !reader) {
          reader = new LibraryWorkspaceStore();
          await reader.load();
        }
        return await realSet(k, v);
      };
      await other.save({ ...workspace(), activeId: 'theirs' });
      kv.set = realSet;
      await expect(reader!.save({ ...workspace(), activeId: 'stale' })).rejects.toThrow('conflict');
      expect((await new LibraryWorkspaceStore().load())!.activeId).toBe('theirs');
    });

    it('does not refuse after switching to a different design', async () => {
      const other = await twoTabs();
      await other.save({ ...workspace(), activeId: 'theirs' });
      store.setActiveId(null);
      await expect(store.save(workspace())).resolves.toBeUndefined();
    });
  });

  it('creates ONE design when first saves overlap', async () => {
    await Promise.all([store.save(workspace()), store.save(workspace()), store.save(workspace())]);
    expect(await new DesignLibrary(kv).list()).toHaveLength(1);
  });

  it('writes the later of two overlapping first saves into the created design', async () => {
    const second = { ...workspace(), activeId: 'later' } as unknown as Workspace;
    await Promise.all([store.save(workspace()), store.save(second)]);
    const lib = new DesignLibrary(kv);
    const [meta] = await lib.list();
    expect((await lib.read(meta!.id))!.activeId).toBe('later');
  });

  it('does not adopt a create that finished after a detach', async () => {
    const saving = store.save(workspace());
    store.setActiveId(null); // New / a second import, mid-create
    await saving;
    await store.save(workspace());
    expect(await new DesignLibrary(kv).list()).toHaveLength(2);
  });

  it('creates under the pending name when one was set', async () => {
    store.setActiveId(null);
    store.setPendingName('Big Bertha (2)');
    await store.save(workspace());
    expect((await new DesignLibrary(kv).list())[0]!.name).toBe('Big Bertha (2)');
  });

  it('forgets the pending name once it has been used', async () => {
    store.setPendingName('Once');
    await store.save(workspace());
    store.setActiveId(null);
    await store.save(workspace());
    expect((await new DesignLibrary(kv).list()).map((m) => m.name)).toEqual([defaultDesignName(), 'Once']);
  });

  it('stores flight results, and keeps them out of the design blob', async () => {
    await store.save(workspace());

    const blob = kv.map.get(designKey(kv))!;
    expect(blob).not.toContain('series');
    expect([...kv.map.keys()].some((k) => k.endsWith(':results'))).toBe(true);

    const w = await store.load();
    expect(w!.sims[0]!.result).not.toBeNull();
  });

  it('rewrites the flights only when a run has changed them', async () => {
    const w = workspace();
    await store.save(w);
    const key = [...kv.map.keys()].find((k) => k.endsWith(':results'))!;
    const first = kv.map.get(key);

    kv.map.set(key, 'SENTINEL');
    await store.save({ ...w, tree: { components: [{ id: 'x' }] } } as unknown as Workspace);
    expect(kv.map.get(key)).toBe('SENTINEL');

    const ran = { ...w, sims: [{ ...w.sims[0]!, result: flight([1, 2]) }] } as unknown as Workspace;
    await store.save(ran);
    expect(kv.map.get(key)).not.toBe('SENTINEL');
    expect(kv.map.get(key)).not.toBe(first);
  });

  it('drops the flights when the last result goes away', async () => {
    await store.save(workspace());
    expect([...kv.map.keys()].some((k) => k.endsWith(':results'))).toBe(true);

    const cleared = { ...workspace(), sims: [{ ...workspace().sims[0]!, result: null }] } as unknown as Workspace;
    await store.save(cleared);
    expect([...kv.map.keys()].some((k) => k.endsWith(':results'))).toBe(false);
  });

  it.each([
    ['unparseable', '{bad json'],
    ['a blob with no configurations', JSON.stringify({ version: 3, tree: { components: [] }, sims: [{ id: 's1' }] })],
    ['an unknown version', JSON.stringify({ ...blob(), version: 4 })],
    ['no tree', JSON.stringify({ ...blob(), tree: undefined })],
    ['a non-array tree.components', JSON.stringify({ ...blob(), tree: {} })],
    ['no sims', JSON.stringify({ ...blob(), sims: [] })],
    ['a null simulation', JSON.stringify({ ...blob(), sims: [{ id: 's1' }, null] })],
    ['a null configuration', JSON.stringify({ ...blob(), configs: [null] })],
    ['a null component', JSON.stringify({ ...blob(), tree: { components: [null] } })],
  ])('throws rather than silently starting fresh over a design that is %s', async (_what, blob) => {
    await store.save(workspace());
    kv.map.set(designKey(kv), blob);
    await expect(store.load()).rejects.toThrow(/unreadable/);
  });

  it('detaches from an unreadable design so the next save does not overwrite it', async () => {
    await store.save(workspace());
    const originalKey = designKey(kv);
    const corrupt = '{bad json';
    kv.map.set(originalKey, corrupt);

    await expect(store.load()).rejects.toThrow(/unreadable/);

    await store.save(workspace());
    expect(kv.map.get(originalKey)).toBe(corrupt);
    const keys = [...kv.map.keys()].filter(
      (k) =>
        k.startsWith(nsKey('designs:')) && !k.endsWith(':index') && !k.endsWith(':active') && !k.endsWith(':results'),
    );
    expect(keys).toHaveLength(2);
  });

  it('detaches when the read fails after the blob has parsed', async () => {
    await store.save(workspace());
    const originalKey = designKey(kv);
    const original = kv.map.get(originalKey);
    const lib = getDesignLibrary();
    lib.readResults = () => Promise.reject(new Error('results unreadable'));

    const fresh = new LibraryWorkspaceStore();
    await expect(fresh.load()).rejects.toThrow(/results unreadable/);
    await fresh.save({ ...workspace(), tree: { components: [{ type: 'nosecone', id: 'other' }] } } as Workspace);
    expect(kv.map.get(originalKey)).toBe(original);
  });

  it('returns null, without throwing, when there is genuinely nothing saved', async () => {
    expect(await store.load()).toBeNull();
  });

  it('save() throws when storage is full instead of silently dropping work', async () => {
    await store.save(workspace());
    kv.full = true;
    await expect(store.save(workspace())).rejects.toThrow(/storage-full/);
  });
});

describe('openActive', () => {
  const seed = async () => {
    const lib = getDesignLibrary();
    const flown = workspace();
    const meta = await lib.create('B', lean(flown));
    await lib.writeResults(meta.id, resultsOf(flown));
    return meta.id;
  };

  it('puts the stored flights back on their simulations', async () => {
    const id = await seed();
    const w = await store.openActive(id);
    expect(w?.sims[0]?.result).toEqual(flight());
  });

  it('keeps the stored flights through the first save after opening', async () => {
    const id = await seed();
    const w = (await store.openActive(id))!;
    await store.save({ ...w, tree: { components: [] } as unknown as Workspace['tree'] });
    expect((await getDesignLibrary().readResults(id))['s1']).toEqual(flight());
  });

  it("holds the claim, so another tab's save in between is not overwritten", async () => {
    const id = await seed();
    const w = (await store.openActive(id))!;
    const other = { ...w, sims: [{ ...w.sims[0]!, name: 'From the other tab' }] } as Workspace;
    await new Promise((r) => setTimeout(r, 5));
    await getDesignLibrary().write(id, 'B', lean(other), 'other-tab');
    await expect(store.save({ ...w, sims: [{ ...w.sims[0]!, name: 'From this tab' }] } as Workspace)).rejects.toThrow(
      'conflict',
    );
    expect((await getDesignLibrary().read(id))?.sims[0]?.name).toBe('From the other tab');
  });
});
