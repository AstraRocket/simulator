import { isMaterialFields, type Material, type MaterialType } from './materialTypes';
import type { KeyValueStore } from '../storage/keyValueStore';
import { IndexedDbKeyValueStore } from '../storage/idbKeyValueStore';
import { JsonListStore } from '../storage/jsonListStore';
import { nsKey } from '../storage/storageKeys';

export interface MaterialStore {
  list(): Promise<Material[]>;
  // Replaces an existing entry with the same name+type.
  add(material: Material): Promise<void>;
  remove(name: string, type: MaterialType): Promise<void>;
}

const CUSTOM_KEY = nsKey('materials:custom');

export function isMaterial(v: unknown): v is Material {
  return isMaterialFields(v);
}

export const materialId = (name: string, type: MaterialType): string => JSON.stringify([type, name]);

export class KeyValueMaterialStore implements MaterialStore {
  private readonly items: JsonListStore<Material>;

  constructor(key: string = CUSTOM_KEY, kv: KeyValueStore = new IndexedDbKeyValueStore()) {
    this.items = new JsonListStore(
      key,
      isMaterial,
      (m) => materialId(m.name, m.type),
      kv,
      (m) => ({
        ...m,
        custom: true,
      }),
    );
  }

  list(): Promise<Material[]> {
    return this.items.list();
  }

  add(material: Material): Promise<void> {
    return this.items.upsert([{ ...material, custom: true }]);
  }

  remove(name: string, type: MaterialType): Promise<void> {
    return this.items.remove(materialId(name, type));
  }
}

let store: MaterialStore = new KeyValueMaterialStore();

export function getMaterialStore(): MaterialStore {
  return store;
}

export function setMaterialStore(next: MaterialStore): void {
  store = next;
}
