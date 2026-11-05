// A localStorage fallback copy is always newer than IndexedDB's; reads promote it back.
import { type KeyValueStore, LocalStorageKeyValueStore } from './keyValueStore';
import { STORAGE_PREFIX } from './storageKeys';
import { toError } from '../app/errorMessage';

const DB_NAME = STORAGE_PREFIX;
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

let everOpened = false;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      everOpened = true;
      // Yield to another tab's upgrade, or that tab hits onblocked and is stuck on the fallback.
      db.onversionchange = () => {
        try {
          db.close();
        } catch {
          /* already gone */
        }
        if (dbPromise === p) dbPromise = null;
      };
      db.onclose = () => {
        if (dbPromise === p) dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
    // The blocked request stays pending: close its late connection or it leaks and blocks the next upgrade.
    req.onblocked = () => {
      req.onsuccess = () => {
        try {
          req.result.close();
        } catch {
          /* already gone */
        }
      };
      reject(new Error('IndexedDB blocked by another tab'));
    };
  });
  p.catch(() => {
    if (dbPromise === p) dbPromise = null;
  });
  dbPromise = p;
  return p;
}

let degraded = false;
const degradedListeners = new Set<() => void>();

export function onStorageDegraded(cb: () => void): () => void {
  degradedListeners.add(cb);
  if (degraded) cb();
  return () => {
    degradedListeners.delete(cb);
  };
}

function markDegraded(): void {
  if (degraded) return;
  degraded = true;
  for (const cb of degradedListeners) cb();
}

// IndexedDB still works after a QuotaExceededError, so a quota failure must not flip `degraded`.
function isQuotaError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'QuotaExceededError';
}

function isInvalidState(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'InvalidStateError';
}

// Reopens on InvalidStateError: a page-requested close never fires onclose to clear the cache.
async function begin(mode: IDBTransactionMode): Promise<IDBTransaction> {
  const cached = openDb();
  const db = await cached;
  try {
    return db.transaction(STORE, mode);
  } catch (e) {
    if (!isInvalidState(e)) throw e;
    if (dbPromise === cached) dbPromise = null;
    return (await openDb()).transaction(STORE, mode);
  }
}

function rejectOnTxFailure(t: IDBTransaction, reject: (e: Error) => void): void {
  t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
  t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
}

// Writes resolve on transaction complete, not request success: it can still abort before commit.
async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const t = await begin(mode);
  return await new Promise<T>((resolve, reject) => {
    const req = run(t.objectStore(STORE));
    let result: T;
    req.onsuccess = () => {
      result = req.result as T;
      if (mode === 'readonly') resolve(result);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    t.oncomplete = () => resolve(result);
    rejectOnTxFailure(t, reject);
  });
}

class ReducerError extends Error {
  constructor(readonly inner: unknown) {
    super('update reducer threw');
  }
}

// No await between get and put: awaiting a non-IndexedDB promise lets the transaction auto-commit.
async function txUpdate(key: string, fn: (raw: string | null) => string | null): Promise<void> {
  const t = await begin('readwrite');
  return await new Promise<void>((resolve, reject) => {
    const store = t.objectStore(STORE);
    const read = store.get(key);
    read.onsuccess = () => {
      let next: string | null;
      try {
        next = fn((read.result as string | undefined) ?? null);
      } catch (e) {
        // Reject before abort so onabort cannot win the race.
        reject(new ReducerError(e));
        t.abort();
        return;
      }
      // Reject before abort so a quota error is not masked by the generic abort.
      try {
        if (next === null) store.delete(key);
        else store.put(next, key);
      } catch (e) {
        reject(toError(e));
        t.abort();
      }
    };
    read.onerror = () => reject(read.error ?? new Error('IndexedDB read failed'));
    t.oncomplete = () => resolve();
    rejectOnTxFailure(t, reject);
  });
}

// Await before deleteDatabase() between tests: an open connection blocks it.
export async function __resetIdbForTests(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  degraded = false;
  everOpened = false;
  try {
    (await pending)?.close();
  } catch {
    /* never opened */
  }
}

const UNREADABLE = Symbol('unreadable');

export class IndexedDbKeyValueStore implements KeyValueStore {
  constructor(private readonly fallback: KeyValueStore = new LocalStorageKeyValueStore()) {}

  // After a quota abort IndexedDB still reads, and would otherwise serve the stale copy.
  private readonly fellBack = new Set<string>();

  async get(key: string): Promise<string | null> {
    try {
      return await this.getChecked(key);
    } catch {
      return null;
    }
  }

  async getChecked(key: string): Promise<string | null> {
    const newer = await this.fallback.get(key);
    if (newer != null) {
      if (!this.fellBack.has(key)) await this.promote(key, newer);
      return newer;
    }
    this.fellBack.delete(key);
    if (typeof indexedDB === 'undefined') {
      markDegraded();
      return null;
    }
    try {
      return (await tx<string | undefined>('readonly', (s) => s.get(key))) ?? null;
    } catch (e) {
      markDegraded();
      throw toError(e);
    }
  }

  async set(key: string, value: string): Promise<boolean> {
    try {
      await tx('readwrite', (s) => s.put(value, key));
      this.fellBack.delete(key);
      // Left behind, the now-older fallback copy would win every read.
      await this.fallback.remove(key);
      return true;
    } catch (e) {
      if (!isQuotaError(e)) markDegraded();
      const ok = await this.fallback.set(key, value);
      if (ok) await this.demote(key);
      return ok;
    }
  }

  async update(key: string, fn: (raw: string | null) => string | null): Promise<boolean> {
    // With no fallback copy the key lives in IndexedDB: never hand the reducer the fallback's null.
    const newer = await this.fallback.get(key);
    if (newer != null && (this.fellBack.has(key) || !(await this.promote(key, newer)))) {
      this.fellBack.add(key);
      return await this.fallback.update(key, fn);
    }
    this.fellBack.delete(key);
    try {
      await txUpdate(key, fn);
      this.fellBack.delete(key);
      return true;
    } catch (e) {
      if (e instanceof ReducerError) throw e.inner;
      if (!isQuotaError(e)) markDegraded();
      // Seed with the IndexedDB copy: handed null the reducer would rebuild the index from nothing.
      const current = await this.readIdb(key);
      // WebKit can lose the connection mid-session; refuse rather than demote a truncated list.
      if (current === UNREADABLE && (await this.fallback.get(key)) == null) return false;
      const seed = current === UNREADABLE ? null : current;
      const ok = await this.fallback.update(key, (raw) => fn(raw ?? seed));
      if (ok) await this.demote(key);
      return ok;
    }
  }

  private async demote(key: string): Promise<void> {
    this.fellBack.add(key);
    try {
      await tx('readwrite', (s) => s.delete(key));
    } catch {
      /* best-effort */
    }
  }

  // Null, not UNREADABLE, before any connection opened, or every list's first write is refused for good.
  private async readIdb(key: string): Promise<string | null | typeof UNREADABLE> {
    try {
      return (await tx<string | undefined>('readonly', (s) => s.get(key))) ?? null;
    } catch {
      return everOpened ? UNREADABLE : null;
    }
  }

  async remove(key: string): Promise<void> {
    this.fellBack.delete(key);
    try {
      await tx('readwrite', (s) => s.delete(key));
    } catch {
      /* best-effort */
    }
    // Always clear the fallback too: a never-read key was never moved back.
    await this.fallback.remove(key);
  }

  private async promote(key: string, value: string): Promise<boolean> {
    try {
      await tx('readwrite', (s) => s.put(value, key));
    } catch (e) {
      if (!isQuotaError(e)) markDegraded();
      return false;
    }
    await this.fallback.remove(key);
    return true;
  }
}
