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

export function withLauncher<T extends (key: string, options?: Record<string, unknown>) => string>(
  t: T,
  kind: LauncherKind | null,
): T {
  if (!kind) return t;
  return ((key: string, options?: Record<string, unknown>) => t(key, { context: kind, ...options })) as T;
}
