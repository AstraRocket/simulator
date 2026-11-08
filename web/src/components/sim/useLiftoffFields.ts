import { useMemo } from 'react';
import { useWorkspaceStore } from '../../state/store';
import { PERF_FIELDS, twrField, type PerfDef } from '../../services/motors/motorPerf';
import { liftoffFor } from '../../services/flight/liftoff';

export interface LiftoffAt {
  configId: string;
  mountId: string;
}

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
