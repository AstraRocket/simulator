import { beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../../src/services/storage/keyValueStore';
import {
  __setDecalStoreForTests,
  decalHash,
  getDecalImage,
  portableDecals,
  putDecalImage,
  sniffImageType,
  takePortableDecals,
} from '../../../src/services/storage/decalStore';

class MapStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  get = (k: string) => Promise.resolve(this.map.get(k) ?? null);
  set = (k: string, v: string) => {
    this.map.set(k, v);
    return Promise.resolve(true);
  };
  remove = (k: string) => {
    this.map.delete(k);
    return Promise.resolve();
  };
  update = () => Promise.resolve(false);
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

let kv: MapStore;
beforeEach(() => {
  kv = new MapStore();
  __setDecalStoreForTests(kv);
});

describe('the decal store', () => {
  it('knows the image formats by their first bytes, and nothing else', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('<svg/>'))).toBeNull();
  });

  it('keys an image by its bytes alone', () => {
    expect(decalHash(PNG)).toBe(decalHash(PNG.slice()));
    expect(decalHash(PNG)).not.toBe(decalHash(JPEG));
    const changed = PNG.slice();
    changed[12] = 6;
    expect(decalHash(changed)).not.toBe(decalHash(PNG));
  });

  it('serves an image at once, and from storage in a later session', async () => {
    const { hash, saved } = putDecalImage(PNG, 'image/png');
    expect((await getDecalImage(hash))?.bytes).toEqual(PNG);
    expect(await saved).toBe(true);
    __setDecalStoreForTests(kv); // a new session: the same storage, nothing in memory
    expect(await getDecalImage(hash)).toEqual({ bytes: PNG, mime: 'image/png' });
  });

  it('answers null for an image this browser never held', async () => {
    expect(await getDecalImage('nope')).toBeNull();
  });

  it('carries its images through a backup into another browser', async () => {
    const { hash } = putDecalImage(PNG, 'image/png');
    const carried = JSON.parse(JSON.stringify(await portableDecals([hash, hash, 'gone']))) as unknown[];
    expect(carried).toHaveLength(1);
    __setDecalStoreForTests(new MapStore());
    await takePortableDecals(carried);
    expect((await getDecalImage(hash))?.bytes).toEqual(PNG);
  });

  it('keys a backup entry by its own bytes, whatever key it claims, and skips what is no image', async () => {
    await takePortableDecals([{ hash: 'forged', mime: 'image/png', data: btoa('not an image') }, null, { data: 7 }]);
    expect(await getDecalImage('forged')).toBeNull();
    expect(kv.map.size).toBe(0);
  });
});
