import { STORAGE_PREFIX, nsKey } from '../../../src/services/storage/storageKeys';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  IndexedDbKeyValueStore,
  __resetIdbForTests,
  onStorageDegraded,
} from '../../../src/services/storage/idbKeyValueStore';
import type { KeyValueStore } from '../../../src/services/storage/keyValueStore';

const degraded = (): boolean => {
  let seen = false;
  onStorageDegraded(() => {
    seen = true;
  })();
  return seen;
};

class FakeLocal implements KeyValueStore {
  full = false;
  constructor(readonly map = new Map<string, string>()) {}
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

beforeEach(async () => {
  await __resetIdbForTests();
  await new Promise<void>((res) => {
    const req = indexedDB.deleteDatabase(STORAGE_PREFIX);
    req.onsuccess = req.onerror = req.onblocked = () => res();
  });
});

// Request success is not commit: abort after `onsuccess` to model a commit-time failure.
const abortAfterSuccess = async (body: () => Promise<void>) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- saved to patch the prototype; called back with .call(this, ...)
  const realPut = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<typeof realPut>
  ) {
    const req = realPut.apply(this, args);
    req.addEventListener('success', () => req.transaction?.abort());
    return req;
  });
  try {
    await body();
  } finally {
    spy.mockRestore();
  }
};

describe('IndexedDbKeyValueStore', () => {
  it('round-trips a value', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    expect(await kv.set(nsKey('workspace'), '{"a":1}')).toBe(true);
    expect(await kv.get(nsKey('workspace'))).toBe('{"a":1}');
  });

  it('returns null for a key it has never held', async () => {
    expect(await new IndexedDbKeyValueStore(new FakeLocal()).get('nope')).toBeNull();
  });

  it('removes', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    await kv.set('k', 'v');
    await kv.remove('k');
    expect(await kv.get('k')).toBeNull();
  });

  it('stores values far larger than the ~5 MB localStorage cap', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    const big = 'x'.repeat(8 * 1024 * 1024);
    expect(await kv.set('big', big)).toBe(true);
    expect((await kv.get('big'))?.length).toBe(big.length);
  });
});

describe('migration from localStorage', () => {
  it('copies an existing value across on first read and frees the old entry', async () => {
    const local = new FakeLocal();
    local.map.set(nsKey('workspace'), '{"design":"old"}');
    const kv = new IndexedDbKeyValueStore(local);

    expect(await kv.get(nsKey('workspace'))).toBe('{"design":"old"}');
    expect(local.map.has(nsKey('workspace'))).toBe(false);

    await __resetIdbForTests();
    expect(await new IndexedDbKeyValueStore(new FakeLocal()).get(nsKey('workspace'))).toBe('{"design":"old"}');
  });

  it('prefers the IndexedDB value over a stale legacy one', async () => {
    const local = new FakeLocal();
    local.map.set('k', 'stale');
    const kv = new IndexedDbKeyValueStore(local);
    await kv.set('k', 'fresh');
    expect(await kv.get('k')).toBe('fresh');
  });

  it('sends a write that aborts after the request succeeded to the fallback', async () => {
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    await kv.set('warm', 'up');

    await abortAfterSuccess(async () => {
      expect(await kv.set('k', 'v')).toBe(true);
      expect(local.map.get('k')).toBe('v');
    });

    await __resetIdbForTests();
    const fresh = new IndexedDbKeyValueStore(new FakeLocal());
    expect(await fresh.get('k')).toBeNull();
  });

  it('keeps the legacy copy when the migrating transaction aborts post-success', async () => {
    const local = new FakeLocal();
    local.map.set('k', 'precious');
    const kv = new IndexedDbKeyValueStore(local);
    await kv.set('warm', 'up');

    await abortAfterSuccess(async () => {
      expect(await kv.get('k')).toBe('precious');
      expect(local.map.get('k')).toBe('precious');
    });
  });

  it('keeps the original when the migrating write fails', async () => {
    const local = new FakeLocal();
    local.map.set('k', 'precious');
    const kv = new IndexedDbKeyValueStore(local);
    const boom = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    await __resetIdbForTests();

    expect(await kv.get('k')).toBe('precious');
    expect(local.map.get('k')).toBe('precious');
    boom.mockRestore();
  });

  it('clears the legacy copy on remove even if it was never read', async () => {
    const local = new FakeLocal();
    local.map.set('k', 'v');
    await new IndexedDbKeyValueStore(local).remove('k');
    expect(local.map.has('k')).toBe(false);
  });
});

describe('when IndexedDB is unavailable', () => {
  it('falls back to localStorage for get/set', async () => {
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    const boom = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    await __resetIdbForTests();

    expect(await kv.set('k', 'v')).toBe(true);
    expect(local.map.get('k')).toBe('v');
    expect(await kv.get('k')).toBe('v');
    boom.mockRestore();
  });

  it('reports failure when the fallback is also full', async () => {
    const local = new FakeLocal();
    local.full = true;
    const kv = new IndexedDbKeyValueStore(local);
    const boom = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    await __resetIdbForTests();

    expect(await kv.set('k', 'v')).toBe(false);
    boom.mockRestore();
  });

  it('recovers on a later call: a transient open error is not memoized', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    const boom = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new Error('transient');
    });
    await __resetIdbForTests();

    await kv.get('k');
    boom.mockRestore();
    expect(await kv.set('k', 'v')).toBe(true);
    expect(await kv.get('k')).toBe('v');
  });
});

// fake-indexeddb cannot provoke a blocked open, so the request is stubbed.
describe('an open blocked by another tab', () => {
  const blockingRequest = () => {
    const close = vi.fn();
    const req = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
      result: { close },
    } as unknown as IDBOpenDBRequest & { result: { close: typeof close } };
    return { req, close };
  };

  it('falls back to localStorage rather than hanging on the other tab', async () => {
    const { req } = blockingRequest();
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    const spy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      queueMicrotask(() => req.onblocked?.(new Event('blocked') as IDBVersionChangeEvent));
      return req;
    });
    await __resetIdbForTests();

    expect(await kv.set('k', 'v')).toBe(true);
    expect(local.map.get('k')).toBe('v');
    expect(degraded()).toBe(true);
    spy.mockRestore();
  });

  it('closes the connection that arrives after the block is settled', async () => {
    const { req, close } = blockingRequest();
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    const spy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      queueMicrotask(() => req.onblocked?.(new Event('blocked') as IDBVersionChangeEvent));
      return req;
    });
    await __resetIdbForTests();
    await kv.get('k');

    expect(close).not.toHaveBeenCalled();
    req.onsuccess?.(new Event('success'));
    expect(close).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('does not memoize the block, so a later call reaches IndexedDB', async () => {
    const { req } = blockingRequest();
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    const spy = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      queueMicrotask(() => req.onblocked?.(new Event('blocked') as IDBVersionChangeEvent));
      return req;
    });
    await __resetIdbForTests();

    await kv.get('k');
    spy.mockRestore();
    expect(await kv.set('k', 'v')).toBe(true);
    expect(await kv.get('k')).toBe('v');
  });
});

describe('storage-degraded signal', () => {
  it('is not raised while IndexedDB is working', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    await kv.set('k', 'v');
    await kv.get('k');
    expect(degraded()).toBe(false);
  });

  it('fires once when storage falls back, so the UI can warn up front', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    const seen = vi.fn();
    onStorageDegraded(seen);
    const boom = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    await __resetIdbForTests();

    await kv.set('a', '1');
    await kv.set('b', '2');
    await kv.get('a');

    expect(degraded()).toBe(true);
    expect(seen).toHaveBeenCalledOnce();
    boom.mockRestore();
  });

  it('tells a late subscriber that storage is already degraded', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    const boom = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    await __resetIdbForTests();
    await kv.set('a', '1');

    const late = vi.fn();
    onStorageDegraded(late);
    expect(late).toHaveBeenCalledOnce();
    boom.mockRestore();
  });
});

describe('update() falling back to localStorage', () => {
  it('is served by a fresh session instead of the stale IndexedDB entry', async () => {
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    expect(await kv.set('lib', 'old')).toBe(true);

    await abortAfterSuccess(async () => {
      expect(await kv.update('lib', () => 'new')).toBe(true);
    });
    expect(local.map.get('lib')).toBe('new');
    expect(await kv.get('lib')).toBe('new');

    await __resetIdbForTests();
    const next = new IndexedDbKeyValueStore(new FakeLocal(local.map));
    expect(await next.get('lib')).toBe('new');
  });

  it('hands the reducer the IndexedDB value when the fallback holds none', async () => {
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    await kv.set('lib', '["a","b"]');
    const seen: (string | null)[] = [];
    await abortAfterSuccess(async () => {
      await kv.update('lib', (raw) => {
        seen.push(raw);
        return raw;
      });
    });
    expect(seen).toContain('["a","b"]');
    expect(seen).not.toContain(null);
  });

  // WebKit's mid-session "Connection lost" fails the read too.
  it('refuses the write when IndexedDB cannot be read and the fallback holds nothing', async () => {
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    await kv.set('lib', '["a","b"]');
    const seen: (string | null)[] = [];
    const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('Connection to Indexed Database server lost', 'UnknownError');
    });
    try {
      await abortAfterSuccess(async () => {
        const ok = await kv.update('lib', (raw) => {
          seen.push(raw);
          return JSON.stringify([...(JSON.parse(raw ?? '[]') as string[]), 'c']);
        });
        expect(ok).toBe(false);
      });
    } finally {
      getSpy.mockRestore();
    }
    expect(seen).not.toContain(null);
    expect(local.map.has('lib')).toBe(false);
    await __resetIdbForTests();
    expect(await new IndexedDbKeyValueStore(new FakeLocal()).get('lib')).toBe('["a","b"]');
  });

  it('reads IndexedDB again once another tab has migrated the key back', async () => {
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    await kv.set('lib', '["a"]');
    await abortAfterSuccess(async () => {
      await kv.update('lib', () => '["a","b"]');
    });
    expect(local.map.get('lib')).toBe('["a","b"]');

    const tabB = new IndexedDbKeyValueStore(new FakeLocal(local.map));
    expect(await tabB.get('lib')).toBe('["a","b"]');
    expect(local.map.has('lib')).toBe(false);

    const seen: (string | null)[] = [];
    await kv.update('lib', (raw) => {
      seen.push(raw);
      return raw;
    });
    expect(seen).toEqual(['["a","b"]']);
  });

  it('rethrows a reducer that throws and does not report storage as degraded', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    await kv.set('k', 'v');
    const boom = new Error('bad reducer');
    await expect(
      kv.update('k', () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(degraded()).toBe(false);
    expect(await kv.get('k')).toBe('v');
  });
});

describe('a QuotaExceededError is not a degraded IndexedDB', () => {
  it('reports through set()/update() without flipping the session to degraded', async () => {
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    await kv.set('warm', 'up');
    expect(degraded()).toBe(false);

    const full = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      expect(await kv.set('k', 'v')).toBe(true);
      expect(local.map.get('k')).toBe('v');
      expect(await kv.update('k2', () => 'v2')).toBe(true);
      expect(degraded()).toBe(false);
    } finally {
      full.mockRestore();
    }
    expect(await kv.set('after', 'fits')).toBe(true);
    expect(await kv.get('after')).toBe('fits');
  });

  it('an OPEN failure still degrades (the warning the flag exists for)', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    const boom = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    await __resetIdbForTests();
    await kv.set('a', '1');
    expect(degraded()).toBe(true);
    boom.mockRestore();
  });
});

describe('a connection closed underneath the store', () => {
  const captureConnections = () => {
    const opened: IDBDatabase[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- saved to wrap; called back with .apply(indexedDB, ...)
    const realOpen = indexedDB.open;
    const spy = vi.spyOn(indexedDB, 'open').mockImplementation((...args: Parameters<typeof realOpen>) => {
      const req = realOpen.apply(indexedDB, args);
      req.addEventListener('success', () => opened.push(req.result));
      return req;
    });
    return { opened, restore: () => spy.mockRestore() };
  };

  it('reopens after a close event instead of falling back', async () => {
    const { opened, restore } = captureConnections();
    try {
      await __resetIdbForTests();
      const local = new FakeLocal();
      const kv = new IndexedDbKeyValueStore(local);
      await kv.set('warm', 'up');
      expect(opened).toHaveLength(1);
      const db = opened[0]!;
      db.close();
      db.onclose?.(new Event('close'));

      expect(await kv.set('k', 'v')).toBe(true);
      expect(local.map.has('k')).toBe(false);
      expect(opened).toHaveLength(2);
      expect(degraded()).toBe(false);
    } finally {
      restore();
    }
  });

  it('reopens when the closed handle is still cached with no close event', async () => {
    const { opened, restore } = captureConnections();
    try {
      await __resetIdbForTests();
      const local = new FakeLocal();
      const kv = new IndexedDbKeyValueStore(local);
      await kv.set('lib', '["a"]');
      opened[0]!.close();

      expect(await kv.update('lib', (raw) => raw + '!')).toBe(true);
      expect(await kv.get('lib')).toBe('["a"]!');
      expect(local.map.size).toBe(0);
      expect(degraded()).toBe(false);
    } finally {
      restore();
    }
  });

  it('a later session reads the fallback copy over an IndexedDB entry the demote could not delete', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    await kv.set('k', 'old');
    const local = new FakeLocal();
    local.map.set('k', 'new');

    await __resetIdbForTests();
    const next = new IndexedDbKeyValueStore(new FakeLocal(local.map));
    expect(await next.get('k')).toBe('new');
    expect(local.map.has('k')).toBe(false);
    await __resetIdbForTests();
    expect(await new IndexedDbKeyValueStore(new FakeLocal()).get('k')).toBe('new');
  });

  it('an update in a later session hands the reducer the fallback copy', async () => {
    const kv = new IndexedDbKeyValueStore(new FakeLocal());
    await kv.set('lib', '["old"]');
    const local = new FakeLocal();
    local.map.set('lib', '["new"]');

    await __resetIdbForTests();
    const next = new IndexedDbKeyValueStore(local);
    const seen: (string | null)[] = [];
    await next.update('lib', (raw) => {
      seen.push(raw);
      return raw;
    });
    expect(seen).toEqual(['["new"]']);
  });

  it('a successful write clears an older fallback copy', async () => {
    const local = new FakeLocal();
    local.map.set('k', 'older');
    const kv = new IndexedDbKeyValueStore(local);
    expect(await kv.set('k', 'newest')).toBe(true);
    expect(local.map.has('k')).toBe(false);
  });
});

describe('a session where IndexedDB never opens', () => {
  it.each([
    [
      'the open throws',
      () =>
        vi.spyOn(indexedDB, 'open').mockImplementation(() => {
          throw new Error('IndexedDB disabled');
        }),
    ],
    ['there is no IndexedDB', () => vi.stubGlobal('indexedDB', undefined)],
  ])('stores the first entry of a new list when %s', async (_name, breakIdb) => {
    await __resetIdbForTests();
    const local = new FakeLocal();
    const kv = new IndexedDbKeyValueStore(local);
    breakIdb();
    try {
      expect(await kv.update('motors', () => '["m1"]')).toBe(true);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
    expect(local.map.get('motors')).toBe('["m1"]');
  });

  it('creates the first design of an empty library', async () => {
    await __resetIdbForTests();
    const { DesignLibrary } = await import('../../../src/services/storage/designLibrary');
    const local = new FakeLocal();
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    try {
      const lib = new DesignLibrary(new IndexedDbKeyValueStore(local));
      await expect(lib.create('r', { version: 2 } as never)).resolves.toBeTruthy();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
