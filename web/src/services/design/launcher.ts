import type { RocketTree } from '../../engine/openRocketEngine';
import { walkNodes } from '../../tree/treeWalk';

/** Wording only: the kernel flies a rod and a rail alike (`LAUNCHROD`, `launchRodLength`). */
export type LauncherKind = 'rail' | 'rod';

export function launcherKind(tree: RocketTree): LauncherKind | null {
  let lug = false;
  let button = false;
  for (const n of walkNodes(tree.components)) {
    if (n.type === 'launchlug') lug = true;
    else if (n.type === 'railbutton') button = true;
  }
  return lug === button ? null : button ? 'rail' : 'rod';
}

/** A simulation's own choice, saved on its launch conditions, else what the design's lugs or buttons suggest. */
export function simLauncher(launch: { launcher?: LauncherKind } | undefined, tree: RocketTree): LauncherKind | null {
  return launch?.launcher ?? launcherKind(tree);
}

/** The kind every one of them flies from, for wording that covers them all; null, the neutral wording, when they differ. With none, the design's. */
export function sharedLauncher(
  launches: readonly ({ launcher?: LauncherKind } | undefined)[],
  tree: RocketTree,
): LauncherKind | null {
  if (!launches.length) return launcherKind(tree);
  const kinds = new Set(launches.map((l) => simLauncher(l, tree)));
  return kinds.size === 1 ? [...kinds][0]! : null;
}

export function withLauncher<T extends (key: string, options?: Record<string, unknown>) => string>(
  t: T,
  kind: LauncherKind | null,
): T {
  if (!kind) return t;
  return ((key: string, options?: Record<string, unknown>) => t(key, { context: kind, ...options })) as T;
}
