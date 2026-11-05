import { chargeRows, type ChargeRow } from '../flight/recoveryCharges';
import { designBays, type DesignBay } from '../flight/recoveryBays';
import type { ComponentNode, OpenRocketDesign, RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { buildConfiguredRocket, buildKey } from '../design/buildRocket';
import { isRecoveryDevice } from '../design/treeEdit';
import { MATERIAL_KEYS } from '../design/materialSlots';
import { activateThrough, stageIdsByTopStage } from '../design/stageStack';
import { liveMotors, type FlightConfig } from '../flight/flightConfigs';
import type { Simulation } from '../flight/simulations';
import type { LoadedMeta } from '../files/wireLoadedOrk';
import { motorStats, type MotorStats } from './rocketReport';
import { numOpt } from '../../tree/nodeProps';
import { isFinSet, isPlanarFinSet } from '../../tree/tubefins';
import { cantFrontShift, finMount, finSpan } from '../../tree/finPlanform';
import { parentStartOf } from '../../tree/axialRebase';
import { axialLength } from '../../tree/position';
import { stageNodes, walkNodes } from '../../tree/treeWalk';
import { designNameOf } from '../app/appInfo';
import { stageFileName } from '../design/orkTree';
import i18n from '../../i18n';
import { errorText } from '../../i18n/keyedError';

// All SI.

export interface PartRow {
  depth: number;
  type: string;
  name: string;
  material?: string;
  /** kg/m³, kg/m² or kg/m per `densityKind` (absent means bulk). */
  density?: number;
  densityKind?: MaterialDensity;
  length: number;
  outerR?: number;
  innerR?: number;
  foreR?: number;
  aftR?: number;
  thickness?: number;
  span?: number;
  mass: number;
}

export type MaterialDensity = 'density' | 'surfaceDensity' | 'lineDensity';

// Matches the kernel's getMaterial(); shroud lines (getLineMaterial()) are not included.
function rowMaterial(
  node: ComponentNode,
): Required<Pick<PartRow, 'densityKind'>> & Pick<PartRow, 'material' | 'density'> {
  const kind = isRecoveryDevice(node.type) ? 'surface' : node.type === 'shockcord' ? 'line' : 'bulk';
  const keys = MATERIAL_KEYS[kind];
  const n = node[keys.name];
  return {
    material: typeof n === 'string' ? n : undefined,
    density: numOpt(node, keys.density),
    densityKind: keys.density as MaterialDensity,
  };
}

function rowRadii(node: ComponentNode): Pick<PartRow, 'outerR' | 'innerR' | 'foreR' | 'aftR'> {
  if (node.type === 'nosecone') return { outerR: numOpt(node, 'aftRadius') };
  if (node.type === 'transition') return { foreR: numOpt(node, 'foreRadius'), aftR: numOpt(node, 'aftRadius') };
  const outerR = numOpt(node, 'outerRadius');
  if (node['filled'] === true) return { outerR };
  const thickness = numOpt(node, 'thickness');
  const innerR =
    numOpt(node, 'innerRadius') ?? (outerR != null && thickness != null ? Math.max(0, outerR - thickness) : undefined);
  return { outerR, innerR };
}

export interface Summary {
  label: string;
  info: StaticInfo;
}

export interface FlightRows {
  maxAltitude: number;
  flightTime: number;
  timeToApogee: number;
  launchRodVelocity: number;
  maxVelocity: number;
  deploymentVelocity: number | null;
  groundHitVelocity: number;
}

export interface ConfigMotor extends MotorStats {
  /** kg, top stage through this motor's stage; NaN when the build failed. */
  loadedMass: number;
}

export interface MotorConfig {
  name: string;
  motors: ConfigMotor[];
  flight: FlightRows | null;
  outdated?: boolean;
}

/** Root edges from the nose tip (m). */
export interface FinSetPosition {
  name?: string;
  type: string;
  topX: number;
  bottomX: number;
}

export interface ReportModel {
  name: string;
  designType?: string;
  stages: ComponentNode[];
  whole: Summary;
  stageSummaries: Summary[];
  configs: MotorConfig[];
  partsByStage: { stage: string; rows: PartRow[] }[];
  finSetsByStage: { stage: string; sets: FinSetPosition[] }[];
  charges?: ChargeRow[];
  bays?: DesignBay[];
}

export function stageParts(
  stage: ComponentNode,
  rocket: { componentInfo: (id: string) => { mass: number } },
  tree: RocketTree = { components: [stage] },
): PartRow[] {
  const rows: PartRow[] = [];
  const walk = (node: ComponentNode, depth: number, parent: ComponentNode | null) => {
    if (node.type !== 'stage') {
      const id = node.id;
      let mass = 0;
      if (id) {
        try {
          mass = rocket.componentInfo(id).mass;
        } catch {
          /* a part the engine can't weigh: leave 0 */
        }
      }
      rows.push({
        depth,
        type: node.type,
        name: (node.name as string) || '',
        ...rowMaterial(node),
        length: axialLength(node),
        ...rowRadii(node),
        // A filled part is solid: the stored wall is not what flies.
        thickness: node['filled'] === true ? undefined : numOpt(node, 'thickness'),
        ...(isPlanarFinSet(node.type)
          ? { span: finSpan(node, parent && finMount(node, parent, parentStartOf(tree, parent))) }
          : {}),
        mass,
      });
    }
    for (const c of node.children ?? []) walk(c, node.type === 'stage' ? depth : depth + 1, node);
  };
  for (const c of stage.children ?? []) walk(c, 0, stage);
  return rows;
}

export interface ReportBuild {
  info: StaticInfo;
  handle: OpenRocketDesign;
}

// Every build resets the shared engine, so the whole-rocket handle is reinstalled in a finally.
export function restoringEngine<T>(
  work: () => T,
  rebuilt: () => boolean,
  buildWhole: () => ReportBuild,
  restore: (built: ReportBuild) => void,
  onRestoreFailed: (e: unknown) => void,
): T {
  try {
    return work();
  } finally {
    if (rebuilt()) restoreWhole(buildWhole, restore, onRestoreFailed);
  }
}

function restoreWhole(
  buildWhole: () => ReportBuild,
  restore: (built: ReportBuild) => void,
  onRestoreFailed: (e: unknown) => void,
): void {
  // Never rethrow: throwing from a finally would replace the more useful error.
  try {
    restore(buildWhole());
  } catch (e) {
    onRestoreFailed(e);
  }
}

export type MassBuild = Pick<OpenRocketDesign, 'setStageActiveById' | 'staticInfo'>;

// Desktop design report: top stage through the motor's own stage, whatever the config grounds.
// `build` resets the shared engine; the caller restores the live handle.
export function configMotors(
  tree: RocketTree,
  config: FlightConfig,
  build: (tree: RocketTree, config: FlightConfig) => MassBuild,
  whole?: number,
): ConfigMotor[] {
  const top = stageNodes(tree);
  const last = Math.max(0, top.length - 1);
  const stageOf = new Map<string, number>();
  top.forEach((st, i) => {
    for (const n of walkNodes([st])) if (typeof n.id === 'string') stageOf.set(n.id, i);
  });
  const stageIds = stageIdsByTopStage(tree);

  const masses = new Map<number, number>();
  if (whole != null && !config.grounded?.length) masses.set(last, whole);
  let built: MassBuild | null = null;
  let failed = false;
  const massThrough = (k: number): number => {
    const known = masses.get(k);
    if (known != null) return known;
    let mass = NaN;
    if (!failed) {
      try {
        built ??= build(tree, config);
        const r = built;
        activateThrough(r, stageIds, k);
        mass = r.staticInfo().mass;
      } catch {
        failed = true;
      }
    }
    masses.set(k, mass);
    return mass;
  };

  return liveMotors(tree, config)
    .filter(([, m]) => m.spec.times?.length)
    .map(([id, m]) => ({ ...motorStats(m.spec), loadedMass: massThrough(stageOf.get(id) ?? last) }));
}

export interface ReportSource {
  tree: RocketTree;
  info: StaticInfo | null;
  rocket: OpenRocketDesign | null;
  loadedMeta: LoadedMeta | null;
  sims: readonly Simulation[];
  flownConfig: () => FlightConfig;
  configOf: (sim: Simulation) => FlightConfig;
  isOutdated: (sim: Simulation) => boolean;
  applyBuild: (info: StaticInfo | null, rocket: OpenRocketDesign | null) => void;
  setErr: (message: string) => void;
}

// A caller inside render must pass `install`: the default store write updates subscribers mid-render.
export function assembleReport(s: ReportSource, install?: (built: ReportBuild) => void): ReportModel | null {
  const { tree, info, rocket } = s;
  if (!info || !rocket) return null;
  const name = designNameOf(tree, s.loadedMeta);
  const stages = stageNodes(tree);
  const stageList = stages.length
    ? stages
    : [{ type: 'stage', name: '', children: tree.components } as unknown as ComponentNode];

  const infoRocket = rocket as unknown as { componentInfo: (id: string) => { mass: number; positionX: number } };
  const stageName = stageFileName;

  // Needs the live handle: gather before any rebuild.
  const partsByStage = stageList.map((st, i) => ({
    stage: stageName(st, i),
    rows: stageParts(st, infoRocket, tree),
  }));
  const finSetsByStage = stageList.map((st, i) => ({
    stage: stageName(st, i),
    sets: finSetPositions(st, infoRocket),
  }));

  const whole: Summary = { label: name, info };
  const flown = s.flownConfig();
  const flownKey = buildKey(tree, flown);

  let rebuilt = false;
  const build = (t: RocketTree, c: FlightConfig) => {
    rebuilt = true;
    return buildConfiguredRocket(t, c);
  };

  const { stageSummaries, configs } = restoringEngine(
    () => {
      const stageSummaries: Summary[] =
        stages.length > 1
          ? stages.map((st, i) => ({
              label: stageName(st, i),
              info: build({ name, components: [st] }, flown).staticInfo(),
            }))
          : stageList.map((st, i) => ({ label: stageName(st, i), info }));
      const configs: MotorConfig[] = s.sims.map((sim) => {
        const config = s.configOf(sim);
        return {
          name: sim.name,
          motors: configMotors(tree, config, build, buildKey(tree, config) === flownKey ? info.mass : undefined),
          flight: sim.result ? sim.result.summary : null,
          outdated: sim.result ? s.isOutdated(sim) : false,
        };
      });
      return { stageSummaries, configs };
    },
    () => rebuilt,
    () => {
      // Must match how the rebuild effect configures the live handle.
      const main = buildConfiguredRocket(tree, flown);
      return { info: main.staticInfo(), handle: main };
    },
    install ?? ((built) => s.applyBuild(built.info, built.handle)),
    (e) => {
      s.applyBuild(null, null);
      s.setErr(errorText(e, i18n.t));
    },
  );

  return {
    name,
    designType: tree.designType,
    stages: stageList,
    whole,
    stageSummaries,
    configs,
    partsByStage,
    finSetsByStage,
    charges: chargeRows(tree),
    bays: designBays(tree).filter((b) => b.record.tests.length || Object.keys(b.record).length > 1),
  };
}

export function finSetPositions(
  stage: ComponentNode,
  rocket: { componentInfo: (id: string) => { positionX: number } },
): FinSetPosition[] {
  const out: FinSetPosition[] = [];
  for (const n of walkNodes(stage.children ?? [])) {
    if (!isFinSet(String(n.type)) || typeof n.id !== 'string') continue;
    // axialLength, not rootChord: a tube fin's span is its length.
    const root = axialLength(n);
    try {
      // The kernel locates a canted set by its first fin turned about the root midpoint.
      const topX = rocket.componentInfo(n.id).positionX - cantFrontShift(n, root);
      const own = typeof n.name === 'string' ? n.name.trim() : '';
      out.push({ ...(own ? { name: own } : {}), type: String(n.type), topX, bottomX: topX + root });
    } catch {
      /* skip a fin set the engine can't locate */
    }
  }
  return out;
}
