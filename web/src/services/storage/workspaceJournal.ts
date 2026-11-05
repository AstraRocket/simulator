import type { DesignMeta } from './designLibrary';
import { nsKey } from './storageKeys';
import type { Workspace } from './workspaceStore';

// IndexedDB writes cannot complete during teardown, so unload journals to localStorage.
const UNLOAD_KEY = nsKey('designs:unload');
export const journalKey = (id: string) => `${UNLOAD_KEY}:${id}`;

// Write time cannot order a journal: a stale tab still journals after another tab's save.
export interface Journal {
  id: string | null;
  w: Workspace;
  base?: number | null;
  tab: string;
  /** Epoch ms. */
  t: number;
  /** Orders the journal against the tab's saves, which a wall clock cannot. */
  mark?: number;
  createId?: string;
  name?: string;
}

export function journalIsCurrent(j: Journal, meta: DesignMeta | null): boolean {
  if (!meta) return true;
  if (meta.writer === j.tab) return true;
  if (typeof j.base === 'number') return meta.updatedAt <= j.base;
  return meta.updatedAt <= j.t;
}

export interface StoredJournal {
  key: string;
  j: Journal;
}

function readJournalAt(key: string): Journal | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as Journal;
    return j && j.w ? j : null;
  } catch {
    return null;
  }
}

export function readJournals(): StoredJournal[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${UNLOAD_KEY}:`)) keys.push(k);
    }
  } catch {
    return [];
  }
  const out: StoredJournal[] = [];
  for (const key of keys) {
    const j = readJournalAt(key);
    if (j) out.push({ key, j });
    else clearJournal(key);
  }
  return out;
}

export const newest = (list: StoredJournal[]): StoredJournal | undefined =>
  list.reduce<StoredJournal | undefined>((a, b) => (!a || b.j.t > a.j.t ? b : a), undefined);

export const journalFor = (list: StoredJournal[], id: string): StoredJournal | undefined =>
  list.find((e) => e.j.id === id);

// A same-tab journal left behind would roll a later autosave back after a crash.
export function dropSupersededJournal(tab: string, id: string, startedAt: number): void {
  const key = journalKey(id);
  const j = readJournalAt(key);
  if (!j || j.tab !== tab || typeof j.mark !== 'number' || j.mark >= startedAt) return;
  if (j.id === id || (j.id === null && j.createId === id)) clearJournal(key);
}

export function clearJournal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}
