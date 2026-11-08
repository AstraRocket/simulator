import { useMemo } from 'react';
import { useWorkspaceStore, selectOutdated } from '../../state/store';
import type { Simulation } from '../../services/flight/simulations';
import { flutterFindings, type FlutterFinding } from '../../services/flight/finFlutter';
import { finStockChoice, useFinStockChoices } from '../../state/finFlutterChoices';

const NONE: FlutterFinding[] = [];

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
