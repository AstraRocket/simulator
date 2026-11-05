import { must } from '../app/must';
import { freshId, getDesignLibrary, type DesignLibrary, type DesignMeta, type StoredResults } from './designLibrary';
import type { FlightResult, RocketTree } from '../../engine/openRocketEngine';
import { withoutResults, type Simulation } from '../flight/simulations';
import type { FlightConfig } from '../flight/flightConfigs';
import { migrateWorkspace } from './workspaceMigrate';
import {
  clearJournal,
  dropSupersededJournal,
  journalFor,
  journalIsCurrent,
  journalKey,
  newest,
  readJournals,
  type Journal,
  type StoredJournal,
} from './workspaceJournal';
import { designNameOf } from '../app/appInfo';
import type { LoadedMeta } from '../files/wireLoadedOrk';
import { shortId } from '../app/uuid';

export interface Workspace {
  version: 3;
  tree: RocketTree;
  sims: Simulation[];
  /** Never empty; unreferenced ones are kept, not pruned. */
  configs: FlightConfig[];
  activeId: string;
  loadedMeta: LoadedMeta | null;
}

interface Opened {
  w: Workspace;
  seenAt: number | null;
}

export interface WorkspaceStore {
  load(): Promise<Workspace | null>;
  save(w: Workspace): Promise<void>;
  saveSync?(w: Workspace): void;
  setActiveId?(id: string | null): void;
  /** `stale` covers replacements the store cannot see (an import still parsing). */
  openActive?(id: string, stale?: () => boolean): Promise<Workspace | null>;
  /** Cleared by `setActiveId`. */
  setPendingName?(name: string | null): void;
}

const freshTabId = () => shortId('t', 8);

export const lean = (w: Workspace): Workspace => ({ ...w, sims: withoutResults(w.sims) });

const withResults = (w: Workspace, results: StoredResults): Workspace => ({
  ...w,
  sims: w.sims.map((s) => (results[s.id] ? { ...s, result: results[s.id]! } : s)),
});

export const resultsOf = (w: Workspace): StoredResults => {
  const out: StoredResults = {};
  for (const s of w.sims) if (s.result) out[s.id] = s.result;
  return out;
};

const nameFor = (w: Workspace) => designNameOf(w.tree, w.loadedMeta);

export class LibraryWorkspaceStore implements WorkspaceStore {
  /** Null means detached: the next save creates a new entry. */
  private activeId: string | null = null;
  /** Compared by identity: results are replaced wholesale, never mutated. */
  private savedResults = new Map<string, FlightResult | null>();
  /** Without it, overlapping detached saves each create an entry. */
  private creating: Promise<DesignMeta> | null = null;
  /** The name for the entry a detached workspace will create. */
  private pendingName: string | null = null;
  /** Kept until a create lands, so a journal replay finds that entry instead of making a second. */
  private createId: string | null = null;
  /** A create resolving after `setActiveId` must not adopt its id. */
  private gen = 0;
  /** The entry's stamp at our last read or write; a newer one means another tab wrote. */
  private lastSeenAt: number | null = null;
  /** Another tab won this entry, so unload journals and an old workspace's queued saves stay out. */
  private conflicted = false;
  /** By entry id, stamps of writes that landed after a switch, so that workspace's next queued save claims them. */
  private detached = new Map<string, number>();
  /** The boot journal is the only copy of its work, so no unload journal may overwrite it. */
  private journalHeld = false;
  /** Stamped on writes and journals, so this tab can tell its own from another's. */
  private readonly tab = freshTabId();
  /** Orders saves and journals within this tab, so a save drops only the journals older than it. */
  private mark = 0;

  async load(): Promise<Workspace | null> {
    const lib = getDesignLibrary();
    const journals = readJournals();
    try {
      this.activeId = await lib.activeIdChecked();
    } catch {
      // Unreadable is not empty: the checks below would drop the journal as stale.
      this.activeId = null;
      const latest = newest(journals);
      const w = latest ? migrateWorkspace(latest.j.w) : null;
      if (!latest || !w) return null;
      this.journalHeld = true;
      if (latest.j.id === null) this.adoptCreate(latest.j);
      return this.trackResults(w);
    }

    const ids = new Set((await lib.list()).map((m) => m.id));
    for (const e of journals) {
      if (e.j.id === null && e.j.createId && ids.has(e.j.createId)) e.j = { ...e.j, id: e.j.createId };
      else if (e.j.id !== null && !ids.has(e.j.id)) clearJournal(e.key);
    }

    const mine = this.activeId ? journalFor(journals, this.activeId) : undefined;
    if (mine) return await this.replayJournal(lib, mine);
    // Whatever the active pointer says: New and import detach without moving it.
    const fresh = newest(journals.filter((e) => e.j.id === null));
    if (fresh) {
      const journal = fresh.j;
      const w = migrateWorkspace(journal.w);
      if (!w) {
        clearJournal(fresh.key);
        return await this.readActive(lib);
      }
      this.adoptCreate(journal);
      try {
        const meta = await lib.create(journal.name || nameFor(w), w, this.tab, this.nextCreateId());
        clearJournal(fresh.key);
        this.createId = null;
        this.pendingName = null;
        this.activeId = meta.id;
        this.lastSeenAt = meta.updatedAt;
      } catch {
        // The journal is the only copy, so it stays.
        this.activeId = null;
      }
      return this.trackResults(w);
    }

    return await this.readActive(lib);
  }

  private async replayJournal(lib: DesignLibrary, e: StoredJournal): Promise<Workspace | null> {
    try {
      return this.hold(await this.replayEntry(lib, e));
    } catch (err) {
      this.activeId = null;
      throw err;
    }
  }

  private async replayEntry(lib: DesignLibrary, e: StoredJournal): Promise<Opened> {
    const journal = e.j;
    const id = must(journal.id, 'journal id');
    if (!journalIsCurrent(journal, await this.metaOf(id))) {
      clearJournal(e.key);
      return await this.readEntry(lib, id);
    }
    // Validate before writing: an unreadable journal would destroy the stored design.
    const w = migrateWorkspace(journal.w);
    if (!w) {
      clearJournal(e.key);
      return await this.readEntry(lib, id);
    }
    // Compared before migration, which can mint new ids.
    const stored = await lib.read(id);
    if (stored && JSON.stringify(stored) === JSON.stringify(journal.w)) {
      clearJournal(e.key);
      return await this.readEntry(lib, id);
    }
    if (await lib.write(id, (await this.nameOf(id)) ?? nameFor(w), w, this.tab)) {
      clearJournal(e.key);
    }
    // Claim this tab's own replay, or the first autosave reads it as another tab's.
    const seenAt = (await this.metaOf(id))?.updatedAt ?? null;
    return { w: withResults(w, await lib.readResults(id)), seenAt };
  }

  /** Throws after detaching, so the default rocket's autosave cannot overwrite an unreadable design. */
  private async readActive(lib: DesignLibrary): Promise<Workspace | null> {
    const id = this.activeId;
    if (!id) return null;
    try {
      return this.hold(await this.readEntry(lib, id));
    } catch (e) {
      this.activeId = null;
      throw e;
    }
  }

  private async readEntry(lib: DesignLibrary, id: string): Promise<Opened> {
    // Stamp before blob, so the stamp is never newer than the blob.
    const seenAt = (await this.metaOf(id))?.updatedAt ?? null;
    const w = migrateWorkspace(await lib.read(id));
    if (!w) throw new Error('unreadable-design');
    return { w: withResults(w, await lib.readResults(id)), seenAt };
  }

  private hold(o: Opened): Workspace {
    this.lastSeenAt = o.seenAt;
    return this.trackResults(o.w);
  }

  /** The newest `openActive`; an older read that finishes later is dropped. */
  private opening = 0;

  private adoptCreate(j: Journal): void {
    if (j.createId) this.createId = j.createId;
    if (j.name) this.pendingName = j.name;
  }

  private nextCreateId(): string {
    return (this.createId ??= freshId());
  }

  private trackResults(w: Workspace): Workspace {
    this.savedResults = new Map(w.sims.map((s) => [s.id, s.result ?? null]));
    return w;
  }

  private resultsChanged(w: Workspace): boolean {
    if (w.sims.length !== this.savedResults.size) return true;
    return w.sims.some((s) => this.savedResults.get(s.id) !== (s.result ?? null));
  }

  private async metaOf(id: string): Promise<DesignMeta | null> {
    return (await getDesignLibrary().list()).find((m) => m.id === id) ?? null;
  }

  private async nameOf(id: string): Promise<string | null> {
    return (await this.metaOf(id))?.name ?? null;
  }

  /** Serialized: two saves comparing one stamp would read each other as another tab's. */
  private writing: Promise<unknown> = Promise.resolve();

  async save(w: Workspace): Promise<void> {
    const lib = getDesignLibrary();
    const startedAt = ++this.mark;

    const gen = this.gen;
    const leanW = lean(w);
    if (!this.activeId && this.creating) await this.creating.catch(() => {});
    if (!this.activeId) {
      const p = lib.create(this.pendingName || nameFor(w), leanW, this.tab, this.nextCreateId());
      this.creating = p;
      let meta: DesignMeta;
      try {
        meta = await p;
      } finally {
        if (this.creating === p) this.creating = null;
      }
      if (gen !== this.gen) return; // the workspace moved on; that entry is the old one's
      this.pendingName = null;
      this.createId = null;
      this.activeId = meta.id;
      this.lastSeenAt = meta.updatedAt;
      this.journalHeld = false;
      dropSupersededJournal(this.tab, meta.id, startedAt);
      await this.saveResults(lib, meta.id, w);
      return;
    }
    // Captured now: a switch while queued clears them.
    const id = this.activeId;
    const claim = { seenAt: this.lastSeenAt, conflicted: this.conflicted };
    const run = this.writing.then(() => this.writeEntry(lib, id, w, leanW, gen, claim, startedAt));
    this.writing = run.catch(() => {});
    await run;
  }

  private async writeEntry(
    lib: DesignLibrary,
    id: string,
    w: Workspace,
    leanW: Workspace,
    gen: number,
    claim: { seenAt: number | null; conflicted: boolean },
    startedAt: number,
  ) {
    const mine = gen === this.gen;
    if (!mine && claim.conflicted) return;
    const carried = this.detached.get(id);
    const seenAt = mine
      ? this.lastSeenAt
      : carried != null && (claim.seenAt == null || carried > claim.seenAt)
        ? carried
        : claim.seenAt;
    const res = await lib.writeIfUnchanged(id, nameFor(w), leanW, seenAt, this.tab);
    if (gen !== this.gen) {
      if (res.updatedAt != null) this.detached.set(id, res.updatedAt);
      if (res.status === 'ok') await lib.writeResults(id, resultsOf(w)).catch(() => false);
      return;
    }
    if (res.updatedAt != null) this.lastSeenAt = res.updatedAt;
    if (res.status === 'conflict') {
      this.conflicted = true;
      throw new Error('conflict');
    }
    if (res.status === 'refused') throw new Error('storage-full');
    dropSupersededJournal(this.tab, id, startedAt);
    await this.saveResults(lib, id, w);
  }

  private async saveResults(lib: DesignLibrary, id: string, w: Workspace): Promise<void> {
    if (!this.resultsChanged(w)) return;
    if (await lib.writeResults(id, resultsOf(w))) this.trackResults(w);
  }

  async openActive(id: string, stale?: () => boolean): Promise<Workspace | null> {
    const lib = getDesignLibrary();
    // Switch only after the read, so a save meanwhile cannot overwrite the incoming entry unclaimed.
    const seq = ++this.opening;
    const gen = this.gen;
    const mine = journalFor(readJournals(), id);
    const opened = mine ? await this.replayEntry(lib, mine) : await this.readEntry(lib, id);
    if (seq !== this.opening || gen !== this.gen || stale?.()) return null;
    this.setActiveId(id);
    return this.hold(opened);
  }

  setActiveId(id: string | null): void {
    this.gen++; // void any create still in flight for the workspace being replaced
    this.activeId = id;
    this.pendingName = null;
    this.createId = null;
    this.savedResults = new Map();
    this.lastSeenAt = null;
    this.conflicted = false;
  }

  /** Call after `setActiveId(null)`, which clears it. */
  setPendingName(name: string | null): void {
    this.pendingName = name?.trim() || null;
  }

  saveSync(w: Workspace): void {
    if (this.conflicted) return;
    if (this.journalHeld) return;
    const detached = this.activeId === null;
    try {
      localStorage.setItem(
        journalKey(this.activeId ?? this.nextCreateId()),
        JSON.stringify({
          id: this.activeId,
          w: lean(w),
          base: this.lastSeenAt,
          tab: this.tab,
          t: Date.now(),
          mark: ++this.mark,
          ...(detached ? { createId: this.nextCreateId() } : {}),
          ...(detached && this.pendingName ? { name: this.pendingName } : {}),
        } satisfies Journal),
      );
    } catch {
      /* best-effort */
    }
  }
}

const store: WorkspaceStore = new LibraryWorkspaceStore();
export function getWorkspaceStore(): WorkspaceStore {
  return store;
}
