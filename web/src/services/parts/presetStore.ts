import type { ComponentNode } from '../../engine/openRocketEngine';
import type { KeyValueStore } from '../storage/keyValueStore';
import { IndexedDbKeyValueStore } from '../storage/idbKeyValueStore';
import { JsonListStore } from '../storage/jsonListStore';
import { nsKey } from '../storage/storageKeys';

export interface CustomPart {
  id: string;
  /** The catalog type, not always the node's own: an inner tube saves as a body tube. */
  type: string;
  mfr: string;
  partNo: string;
  desc: string;
  node: Partial<ComponentNode>;
}

export interface PresetStore {
  list(): Promise<CustomPart[]>;
  add(part: CustomPart): Promise<void>;
  remove(id: string): Promise<void>;
}

const CUSTOM_KEY = nsKey('parts:custom');

/** `node` contents are checked in customParts.customPartToRow. */
export function isCustomPart(v: unknown): v is CustomPart {
  const p = v as CustomPart;
  return (
    !!p &&
    typeof p.id === 'string' &&
    typeof p.type === 'string' &&
    typeof p.mfr === 'string' &&
    typeof p.partNo === 'string' &&
    typeof p.desc === 'string' &&
    !!p.node &&
    typeof p.node === 'object' &&
    !Array.isArray(p.node)
  );
}

export class KeyValuePresetStore implements PresetStore {
  private readonly items: JsonListStore<CustomPart>;

  constructor(key: string = CUSTOM_KEY, kv: KeyValueStore = new IndexedDbKeyValueStore()) {
    this.items = new JsonListStore(key, isCustomPart, (p) => p.id, kv);
  }

  list(): Promise<CustomPart[]> {
    return this.items.list();
  }

  add(part: CustomPart): Promise<void> {
    return this.items.upsert([part]);
  }

  remove(id: string): Promise<void> {
    return this.items.remove(id);
  }
}

let store: PresetStore = new KeyValuePresetStore();

export function getPresetStore(): PresetStore {
  return store;
}

export function setPresetStore(next: PresetStore): void {
  store = next;
}
