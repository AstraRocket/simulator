import type { KeyValueStore } from './keyValueStore';
import { KeyedError } from '../../i18n/keyedError';

export function parseJsonList<T>(raw: string | null, isItem: (v: unknown) => v is T): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

export class JsonListStore<T> {
  constructor(
    private readonly key: string,
    private readonly isItem: (v: unknown) => v is T,
    private readonly idOf: (item: T) => string,
    private readonly kv: KeyValueStore,
    private readonly normalize: (item: T) => T = (item) => item,
  ) {}

  private parse(raw: string | null): T[] {
    return parseJsonList(raw, this.isItem).map(this.normalize);
  }

  // Rows isItem refuses are kept: a newer build sharing the storage may have stored them.
  private async mutate(fn: (list: T[]) => T[]): Promise<void> {
    const ok = await this.kv.update(this.key, (raw) => {
      const next = fn(this.parse(raw));
      const ids = new Set(next.map(this.idOf));
      const others = this.foreignRows(raw).filter((row) => {
        const id = this.foreignId(row);
        return id === undefined || !ids.has(id);
      });
      return JSON.stringify([...next, ...others]);
    });
    // Keyed, so every dialog that shows it through `errorText` gets the user's language.
    if (!ok) throw new KeyedError('storage.writeRefused');
  }

  private foreignRows(raw: string | null): unknown[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((row) => !this.isItem(row)) : [];
    } catch {
      return [];
    }
  }

  private foreignId(row: unknown): string | undefined {
    try {
      const id = row && typeof row === 'object' ? this.idOf(row as T) : undefined;
      return typeof id === 'string' ? id : undefined;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<T[]> {
    try {
      return this.parse(await this.kv.get(this.key));
    } catch {
      return [];
    }
  }

  /** The caller dedupes `items`. */
  async upsert(items: readonly T[]): Promise<void> {
    const incoming = new Set(items.map(this.idOf));
    await this.mutate((list) => [...items, ...list.filter((item) => !incoming.has(this.idOf(item)))]);
  }

  async remove(id: string): Promise<void> {
    await this.mutate((list) => list.filter((item) => this.idOf(item) !== id));
  }
}
