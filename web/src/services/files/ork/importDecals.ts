import type { ComponentNode } from '../../../engine/openRocketEngine';
import { walkNodes } from '../../../tree/treeWalk';
import { readAppearance } from '../../design/appearance';
import { decalHash, MAX_DECAL_BYTES, sniffImageType } from '../../storage/decalStore';
import type { ArchiveDecal } from '../orkTypes';

export interface LinkedDecals {
  images: ArchiveDecal[];
  /** Decal paths the archive holds no readable image for. */
  missing: string[];
  /** Archive members a decal named. */
  used: Set<string>;
}

/**
 * Gives each decal the key of the archive image it names, as desktop's `ZipFileAttachmentFactory` finds it. A decal
 * with no image keeps its name, so a save writes the reference back as it came.
 */
export function linkDecals(components: readonly ComponentNode[], files: ReadonlyMap<string, Uint8Array>): LinkedDecals {
  const images = new Map<string, ArchiveDecal>();
  const byName = new Map<string, string | null>();
  const missing = new Set<string>();
  const used = new Set<string>();
  const hashOf = (name: string): string | null => {
    const known = byName.get(name);
    if (known !== undefined) return known;
    const bytes = files.get(name);
    const mime = bytes && bytes.length <= MAX_DECAL_BYTES ? sniffImageType(bytes) : null;
    let hash: string | null = null;
    if (bytes && mime) {
      hash = decalHash(bytes);
      images.set(hash, { hash, bytes, mime });
      used.add(name);
    } else missing.add(name);
    byName.set(name, hash);
    return hash;
  };
  for (const node of walkNodes(components)) {
    for (const key of ['appearance', 'insideAppearance'] as const) {
      const decal = readAppearance(node[key])?.decal;
      if (!decal) continue;
      const hash = hashOf(decal.name);
      if (hash) (node[key] as { decal: { hash?: string } }).decal.hash = hash;
    }
  }
  return { images: [...images.values()], missing: [...missing], used };
}
