import { buildRocketTree } from '../../engine/api';
import type { OpenRocketDesign, RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { configuredTree, liveMotors, seatedMotorsKey, stageFlies, type FlightConfig } from '../flight/flightConfigs';
import { findStages } from './treeEdit';
import { badDimensions, overturnedFins, type BadDimension, type NamedPart } from './requiredComponent';
import { hasUsableCurve } from '../motors/motorCurve';
import { errorReason, type Keyed } from '../../i18n/keyedError';

// Ignition/deployment overrides are left out on purpose: they move no static figure.
export function buildKey(tree: RocketTree, config: FlightConfig): string {
  const grounded = [...(config.grounded ?? [])].sort().join(',');
  return `${seatedMotorsKey(tree, config)}#${grounded}`;
}

export function buildConfiguredRocket(tree: RocketTree, config: FlightConfig): OpenRocketDesign {
  const r = buildRocketTree(configuredTree(tree, config));
  for (const [id, m] of liveMotors(tree, config)) {
    // Skipped rather than letting the engine throw "Too short thrust-curve".
    if (!hasUsableCurve(m.spec)) continue;
    r.setMotorById(id, m.spec);
    if (m.ignitionEvent || m.ignitionDelay)
      r.setMotorIgnitionById(id, m.ignitionEvent ?? 'automatic', m.ignitionDelay ?? 0);
  }
  // After the motors: a motor seated later would put a grounded stage's engine back.
  for (const stage of findStages(tree)) {
    const id = stage.id as string;
    if (!stageFlies(config, id)) r.setStageActiveById(id, false);
  }
  sources.set(r, tree.components);
  return r;
}

const sources = new WeakMap<OpenRocketDesign, RocketTree['components']>();

// A stored handle can describe an earlier design while a rebuild waits out its debounce.
export function builtFrom(rocket: OpenRocketDesign): RocketTree['components'] | undefined {
  return sources.get(rocket);
}

export type StaticInfoResult =
  { info: StaticInfo; rocket: OpenRocketDesign } | { error: string | Keyed; bad?: BadDimension[]; fins?: NamedPart[] };

export function computeStaticInfo(
  tree: RocketTree,
  config: FlightConfig,
  build: typeof buildConfiguredRocket = buildConfiguredRocket,
): StaticInfoResult {
  try {
    const rocket = build(tree, config);
    const info = rocket.staticInfo();
    try {
      info.cd = rocket.aeroSweep({ machMin: 0.3, machMax: 0.3, machStep: 0.05 }).powerOff.total[0];
    } catch {
      /* leave cd undefined */
    }
    return { info, rocket };
  } catch (e) {
    const bad = badDimensions(tree);
    const fins = overturnedFins(tree);
    return { error: errorReason(e), ...(bad.length ? { bad } : {}), ...(fins.length ? { fins } : {}) };
  }
}
