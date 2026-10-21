import { useCatalogNoticeStore, type CatalogChange } from '../../state/catalogNoticeStore';
import { IndexedDbKeyValueStore } from '../storage/idbKeyValueStore';
import type { KeyValueStore } from '../storage/keyValueStore';
import { nsKey } from '../storage/storageKeys';
import { catalogHash } from './remoteData';

/**
 * Tell the user when a catalog they have loaded before has changed.
 *
 * The scheduled sync replaces the motor and parts catalogs on the data host,
 * and the app picks a replacement up on its next load with nothing on screen to
 * say so. This keeps, per catalog, the manifest hash and the row keys this
 * browser last loaded, and on the load that brings a different hash reports how
 * many rows are new and how many are gone.
 *
 * The first load in a browser records and reports nothing: every row would be
 * "new" to it. A catalog with no hash in its manifest (a build without one) is
 * neither recorded nor reported, since nothing says whether it changed.
 *
 * The record is read and written in one `update`, so two tabs opening on the
 * same new catalog report it once between them.
 */

interface Seen {
  hash: string;
  keys: string[];
}

const isSeen = (v: unknown): v is Seen =>
  !!v &&
  typeof (v as Seen).hash === 'string' &&
  Array.isArray((v as Seen).keys) &&
  (v as Seen).keys.every((k) => typeof k === 'string');

/** How many keys are in `after` and not `before`, and the reverse. */
export function diffKeys(before: readonly string[], after: readonly string[]): { added: number; removed: number } {
  const was = new Set(before);
  const now = new Set(after);
  let added = 0;
  let removed = 0;
  for (const k of now) if (!was.has(k)) added++;
  for (const k of was) if (!now.has(k)) removed++;
  return { added, removed };
}

/**
 * Compare one catalog load against the record, update the record, and return
 * the change to report, if any. Exported for the tests; the app calls
 * {@link noteCatalogLoad}.
 */
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

/**
 * Record a catalog this session loaded, once per catalog per session, and
 * raise the banner if it changed. Never throws: a record that cannot be read
 * or written only means no banner.
 */
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
