import { useTranslation } from 'react-i18next';
import { selectActive, selectShownSim, useWorkspaceStore } from '../../state/store';
import { launcherKind, simLauncher, withLauncher, type LauncherKind } from '../../services/design/launcher';

/**
 * Whose launcher the wording follows: the design's lugs or buttons, or a simulation's own choice (the one whose
 * results are shown, the one being edited, or one by id), which falls back to the design's.
 */
export type LauncherSource = 'design' | 'shown' | 'active' | { simId: string };

export function useLauncherKind(source: LauncherSource = 'design'): LauncherKind | null {
  return useWorkspaceStore((s) => {
    if (source === 'design') return launcherKind(s.tree);
    const sim =
      source === 'shown'
        ? selectShownSim(s)
        : source === 'active'
          ? selectActive(s)
          : s.sims.find((x) => x.id === source.simId);
    return simLauncher(sim?.launch, s.tree);
  });
}

export function useLauncherT(kind: LauncherKind | null | LauncherSource = 'design') {
  const { t } = useTranslation();
  const given = kind === null || kind === 'rod' || kind === 'rail';
  const found = useLauncherKind(given ? 'design' : kind);
  return withLauncher(t as unknown as (key: string, options?: Record<string, unknown>) => string, given ? kind : found);
}
