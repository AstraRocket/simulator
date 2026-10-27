import { useMemo } from 'react';
import { useWorkspaceStore } from '../../state/store';
import { PERF_FIELDS, twrField, type PerfDef } from '../../services/motors/motorPerf';
import { liftoffFor } from '../../services/flight/liftoff';

/** The mount a motor list is choosing for, under one configuration. */
export interface LiftoffAt {
  configId: string;
  mountId: string;
}

/**
 * The performance filter fields for a list choosing a motor for `at`: the
 * standard set plus thrust-to-weight, which needs the rocket it would lift.
 * Undefined (the standard set) with no mount to choose for, or before the
 * design has been built and its dry mass is known.
 */
export function useLiftoffFields(at: LiftoffAt | null | undefined): readonly PerfDef[] | undefined {
  const tree = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore((s) => (at ? s.configs.find((c) => c.id === at.configId) : undefined));
  const dryKg = useWorkspaceStore((s) => s.info?.massEmpty);
  const mountId = at?.mountId;
  return useMemo(() => {
    if (!config || !mountId || dryKg == null || !Number.isFinite(dryKg)) return undefined;
    return [...PERF_FIELDS, twrField(liftoffFor(tree, config, mountId, dryKg))];
  }, [tree, config, mountId, dryKg]);
}
