// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { checkCatalog, diffKeys } from '../../../src/services/app/catalogUpdates';
import { LocalStorageKeyValueStore } from '../../../src/services/storage/keyValueStore';

/**
 * The catalog-updated banner reports a catalog this browser loaded before and
 * that has since changed: how many rows are new and how many are gone. The
 * first load in a browser reports nothing, since every row would be new to it,
 * and a load of the same hash reports nothing either.
 */
describe('diffKeys', () => {
  it('counts the keys only in the new list and only in the old one', () => {
    expect(diffKeys(['a', 'b', 'c'], ['b', 'c', 'd', 'e'])).toEqual({ added: 2, removed: 1 });
  });

  it('counts a duplicated key once', () => {
    expect(diffKeys(['a', 'a'], ['a', 'b', 'b'])).toEqual({ added: 1, removed: 0 });
  });
});

describe('checkCatalog', () => {
  let kv: LocalStorageKeyValueStore;
  beforeEach(() => {
    localStorage.clear();
    kv = new LocalStorageKeyValueStore();
  });

  it('reports nothing on the first load in a browser', async () => {
    expect(await checkCatalog('motors', 'h1', ['a', 'b'], kv)).toBeNull();
  });

  it('reports nothing when the hash is the one seen last', async () => {
    await checkCatalog('motors', 'h1', ['a', 'b'], kv);
    expect(await checkCatalog('motors', 'h1', ['a', 'b'], kv)).toBeNull();
  });

  it('reports what changed when the hash differs, then nothing for that hash again', async () => {
    await checkCatalog('motors', 'h1', ['a', 'b'], kv);
    expect(await checkCatalog('motors', 'h2', ['b', 'c', 'd'], kv)).toEqual({ name: 'motors', added: 2, removed: 1 });
    expect(await checkCatalog('motors', 'h2', ['b', 'c', 'd'], kv)).toBeNull();
  });

  it('reports a new hash with the same rows as a change of nothing added or removed', async () => {
    await checkCatalog('components', 'h1', ['a'], kv);
    expect(await checkCatalog('components', 'h2', ['a'], kv)).toEqual({ name: 'components', added: 0, removed: 0 });
  });

  it('keeps each catalog its own record', async () => {
    await checkCatalog('motors', 'h1', ['a'], kv);
    expect(await checkCatalog('components', 'h9', ['x'], kv)).toBeNull();
  });

  it('reads an unreadable record as a first load', async () => {
    await checkCatalog('motors', 'h1', ['a'], kv);
    localStorage.setItem(localStorage.key(0)!, '{not json');
    expect(await checkCatalog('motors', 'h2', ['b'], kv)).toBeNull();
  });
});
