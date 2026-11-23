import type { RocketTree } from '../../../engine/openRocketEngine';
import { walkNodes } from '../../../tree/treeWalk';
import { readAppearance } from '../../design/appearance';
import { uniqueDecalPath, type PartDecal } from '../../design/decal';

const identity = (d: PartDecal): string => d.hash ?? `name:${d.name}`;

/**
 * Each image's path in the saved archive, by its key. Two different images uploaded under one file name get
 * desktop's `decals/logo (1).png`; a decal with no image keeps the path it was read with.
 */
export function decalPaths(tree: RocketTree): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const node of walkNodes(tree.components)) {
    for (const key of ['appearance', 'insideAppearance'] as const) {
      const d = readAppearance(node[key])?.decal;
      if (!d || out.has(identity(d))) continue;
      const path = uniqueDecalPath(d.name, taken);
      taken.add(path);
      out.set(identity(d), path);
    }
  }
  return out;
}

export const decalPathOf = (paths: ReadonlyMap<string, string>, d: PartDecal): string =>
  paths.get(identity(d)) ?? d.name;

/** The images a save packs, by archive path. */
export function decalFiles(paths: ReadonlyMap<string, string>): { hash: string; path: string }[] {
  return [...paths].filter(([id]) => !id.startsWith('name:')).map(([hash, path]) => ({ hash, path }));
}
