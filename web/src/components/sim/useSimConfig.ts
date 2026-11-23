import { configOf, useWorkspaceStore } from '../../state/store';

/** The design, a simulation and the flight configuration it flies; null for a simulation that is gone. */
export function useSimConfig(simId: string) {
  const tree = useWorkspaceStore((s) => s.tree);
  const sim = useWorkspaceStore((s) => s.sims.find((x) => x.id === simId));
  const configs = useWorkspaceStore((s) => s.configs);
  return { tree, sim, config: sim ? configOf(configs, sim) : null };
}
