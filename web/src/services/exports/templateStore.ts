import type { KeyValueStore } from '../storage/keyValueStore';
import { IndexedDbKeyValueStore } from '../storage/idbKeyValueStore';
import { JsonListStore } from '../storage/jsonListStore';
import { nsKey } from '../storage/storageKeys';

export interface UserTemplate {
  id: string;
  name: string;
  /** Without a dot. */
  ext: string;
  source: string;
}

const SUFFIX = '.mustache';

/** Desktop convention `<name>.<ext>.mustache`; a bare `<name>.mustache` is "txt". */
export function parseTemplateFilename(filename: string): { id: string; name: string; ext: string } {
  const id = filename;
  const base = filename.toLowerCase().endsWith(SUFFIX) ? filename.slice(0, -SUFFIX.length) : filename;
  const dot = base.lastIndexOf('.');
  if (dot > 0 && dot < base.length - 1) {
    return { id, name: base.slice(0, dot), ext: base.slice(dot + 1).toLowerCase() };
  }
  return { id, name: base, ext: 'txt' };
}

export interface TemplateStore {
  list(): Promise<UserTemplate[]>;
  add(template: UserTemplate): Promise<void>;
  remove(id: string): Promise<void>;
}

const CUSTOM_KEY = nsKey('templates:custom');

export function isUserTemplate(v: unknown): v is UserTemplate {
  const t = v as UserTemplate;
  return (
    !!t &&
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    typeof t.ext === 'string' &&
    typeof t.source === 'string'
  );
}

export class KeyValueTemplateStore implements TemplateStore {
  private readonly items: JsonListStore<UserTemplate>;

  constructor(key: string = CUSTOM_KEY, kv: KeyValueStore = new IndexedDbKeyValueStore()) {
    this.items = new JsonListStore(key, isUserTemplate, (t) => t.id, kv);
  }

  list(): Promise<UserTemplate[]> {
    return this.items.list();
  }

  add(template: UserTemplate): Promise<void> {
    return this.items.upsert([template]);
  }

  remove(id: string): Promise<void> {
    return this.items.remove(id);
  }
}

let store: TemplateStore = new KeyValueTemplateStore();

export function getTemplateStore(): TemplateStore {
  return store;
}

export function setTemplateStore(next: TemplateStore): void {
  store = next;
}
