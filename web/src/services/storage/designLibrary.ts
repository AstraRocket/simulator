// Split keys so the 500 ms autosave rewrites only one design's inputs, not its large results.
import type { KeyValueStore } from './keyValueStore';
import { IndexedDbKeyValueStore } from './idbKeyValueStore';
import { parseJsonList } from './jsonListStore';
import type { Workspace } from './workspaceStore';
import type { FlightResult } from '../../engine/openRocketEngine';
import { nsKey } from './storageKeys';
import { isFiniteNumber } from '../app/numbers';
import { shortId } from '../app/uuid';

export type StoredResults = Record<string, FlightResult>;

const INDEX_KEY = nsKey('designs:index');
const ACTIVE_KEY = nsKey('designs:active');
const designKey = (id: string) => nsKey(`designs:${id}`);
const resultsKey = (id: string) => nsKey(`designs:${id}:results`);

export interface DesignMeta {
  id: string;
  name: string;
  /** Epoch ms. */
  updatedAt: number;
  /** Tab id of the last save; absent reads as "some other tab". */
  writer?: string;
}

const isMeta = (v: unknown): v is DesignMeta => {
  const m = v as DesignMeta | null;
  return !!m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.updatedAt === 'number';
};

const isNullableNumber = (v: unknown): boolean => v === null || isFiniteNumber(v);

// JSON.stringify stores NaN/Infinity as null, and .toFixed() on null throws mid-export.
function isFlightResult(v: unknown): v is FlightResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const s = r.summary as Record<string, unknown> | undefined;
  if (!s || typeof s !== 'object') return false;
  // Exporters call .toFixed() on these three; the rest may be null.
  for (const k of ['maxAltitude', 'maxVelocity', 'maxAcceleration']) {
    if (!isFiniteNumber(s[k])) return false;
  }
  for (const k of [
    'maxMachNumber',
    'timeToApogee',
    'flightTime',
    'groundHitVelocity',
    'launchRodVelocity',
    'deploymentVelocity',
    'optimumDelay',
  ]) {
    if (!isNullableNumber(s[k])) return false;
  }
  const series = r.series as Record<string, unknown> | undefined;
  if (!series || typeof series !== 'object') return false;
  for (const k of ['time', 'altitude', 'velocity', 'acceleration']) {
    if (!Array.isArray(series[k])) return false;
  }
  return Array.isArray(r.events);
}

export const freshId = () => shortId('d', 6);

// Strictly later than prev: two writes in one ms must still move the stamp other tabs compare.
const nextStamp = (prev?: number): number => Math.max(Date.now(), (prev ?? 0) + 1);

const withEntry = (list: DesignMeta[], entry: DesignMeta): DesignMeta[] => [
  entry,
  ...list.filter((m) => m.id !== entry.id),
];

export class DesignLibrary {
  constructor(private readonly kv: KeyValueStore = new IndexedDbKeyValueStore()) {}

  async list(): Promise<DesignMeta[]> {
    return (await this.readIndex()).slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private async readIndex(): Promise<DesignMeta[]> {
    return parseJsonList(await this.kv.get(INDEX_KEY), isMeta);
  }

  // One transaction: IndexedDB is shared across tabs, and a split read-then-write drops entries.
  private async mutateIndex(fn: (list: DesignMeta[]) => DesignMeta[]): Promise<boolean> {
    return await this.kv.update(INDEX_KEY, (raw) => JSON.stringify(fn(parseJsonList(raw, isMeta))));
  }

  async activeId(): Promise<string | null> {
    const id = await this.kv.get(ACTIVE_KEY);
    if (!id) return null;
    // An id of a deleted design would strand the app on a workspace it cannot save to.
    return (await this.readIndex()).some((m) => m.id === id) ? id : null;
  }

  // Rejects on a failed read: boot reading "none" would drop the unload journal as stale.
  async activeIdChecked(): Promise<string | null> {
    const id = await this.getChecked(ACTIVE_KEY);
    if (!id) return null;
    return parseJsonList(await this.getChecked(INDEX_KEY), isMeta).some((m) => m.id === id) ? id : null;
  }

  private async getChecked(key: string): Promise<string | null> {
    return this.kv.getChecked ? await this.kv.getChecked(key) : await this.kv.get(key);
  }

  /** False if storage refused the write; callers must not ignore it. */
  async setActive(id: string): Promise<boolean> {
    return await this.kv.set(ACTIVE_KEY, id);
  }

  async read(id: string): Promise<Workspace | null> {
    const raw = await this.kv.get(designKey(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Workspace;
    } catch {
      return null;
    }
  }

  async write(id: string, name: string, w: Workspace, writer?: string): Promise<boolean> {
    if (!(await this.kv.set(designKey(id), JSON.stringify(w)))) return false;
    // A refused index write must fail too: an unindexed design is unreachable via activeId().
    return await this.mutateIndex((list) => {
      const prev = list.find((m) => m.id === id);
      return withEntry(list, { id, name, updatedAt: nextStamp(prev?.updatedAt), ...(writer ? { writer } : {}) });
    });
  }

  // The stamp is claimed before the blob write and moved again after, so a reader that
  // paired the claimed stamp with the old blob is refused. Do not reorder.
  async writeIfUnchanged(
    id: string,
    name: string,
    w: Workspace,
    seenAt: number | null,
    writer?: string,
  ): Promise<{ status: 'ok' | 'conflict' | 'refused'; updatedAt?: number }> {
    let conflict = false;
    let updatedAt: number | undefined;
    const claimed = await this.mutateIndex((list) => {
      const prev = list.find((m) => m.id === id);
      if (seenAt != null && prev && prev.updatedAt > seenAt) {
        conflict = true;
        return list;
      }
      updatedAt = nextStamp(prev?.updatedAt);
      return withEntry(list, { id, name: prev?.name ?? name, updatedAt, ...(writer ? { writer } : {}) });
    });
    if (conflict) return { status: 'conflict' };
    if (!claimed || updatedAt === undefined) return { status: 'refused' };
    if (!(await this.kv.set(designKey(id), JSON.stringify(w)))) return { status: 'refused', updatedAt };
    // Restamp only over this call's own claim; an entry moved since is another writer's.
    const claim = updatedAt;
    let settled = claim;
    const restamped = await this.mutateIndex((list) => {
      const prev = list.find((m) => m.id === id);
      if (!prev || prev.updatedAt !== claim) return list;
      settled = nextStamp(claim);
      return list.map((m) => (m.id === id ? { ...m, updatedAt: settled } : m));
    });
    return { status: 'ok', updatedAt: restamped ? settled : claim };
  }

  async create(name: string, w: Workspace, writer?: string, id: string = freshId()): Promise<DesignMeta> {
    if (!(await this.write(id, name, w, writer))) throw new Error('storage-full');
    // Roll back first: the next autosave creates again, and a leftover would duplicate every 500 ms.
    if (!(await this.setActive(id))) {
      await this.remove(id);
      throw new Error('storage-full');
    }
    const meta = (await this.readIndex()).find((m) => m.id === id);
    return meta ?? { id, name, updatedAt: Date.now() };
  }

  async rename(id: string, name: string): Promise<boolean> {
    return await this.mutateIndex((list) => list.map((m) => (m.id === id ? { ...m, name } : m)));
  }

  // Results skip migrateWorkspace, so each entry is shape-checked here.
  async readResults(id: string): Promise<StoredResults> {
    const raw = await this.kv.get(resultsKey(id));
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out: StoredResults = {};
      for (const [simId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (isFlightResult(value)) out[simId] = value;
      }
      return out;
    } catch {
      return {};
    }
  }

  async writeResults(id: string, results: StoredResults): Promise<boolean> {
    if (!Object.keys(results).length) {
      await this.kv.remove(resultsKey(id));
      return true;
    }
    return await this.kv.set(resultsKey(id), JSON.stringify(results));
  }

  // Index first: orphaned bytes cost space, but an indexed design with no bytes opens broken.
  async remove(id: string): Promise<boolean> {
    if (!(await this.mutateIndex((list) => list.filter((m) => m.id !== id)))) return false;
    await this.kv.remove(designKey(id));
    await this.kv.remove(resultsKey(id));
    if ((await this.kv.get(ACTIVE_KEY)) === id) await this.kv.remove(ACTIVE_KEY);
    return true;
  }
}

let library = new DesignLibrary();
export function getDesignLibrary(): DesignLibrary {
  return library;
}
export function setDesignLibrary(next: DesignLibrary): void {
  library = next;
}
