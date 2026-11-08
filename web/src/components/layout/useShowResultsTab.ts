import { useWorkspaceStore } from '../../state/store';

export function useShowResultsTab(): boolean {
  const tab = useWorkspaceStore((s) => s.tab);
  const hasResult = useWorkspaceStore((s) => s.sims.some((x) => !!x.result));
  return hasResult || tab === 'results';
}
