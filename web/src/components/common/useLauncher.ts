import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { launcherKind, withLauncher, type LauncherKind } from '../../services/design/launcher';

/** What the design on screen is launched from; see services/design/launcher. */
export function useLauncherKind(): LauncherKind | null {
  return useWorkspaceStore((s) => launcherKind(s.tree));
}

/**
 * `t`, naming the launcher the way the design on screen does, or as `kind`
 * says when the caller knows better (a tree of its own, or null for the
 * neutral word in the Settings copy).
 */
export function useLauncherT(kind: LauncherKind | null | 'design' = 'design') {
  const { t } = useTranslation();
  const onScreen = useLauncherKind();
  return withLauncher(
    t as unknown as (key: string, options?: Record<string, unknown>) => string,
    kind === 'design' ? onScreen : kind,
  );
}
