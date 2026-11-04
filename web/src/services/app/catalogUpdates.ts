import { useCatalogNoticeStore, type CatalogChange } from '../../state/catalogNoticeStore';
import { IndexedDbKeyValueStore } from '../storage/idbKeyValueStore';
import type { KeyValueStore } from '../storage/keyValueStore';
import { nsKey } from '../storage/storageKeys';
import { catalogHash } from './remoteData';

// Read and written in one `update` so two tabs report a change once between them.

interface Seen {
  hash: string;
  keys: string[];
}

const isSeen = (v: unknown): v is Seen =>
  !!v &&
  typeof (v as Seen).hash === 'string' &&
  Array.isArray((v as Seen).keys) &&
  (v as Seen).keys.every((k) => typeof k === 'string');

export function diffKeys(before: readonly string[], after: readonly string[]): { added: number; removed: number } {
  const was = new Set(before);
  const now = new Set(after);
  let added = 0;
  let removed = 0;
  for (const k of now) if (!was.has(k)) added++;
  for (const k of was) if (!now.has(k)) removed++;
  return { added, removed };
}

export async function checkCatalog(
  name: CatalogChange['name'],
  hash: string,
  keys: readonly string[],
  kv: KeyValueStore,
): Promise<CatalogChange | null> {
  let change: CatalogChange | null = null;
  await kv.update(nsKey(`catalogSeen:${name}`), (raw) => {
    let prev: unknown;
    try {
      prev = raw === null ? null : JSON.parse(raw);
    } catch {
      prev = null;
    }
    if (isSeen(prev) && prev.hash === hash) return raw;
    if (isSeen(prev)) change = { name, ...diffKeys(prev.keys, keys) };
    return JSON.stringify({ hash, keys: [...keys] } satisfies Seen);
  });
  return change;
}

const noted = new Set<CatalogChange['name']>();

export function noteCatalogLoad(name: CatalogChange['name'], keys: () => readonly string[]): void {
  if (noted.has(name)) return;
  noted.add(name);
  void (async () => {
    const hash = await catalogHash(name);
    if (!hash) return;
    const change = await checkCatalog(name, hash, keys(), new IndexedDbKeyValueStore());
    if (change) useCatalogNoticeStore.getState().report(change);
  })().catch(() => {});
}
