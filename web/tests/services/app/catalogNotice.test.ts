// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorageKeyValueStore } from '../../../src/services/storage/keyValueStore';

vi.mock('../../../src/services/storage/idbKeyValueStore', () => ({
  IndexedDbKeyValueStore: LocalStorageKeyValueStore,
}));
vi.mock('../../../src/services/app/remoteData', () => ({ catalogHash: () => Promise.resolve('h2') }));

const { checkCatalog, noteCatalogLoad } = await import('../../../src/services/app/catalogUpdates');

const written = (hash: string) => JSON.stringify({ ...localStorage }).includes(hash);

beforeEach(() => localStorage.clear());

describe('the catalog change notice', () => {
  it('reaches the notice store even when the catalog loaded first', async () => {
    await checkCatalog('motors', 'h1', ['a'], new LocalStorageKeyValueStore());
    noteCatalogLoad('motors', () => ['a', 'b']);
    await vi.waitFor(() => expect(written('h2')).toBe(true));

    const { useCatalogNoticeStore } = await import('../../../src/state/catalogNoticeStore');
    await vi.waitFor(() =>
      expect(useCatalogNoticeStore.getState().changes).toEqual([{ name: 'motors', added: 1, removed: 0 }]),
    );
  });

  it('reaches a notice store already listening', async () => {
    const { useCatalogNoticeStore } = await import('../../../src/state/catalogNoticeStore');
    useCatalogNoticeStore.getState().dismiss();
    await checkCatalog('components', 'h1', ['a', 'b'], new LocalStorageKeyValueStore());
    noteCatalogLoad('components', () => ['a']);
    await vi.waitFor(() =>
      expect(useCatalogNoticeStore.getState().changes).toEqual([{ name: 'components', added: 0, removed: 1 }]),
    );
  });
});
