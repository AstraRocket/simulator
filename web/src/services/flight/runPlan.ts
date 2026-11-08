import type { RocketTree } from '../../engine/openRocketEngine';
import type { UnitSymbols } from '../../prefs/units';
import { configFor, primaryMotor, type FlightConfig } from './flightConfigs';
import { configPowerClass } from './powerClass';
import { isComplete, type CompleteLaunch } from './requiredLaunch';
import { designBlocker, unflyable, unflyableText, type DesignBlocker, type Unflyable } from './runnability';
import type { Simulation } from './simulations';

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export interface RunPlan {
  blocker: DesignBlocker | null;
  flying: { sim: Simulation; launch: CompleteLaunch }[];
  skipped: Unflyable[];
  failedIds: string[];
}

// `dryMassKg` is `StaticInfo.massEmpty`, or null before the engine has one.
export function planRun(
  ids: readonly string[],
  sims: readonly Simulation[],
  tree: RocketTree,
  configs: readonly FlightConfig[],
  dryMassKg: number | null | undefined,
): RunPlan {
  const rows = ids.flatMap((id) => sims.filter((x) => x.id === id).slice(0, 1));
  const blocker = designBlocker(tree);
  if (blocker) return { blocker, flying: [], skipped: [], failedIds: rows.map((x) => x.id) };

  const flying: RunPlan['flying'] = [];
  const skipped: Unflyable[] = [];
  for (const sim of rows) {
    const config = configFor(configs, sim.configId);
    const reason = unflyable(sim, primaryMotor(tree, config), configPowerClass(tree, config, dryMassKg));
    if (reason) {
      skipped.push({ id: sim.id, name: sim.name, reason });
      continue;
    }
    // `unflyable` already checked this; restated so the type system sees a CompleteLaunch.
    if (!isComplete(sim.launch)) continue;
    flying.push({ sim, launch: sim.launch });
  }
  return { blocker: null, flying, skipped, failedIds: skipped.map((u) => u.id) };
}

export function runProblems(
  skipped: readonly Unflyable[],
  failed: readonly { name: string; msg: string }[],
  t: Translate,
  units: UnitSymbols,
): string[] {
  return [
    ...skipped.map((u) => unflyableText(u, t, units)),
    ...failed.map((f) => t('sim.failedNamed', { name: f.name, message: f.msg })),
  ];
}

export function landingView(
  landedIds: readonly string[],
  activeId: string,
): { lastRunIds: string[]; resultSimId: string } | null {
  if (!landedIds.length) return null;
  return { lastRunIds: [...landedIds], resultSimId: landedIds.includes(activeId) ? activeId : landedIds[0]! };
}
