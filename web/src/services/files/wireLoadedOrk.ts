import type { RocketTree } from '../../engine/openRocketEngine';
import { resolveFilePositions } from '../../tree/position';
import { configLabel, newFlightConfig, reconcileConfig, type FlightConfig } from '../flight/flightConfigs';
import { newSimulation, nextFreeName, resultKey, type Simulation, type SimPrefs } from '../flight/simulations';
import type { LoadedOrk } from './loadOrk';
import { overLaunchDefaults, type LaunchConditions } from '../design/orkTree';
import type { OrkExportMotor } from './orkFile';
import type { ImportNote } from './importNote';
import type { DesignFormat } from './designFile';

export interface LoadedMeta {
  name: string;
  notes: ImportNote[];
  exportMotors: Record<string, OrkExportMotor>;
  format?: DesignFormat;
}

export interface WiredOrk {
  tree: RocketTree;
  configs: FlightConfig[];
  sims: Simulation[];
  activeId: string;
  loadedMeta: LoadedMeta;
}

// Configurations keep the file's ids so a save round-trips `configid`.
export function wireLoadedOrk(res: LoadedOrk, launchDefaults: LaunchConditions, simPrefs?: SimPrefs): WiredOrk {
  // method="after" is relative to the previous sibling, which single-part readers never see.
  const tree = resolveFilePositions(res.tree);
  const launch = overLaunchDefaults(launchDefaults, res.launch);

  const configs = res.configs.map((c) => {
    const config = newFlightConfig(c.motors, c.name, c.id);
    // Import already filled empty mounts with placeholders, so no default C6 is seeded.
    const reconciled = reconcileConfig(tree, config);
    return {
      ...reconciled,
      ...(c.deployments ? { deployments: c.deployments } : {}),
      ...(c.separations ? { separations: c.separations } : {}),
      ...(c.grounded?.length ? { grounded: c.grounded } : {}),
    };
  });

  const sims = res.simulations?.length
    ? res.simulations.map((fs) => {
        const config = configs.find((c) => c.id === fs.configId) ?? configs[0]!;
        // Desktop keeps run settings per simulation, and its summary was flown with them.
        const own = fs.prefs ? ownPrefs(fs.prefs, simPrefs) : undefined;
        const sim = {
          ...newSimulation(fs.name, config.id, overLaunchDefaults(launchDefaults, fs.launch)),
          ...(fs.xmlExtra ? { xmlExtra: fs.xmlExtra } : {}),
          ...(own ? { prefs: own } : {}),
        };
        if (!fs.summary) return sim;
        const key = fs.outdated || !simPrefs ? null : resultKey(tree, config, sim, simPrefs);
        return { ...sim, fileSummary: { summary: fs.summary, key } };
      })
    : (() => {
        const taken = new Set<string>();
        return configs.map((c) => newSimulation(simName(tree, c, res.name, taken), c.id, launch));
      })();

  return {
    tree,
    configs,
    sims,
    activeId: sims.find((s) => s.configId === res.chosenConfigId)?.id ?? sims[0]!.id,
    loadedMeta: {
      name: res.name,
      notes: res.notes,
      exportMotors: res.motors,
      ...(res.format ? { format: res.format } : {}),
    },
  };
}

function ownPrefs(file: Partial<SimPrefs>, globals: SimPrefs | undefined): Partial<SimPrefs> | undefined {
  const own = Object.fromEntries(
    Object.entries(file).filter(([k, v]) => !globals || globals[k as keyof SimPrefs] !== v),
  ) as Partial<SimPrefs>;
  return Object.keys(own).length ? own : undefined;
}

function simName(tree: RocketTree, config: FlightConfig, fallback: string, taken: Set<string>): string {
  const name = nextFreeName(configLabel(tree, config) || fallback, taken);
  taken.add(name);
  return name;
}
