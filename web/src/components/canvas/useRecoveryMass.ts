import { useMemo } from 'react';
import { useWorkspaceStore, selectActive, selectConfig, selectOutdated } from '../../state/store';
import { descentMass } from '../../services/flight/recoverySizing';
import { sustainerDescentMass } from '../../services/flight/recoveryFlown';
import { motorSpecs } from '../../services/flight/flightConfigs';

export function useRecoveryMass() {
  const tree = useWorkspaceStore((s) => s.tree);
  const info = useWorkspaceStore((s) => s.info);
  const result = useWorkspaceStore((s) => selectActive(s).result);
  const outdated = useWorkspaceStore((s) => selectOutdated(s));
  const config = useWorkspaceStore(selectConfig);
  const recovery = useMemo(() => {
    const measured = sustainerDescentMass(outdated ? null : result);
    if (measured != null) return { mass: measured, estimated: false };
    const est = descentMass(info?.mass, motorSpecs(tree, config));
    return est == null ? null : { mass: est, estimated: true };
  }, [info?.mass, tree, config, result, outdated]);
  return { recoveryWeight: recovery?.mass, recoveryEstimated: recovery?.estimated ?? true };
}
