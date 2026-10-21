import { nsKey } from '../../../src/services/storage/storageKeys';
import { describe, it, expect, beforeEach } from 'vitest';
import { DesignLibrary } from '../../../src/services/storage/designLibrary';
import type { KeyValueStore } from '../../../src/services/storage/keyValueStore';
import type { Workspace } from '../../../src/services/storage/workspaceStore';

class FakeKv implements KeyValueStore {
  readonly map = new Map<string, string>();
  full = false;
  async get(k: string) {
    return this.map.get(k) ?? null;
  }
  async set(k: string, v: string) {
    if (this.full) return false;
    this.map.set(k, v);
    return true;
  }
  async remove(k: string) {
    this.map.delete(k);
  }
  async update(k: string, fn: (raw: string | null) => string | null) {
    const next = fn(await this.get(k));
    if (next === null) {
      await this.remove(k);
      return true;
    }
    return await this.set(k, next);
  }
}

const ws = (name: string, loadedName?: string): Workspace =>
  ({
    version: 3,
    tree: { components: [{ id: 'n1', name }] },
    sims: [{ id: 's1', name: 'Simulation 1', configId: 'c1', result: null }],
    configs: [{ id: 'c1', name: 'Configuration 1', motors: {} }],
    activeId: 's1',
    loadedMeta: loadedName ? { name: loadedName, notes: [], exportMotors: {} } : null,
  }) as unknown as Workspace;

const treeName = (w: Workspace | null) =>
  (w?.tree as unknown as { components: { name: string }[] } | undefined)?.components[0]?.name;

let kv: FakeKv;
let lib: DesignLibrary;
beforeEach(() => {
  kv = new FakeKv();
  lib = new DesignLibrary(kv);
});

describe('design library', () => {
  it('starts empty', async () => {
    expect(await lib.list()).toEqual([]);
    expect(await lib.activeId()).toBeNull();
  });

  it('creates, reads back, and makes the new design active', async () => {
    const meta = await lib.create('Big Bertha', ws('bertha'));
    expect(meta.name).toBe('Big Bertha');
    expect(await lib.activeId()).toBe(meta.id);
    expect(treeName(await lib.read(meta.id))).toBe('bertha');
  });

  it('keeps designs independent: saving one does not touch another', async () => {
    const a = await lib.create('A', ws('a'));
    const b = await lib.create('B', ws('b'));
    await lib.write(b.id, 'B', ws('b-edited'));

    expect(treeName(await lib.read(a.id))).toBe('a');
    expect(treeName(await lib.read(b.id))).toBe('b-edited');
  });

  it('lists most recently updated first', async () => {
    const a = await lib.create('A', ws('a'));
    await lib.create('B', ws('b'));
    await lib.write(a.id, 'A', ws('a2')); // touching A floats it to the top

    expect((await lib.list()).map((m) => m.name)).toEqual(['A', 'B']);
  });

  it('renames without disturbing the design', async () => {
    const a = await lib.create('Old', ws('a'));
    await lib.rename(a.id, 'New');
    expect((await lib.list())[0]!.name).toBe('New');
    expect(treeName(await lib.read(a.id))).toBe('a');
  });

  it('removes a design and its index entry', async () => {
    const a = await lib.create('A', ws('a'));
    await lib.remove(a.id);
    expect(await lib.list()).toEqual([]);
    expect(await lib.read(a.id)).toBeNull();
  });

  it('does not leave the active id pointing at a deleted design', async () => {
    const a = await lib.create('A', ws('a'));
    await lib.remove(a.id);
    // Otherwise the app opens a workspace it cannot save back to.
    expect(await lib.activeId()).toBeNull();
  });

  it('ignores an active id whose design is gone from the index', async () => {
    await lib.create('A', ws('a'));
    kv.map.set(nsKey('designs:active'), 'ghost');
    expect(await lib.activeId()).toBeNull();
  });

  /**
   * A create whose pointer write is refused must leave nothing behind.
   *
   * The caller (workspaceStore.save) still has no active id after the throw,
   * so its next autosave creates again. A half-done create that kept its
   * indexed design would add one identical row to the library per retry, one
   * every 500 ms for as long as the pointer write kept failing.
   */
  it('rolls back a create whose active-pointer write is refused', async () => {
    const realSet = kv.set.bind(kv);
    kv.set = async (k: string, v: string) => (k.endsWith(':active') ? false : realSet(k, v));
    await expect(lib.create('A', ws('a'))).rejects.toThrow(/storage-full/);
    expect(await lib.list()).toEqual([]);
  });

  it('reports a refused write rather than pretending it saved', async () => {
    const a = await lib.create('A', ws('a'));
    kv.full = true;
    expect(await lib.write(a.id, 'A', ws('a2'))).toBe(false);
  });

  it('reports a refused INDEX write too, not just the design blob', async () => {
    // The index write is not survivable, even though the design itself is stored:
    // activeId() filters against the index, so a design missing from it is
    // unreachable, a new one vanishes, and the next session opens empty over
    // orphaned bytes. Fail the write so workspaceStore.save() can raise
    // "storage full".
    const a = await lib.create('A', ws('a'));
    let calls = 0;
    const realSet = kv.set.bind(kv);
    kv.set = async (k: string, v: string) => {
      // Let the design blob through, refuse only the index that follows it.
      calls += 1;
      return k.endsWith(':index') && calls > 1 ? false : realSet(k, v);
    };
    expect(await lib.write(a.id, 'A', ws('a2'))).toBe(false);
  });

  it('survives a corrupt index without losing addressable designs', async () => {
    const a = await lib.create('A', ws('a'));
    kv.map.set(nsKey('designs:index'), '{not json');
    expect(await lib.list()).toEqual([]);
    expect(treeName(await lib.read(a.id))).toBe('a');
  });
});

describe('creating a design', () => {
  /**
   * `create()` must not discard the boolean `write()` returns and fall back to a
   * fabricated meta, which resolves cleanly for a design that was never stored.
   * This is the path the first save of a session takes, when there is no other copy
   * yet.
   */
  it('throws instead of reporting success for a create the store refused', async () => {
    kv.full = true;
    await expect(lib.create('Doomed', ws('doomed'))).rejects.toThrow(/storage-full/);
    expect(await lib.list()).toEqual([]);
  });
});
