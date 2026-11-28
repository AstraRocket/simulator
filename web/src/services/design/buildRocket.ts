import { buildRocketTree } from '../../engine/api';
import type { OpenRocketDesign, RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { configuredTree, liveMotors, seatedMotorsKey, stageFlies, type FlightConfig } from '../flight/flightConfigs';
import { findStages } from './treeEdit';
import { badDimensions, overturnedFins, type BadDimension, type NamedPart } from './requiredComponent';
import { hasUsableCurve } from '../motors/motorCurve';
import { errorReason, type Keyed } from '../../i18n/keyedError';
import { BASE_DRAG_HACK_ENGINE_NAME, engineTree, withBaseDragHack, type BuildPurpose } from './engineTree';
import { walkNodes } from '../../tree/treeWalk';

// Ignition/deployment overrides are left out on purpose: they move no static figure.
export function buildKey(tree: RocketTree, config: FlightConfig): string {
  const grounded = [...(config.grounded ?? [])].sort().join(',');
  return `${seatedMotorsKey(tree, config)}#${grounded}${tree.baseDragHack === true ? '#hack' : ''}`;
}

/** `flight` for anything that flies: the base drag hack cone is for static readouts only. */
export function buildConfiguredRocket(
  tree: RocketTree,
  config: FlightConfig,
  purpose: BuildPurpose = 'static',
): OpenRocketDesign {
  const flown = engineTree(configuredTree(tree, config), 'flight');
  const sent = purpose === 'static' ? withBaseDragHack(flown, BASE_DRAG_HACK_ENGINE_NAME) : flown;
  // First, and read at once: the next build resets the engine and voids this handle.
  const drawn = sent !== flown ? assemble(tree, config, flown).staticInfo() : null;
  const r = assemble(tree, config, sent);
  if (drawn) hideHackCone(r, drawn);
  sources.set(r, tree.components);
  return r;
}

function assemble(tree: RocketTree, config: FlightConfig, sent: RocketTree): OpenRocketDesign {
  const r = buildRocketTree(sent);
  // An ignored mount or booster is not in the build, so its motor and activeness have nowhere to go.
  const present = new Set<string>();
  for (const n of walkNodes(sent.components)) if (typeof n.id === 'string') present.add(n.id);
  for (const [id, m] of liveMotors(tree, config)) {
    // Skipped rather than letting the engine throw "Too short thrust-curve".
    if (!present.has(id) || !hasUsableCurve(m.spec)) continue;
    r.setMotorById(id, m.spec);
    if (m.ignitionEvent || m.ignitionDelay)
      r.setMotorIgnitionById(id, m.ignitionEvent ?? 'automatic', m.ignitionDelay ?? 0);
  }
  // After the motors: a motor seated later would put a grounded stage's engine back.
  for (const stage of findStages(tree)) {
    const id = stage.id as string;
    if (present.has(id) && !stageFlies(config, id)) r.setStageActiveById(id, false);
  }
  return r;
}

/**
 * The cone moves the CP and nothing a person sees. Lengths and warnings come from the build without it: a motor
 * sticking out of the tail sits inside the cone, so subtracting its length would undercount, and its join with the
 * tail reads as a diameter discontinuity, which is the hack, not a fault in the design. Per-part rows drop it.
 */
function hideHackCone(r: OpenRocketDesign, drawn: StaticInfo): void {
  const staticInfo = r.staticInfo.bind(r);
  r.staticInfo = () => ({
    ...staticInfo(),
    length: drawn.length,
    lengthAerodynamic: drawn.lengthAerodynamic,
    warnings: drawn.warnings,
    warningTexts: drawn.warningTexts,
  });
  const componentMasses = r.componentMasses.bind(r);
  r.componentMasses = () => componentMasses().filter((m) => m.name !== BASE_DRAG_HACK_ENGINE_NAME);
  const aeroSweep = r.aeroSweep.bind(r);
  r.aeroSweep = (options) => {
    const sweep = aeroSweep(options);
    return { ...sweep, components: sweep.components.filter((c) => c.name !== BASE_DRAG_HACK_ENGINE_NAME) };
  };
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
