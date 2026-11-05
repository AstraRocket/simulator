import type { ReportSource } from '../services/report/reportModel';
import { selectOutdated } from './simSlice';
import { configOf, selectConfig } from './workspaceSelectors';
import type { WorkspaceState } from './store';

export const reportSource = (s: WorkspaceState): ReportSource => ({
  tree: s.tree,
  info: s.info,
  rocket: s.rocket,
  loadedMeta: s.loadedMeta,
  sims: s.sims,
  flownConfig: () => selectConfig(s),
  configOf: (sim) => configOf(s.configs, sim),
  isOutdated: (sim) => selectOutdated(s, sim),
  applyBuild: s.applyBuild,
  setErr: s.setErr,
});
