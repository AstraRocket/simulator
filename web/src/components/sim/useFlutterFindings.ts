import { useMemo } from 'react';
import { useWorkspaceStore, selectOutdated } from '../../state/store';
import type { Simulation } from '../../services/flight/simulations';
import { flutterFindings, type FlutterFinding } from '../../services/flight/finFlutter';
import { finStockChoice, useFinStockChoices } from '../../state/finFlutterChoices';

const NONE: FlutterFinding[] = [];

/**
 * The fin sets `sim`'s last run comes too close to fluttering, worst first: the
 * app's own warning beside the kernel's, which has none for flutter.
 *
 * Only for a run that is up to date, since an outdated one flew a design that
 * has since moved and its fins may no longer be these. Each fin set is checked
 * with the stock its Fin flutter dialog uses (`finStockChoice`); one with no
 * figure for its material and none typed is not checked, rather than guessed.
 */
export function useFlutterFindings(sim: Simulation | null | undefined): FlutterFinding[] {
  const tree = useWorkspaceStore((s) => s.tree);
  const outdated = useWorkspaceStore((s) => (sim ? selectOutdated(s, sim) : true));
  const choices = useFinStockChoices();
  return useMemo(() => {
    if (!sim?.result || outdated) return NONE;
    return flutterFindings(
      tree,
      sim.result.series,
      sim.launch.launchAltitudeM ?? 0,
      (n) => finStockChoice(n, choices).shearPa,
    );
  }, [sim, tree, outdated, choices]);
}
