import { useMemo } from 'react';
import { useWorkspaceStore, selectActive, selectShownSim } from '../../state/store';
import { toResultFlight, type ResultFlight } from '../../services/flight/simulations';

export function useResultFlight() {
  const result = useWorkspaceStore((s) => selectActive(s).result);
  const shown = useWorkspaceStore(selectShownSim);

  // useMemo, not a selector: a zustand selector building a fresh object re-renders forever.
  const flight = useMemo<ResultFlight | null>(() => toResultFlight(shown), [shown]);

  const pathResult = flight?.result ?? result;

  return { flight, pathResult };
}
