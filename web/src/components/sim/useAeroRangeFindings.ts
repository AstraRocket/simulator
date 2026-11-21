import { useMemo } from 'react';
import { useWorkspaceStore, selectOutdated } from '../../state/store';
import type { Simulation } from '../../services/flight/simulations';
import { aeroRangeFindings, aeroTablesOf, type AeroRangeFinding } from '../../services/flight/aeroTables';
import { forwardFlightEnd } from '../../services/flight/flightEvents';
import { radToDeg } from '../../prefs/units';

const NONE: AeroRangeFinding[] = [];

export function useAeroRangeFindings(sim: Simulation | null | undefined): AeroRangeFinding[] {
  const outdated = useWorkspaceStore((s) => (sim ? selectOutdated(s, sim) : true));
  return useMemo(() => {
    const result = sim?.result;
    if (!result || outdated) return NONE;
    const tables = aeroTablesOf(sim.xmlExtra);
    if (!tables.dragLookup && !tables.stabilityLookup) return NONE;
    // Up to the end of forward flight: under recovery the AoA reads near 90 degrees and no table is flown.
    const end = forwardFlightEnd({ events: result.events ?? [], summary: result.summary });
    const { time, aoa } = result.series;
    let maxAoa: number | null = null;
    for (const [i, a] of aoa.entries()) {
      if ((time[i] ?? Infinity) > end) break;
      if (Number.isFinite(a)) maxAoa = Math.max(maxAoa ?? 0, Math.abs(a));
    }
    const found = aeroRangeFindings(tables, {
      maxMach: result.summary.maxMachNumber,
      maxAoaDeg: maxAoa == null ? null : radToDeg(maxAoa),
    });
    return found.length ? found : NONE;
  }, [sim, outdated]);
}
