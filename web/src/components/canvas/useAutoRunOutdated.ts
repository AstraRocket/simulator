import { useEffect } from 'react';
import { useWorkspaceStore, selectRunFailed, selectOutdated, selectShownSim } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { useSettings } from '../../state/useSettings';
import { isResultView } from '../../state/tabs';

export function useAutoRunOutdated() {
  const { settings } = useSettings();
  const autoRun = settings.simulation.autoRunOutdated;
  const view = useWorkspaceStore((s) => s.view);
  // The center pane stays mounted behind other tabs with `view` still a result view.
  const onResults = useWorkspaceStore((s) => s.tab === 'results');
  const shownId = useWorkspaceStore((s) => selectShownSim(s).id);
  const result = useWorkspaceStore((s) => selectShownSim(s).result);
  const outdated = useWorkspaceStore((s) => selectOutdated(s, selectShownSim(s)));
  const runSims = useWorkspaceStore((s) => s.runSims);
  const busy = useWorkspaceStore((s) => s.simBusy);
  // A failed run leaves exactly the state auto-run fires on; without this it retries forever.
  const runFailed = useWorkspaceStore((s) => selectRunFailed(s, selectShownSim(s)));
  // A boolean, not `info`: applyBuild hands a fresh info identity that would re-fire the effect.
  const hasDesign = useWorkspaceStore((s) => !!s.info);
  const needsRun = !result || !!outdated;
  useEffect(() => {
    if (autoRun && onResults && isResultView(view) && needsRun && hasDesign && !busy && !runFailed) {
      fireAction(runSims([shownId]));
    }
  }, [onResults, view, needsRun, hasDesign, busy, runFailed, autoRun, runSims, shownId]);
}
