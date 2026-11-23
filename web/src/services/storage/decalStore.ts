// cspell:ignore cyrb -- the hash's name
import { IndexedDbKeyValueStore } from './idbKeyValueStore';
import type { KeyValueStore } from './keyValueStore';
import { nsKey } from './storageKeys';

// Decal images live here, keyed by their content, and a part's appearance names only the key: the design is
// built into the engine on every edit and written to localStorage on unload, so the bytes stay out of it.

const PREFIX = nsKey('decal:');

/** As desktop's `AppearanceFactory.MAX_DECAL_IMAGE_BYTES`. */
export const MAX_DECAL_BYTES = 32 * 1024 * 1024;

export interface DecalImage {
  bytes: Uint8Array;
  mime: string;
}

/** The image formats desktop's `ImageIO` and a browser both read, by their signatures. */
export function sniffImageType(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x42, 0x4d)) return 'image/bmp';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

// cyrb53, two seeds: 106 bits with the length, synchronous so an import can name its images as it reads them.
function cyrb53(b: Uint8Array, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i]!, 2654435761);
    h2 = Math.imul(h2 ^ b[i]!, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const decalHash = (bytes: Uint8Array): string =>
  `${cyrb53(bytes, 1)}${cyrb53(bytes, 2)}${bytes.length.toString(36)}`;

const toBase64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

const fromBase64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const memory = new Map<string, DecalImage>();
const listeners = new Set<(hash: string) => void>();

let kv: KeyValueStore = new IndexedDbKeyValueStore();

export function __setDecalStoreForTests(store: KeyValueStore): void {
  kv = store;
  memory.clear();
}

/** Told when an image becomes available, so a view waiting on it can draw it. */
export function onDecalImage(cb: (hash: string) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Kept at once for this tab; written through to storage, which resolves false when it was refused. */
export function putDecalImage(bytes: Uint8Array, mime: string): { hash: string; saved: Promise<boolean> } {
  const hash = decalHash(bytes);
  const known = memory.has(hash);
  memory.set(hash, { bytes, mime });
  if (!known) for (const cb of listeners) cb(hash);
  const saved = kv.set(PREFIX + hash, `${mime};${toBase64(bytes)}`).catch(() => false);
  return { hash, saved };
}

/** An image as a backup file carries it. */
export interface PortableDecal {
  hash: string;
  mime: string;
  data: string;
}

/** The images this browser holds of `hashes`, for a backup; ones it no longer holds are left out. */
export async function portableDecals(hashes: Iterable<string>): Promise<PortableDecal[]> {
  const out: PortableDecal[] = [];
  for (const hash of new Set(hashes)) {
    const image = await getDecalImage(hash);
    if (image) out.push({ hash, mime: image.mime, data: toBase64(image.bytes) });
  }
  return out;
}

/** Stores a backup's images; each is keyed by its own bytes, so a mislabeled entry cannot take another's key. */
export async function takePortableDecals(raw: readonly unknown[]): Promise<void> {
  for (const v of raw) {
    const data = (v as Partial<PortableDecal> | null)?.data;
    if (typeof data !== 'string') continue;
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(data);
    } catch {
      continue;
    }
    const mime = bytes.length <= MAX_DECAL_BYTES ? sniffImageType(bytes) : null;
    if (mime) await putDecalImage(bytes, mime).saved;
  }
}

/** Null when this browser never held it: a design from another browser, or storage cleared since. */
export async function getDecalImage(hash: string): Promise<DecalImage | null> {
  const hit = memory.get(hash);
  if (hit) return hit;
  const raw = await kv.get(PREFIX + hash);
  const sep = raw?.indexOf(';') ?? -1;
  if (!raw || sep < 0) return null;
  try {
    const image = { mime: raw.slice(0, sep), bytes: fromBase64(raw.slice(sep + 1)) };
    memory.set(hash, image);
    return image;
  } catch {
    return null;
  }
}
