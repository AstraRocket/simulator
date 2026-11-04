import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { launcherKind, withLauncher, type LauncherKind } from '../../services/design/launcher';

export function useLauncherKind(): LauncherKind | null {
  return useWorkspaceStore((s) => launcherKind(s.tree));
}

export function useLauncherT(kind: LauncherKind | null | 'design' = 'design') {
  const { t } = useTranslation();
  const onScreen = useLauncherKind();
  return withLauncher(
    t as unknown as (key: string, options?: Record<string, unknown>) => string,
    kind === 'design' ? onScreen : kind,
  );
}
