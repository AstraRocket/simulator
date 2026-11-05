import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectActive, configOf } from '../../state/store';
import { configLabel } from '../../services/flight/flightConfigs';
import { isOutdated, simStatus } from '../../services/flight/simulations';
import { designBlocker } from '../../services/flight/runnability';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import type { StaticInfo } from '../../engine/api';
import { flightReadout, stabilityReadout } from './simSummaryReadouts';

export function useSimSummary(info: StaticInfo) {
  const { t } = useTranslation();
  const u = useUnits();
  const tree = useWorkspaceStore((s) => s.tree);
  const configs = useWorkspaceStore((s) => s.configs);
  const simPrefs = useWorkspaceStore((s) => s.simPrefs);
  const runs = useWorkspaceStore((s) => s.simRuns);
  const busy = useWorkspaceStore((s) => s.simBusy);
  const sim = useWorkspaceStore(selectActive);
  const runSims = useWorkspaceStore((s) => s.runSims);
  const cancelRun = useWorkspaceStore((s) => s.cancelRun);
  const setResultSimId = useWorkspaceStore((s) => s.setResultSimId);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const setSimConfig = useWorkspaceStore((s) => s.setSimConfig);

  const config = configOf(configs, sim);
  const outdated = isOutdated(sim, tree, config, simPrefs);
  const status = simStatus(sim, runs, tree, outdated);
  const blocked = useMemo(() => !!designBlocker(tree), [tree]);
  const massUnit = u.at(unitScope('stats', 'mass'), 'mass');
  const apogee = u.at(unitScope('sim', 'apogee'), 'distance');

  const summary = sim.result?.summary ?? sim.fileSummary?.summary;
  const flight = flightReadout({
    status,
    outdated,
    value: summary ? `${apogee.fmt(summary.maxAltitude)} ${apogee.sym}` : null,
    onOpen: sim.result
      ? () => {
          setResultSimId(sim.id);
          setTab('results');
        }
      : null,
    t,
  });

  return {
    sim,
    busy,
    blocked,
    stability: stabilityReadout(info.stabilityCalibers, t),
    mass: `${massUnit.fmt(info.mass)} ${massUnit.sym}`,
    config,
    configs,
    configName: (c: typeof config) => configLabel(tree, c) || t('configs.noMotors'),
    setConfig: (configId: string) => setSimConfig(sim.id, configId),
    flight,
    runLabel: busy ? t('summary.stop') : t('summary.run'),
    runTitle: busy ? t('sim.cancel') : t('summary.runTitle', { name: sim.name }),
    onRun: () => (busy ? cancelRun() : runSims([sim.id])),
  };
}
