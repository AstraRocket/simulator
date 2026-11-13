import type { FlightResult, RocketTree, FlightSummary, SimStepper } from '../../engine/openRocketEngine';
import type { FlightConfig } from './flightConfigs';
import type { LaunchConditions } from '../design/orkTree';
import type { CompleteLaunch } from './requiredLaunch';
import { uuid } from '../app/uuid';
import { degToRad } from '../../prefs/units';
import { LAUNCH_SI } from '../../prefs/launchUnits';
import { stableJson } from '../app/stableJson';
import { DEFAULT_HEADING_DEG, surfaceWind } from './windLevels';
import { collectNodes } from '../../tree/treeWalk';
import { isRecoveryDevice, MAIN_DEVICE_KEY } from '../design/treeEdit';
import { settleLinkedDimensions } from '../design/linkedDimensions';
import { BAYS_KEY } from './recoveryBays';

// Radians, as `SimulationOptions.setMaximumStepAngle` clamps; the bridge's `SimulationConditions` has no clamp.
export const MAX_ANGLE_STEP_RANGE = { min: degToRad(1), max: degToRad(20) } as const;

export const clampMaxAngleStep = (rad: number): number =>
  Math.min(MAX_ANGLE_STEP_RANGE.max, Math.max(MAX_ANGLE_STEP_RANGE.min, rad));

export const SIM_STEPPERS: readonly SimStepper[] = ['rk4', 'rk6'];

export const stepperOf = <F extends SimStepper | null>(v: unknown, fallback: F): SimStepper | F =>
  typeof v === 'string' && (SIM_STEPPERS as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as SimStepper)
    : fallback;

export interface Simulation {
  id: string;
  name: string;
  configId: string;
  launch: LaunchConditions;
  result: FlightResult | null;
  // `key` is null when the file called the summary outdated.
  fileSummary?: { summary: FlightSummary; key: string | null };
  xmlExtra?: string[];
  // Outdated is derived from this, never stored.
  resultKey?: string;
  resultLaunch?: LaunchConditions;
  prefs?: Partial<SimPrefs>;
}

// Compared by reference: store actions replace rather than mutate.
export interface SimInputs {
  config: FlightConfig;
  launch: LaunchConditions;
  prefs: Partial<SimPrefs> | undefined;
}

export function simInputs(sim: Simulation, config: FlightConfig): SimInputs {
  return { config, launch: sim.launch, prefs: sim.prefs };
}

export function sameSimInputs(a: SimInputs, b: SimInputs): boolean {
  return a.config === b.config && a.launch === b.launch && a.prefs === b.prefs;
}

export function effectivePrefs(globals: SimPrefs, own: Partial<SimPrefs> | undefined): SimPrefs {
  return { ...globals, ...own };
}

// Bay records fly nothing, and the kernel knows only the drogue, not which device is main.
const NOT_FLOWN = new Set(['name', BAYS_KEY, MAIN_DEVICE_KEY]);
const treeKeys = new WeakMap<RocketTree, string>();

// Recovery device names stay in because a run's deployments name their device.
export function flightKey(tree: RocketTree): string {
  let key = treeKeys.get(tree);
  if (key === undefined) {
    const deviceNames = collectNodes(tree.components, (n) => isRecoveryDevice(n.type)).map((n) => n.name);
    // Settled as the kernel builds them, so a settled and unsettled link key the same.
    key = stableJson([settleLinkedDimensions(tree).components, deviceNames], NOT_FLOWN);
    treeKeys.set(tree, key);
  }
  return key;
}

const resultKeys = new WeakMap<
  Simulation,
  { tree: RocketTree; config: FlightConfig; globals: SimPrefs; key: string }
>();

export function resultKey(tree: RocketTree, config: FlightConfig, sim: Simulation, globals: SimPrefs): string {
  // Inputs are replaced, never mutated, so identity is a valid hit test.
  const hit = resultKeys.get(sim);
  if (hit && hit.tree === tree && hit.config === config && hit.globals === globals) return hit.key;
  const key = computeResultKey(tree, config, sim, globals);
  resultKeys.set(sim, { tree, config, globals, key });
  return key;
}

function computeResultKey(tree: RocketTree, config: FlightConfig, sim: Simulation, globals: SimPrefs): string {
  const { id: _id, name: _name, ...flown } = config;
  const prefs = effectivePrefs(globals, sim.prefs);
  // Neither is flown.
  const { weatherSource: _source, keptWindLevels: _kept, ...launch } = sim.launch;
  return stableJson([flightKey(tree), flown, launch, SIM_PREF_KEYS.map((k) => prefs[k] ?? null)]);
}

export function isOutdated(sim: Simulation, tree: RocketTree, config: FlightConfig, globals: SimPrefs): boolean {
  if (sim.result !== null) return sim.resultKey !== resultKey(tree, config, sim, globals);
  if (sim.fileSummary) return sim.fileSummary.key !== resultKey(tree, config, sim, globals);
  return false;
}

export interface ResultFlight {
  id: string;
  name: string;
  result: FlightResult;
  launch: LaunchConditions;
}

// `chosen` null means the active simulation.
export function resultFlight(
  sims: readonly Simulation[],
  chosen: string | null,
  activeId: string,
): ResultFlight | null {
  const byId = (id: string | null) => (id == null ? undefined : sims.find((x) => x.id === id));
  // Resolves as `selectActive` does, so the charts and `selectShownSim` tiles agree.
  return toResultFlight(byId(chosen)) ?? toResultFlight(byId(activeId) ?? sims[0]);
}

export function toResultFlight(sim: Simulation | undefined): ResultFlight | null {
  return sim?.result
    ? { id: sim.id, name: sim.name, result: sim.result, launch: sim.resultLaunch ?? sim.launch }
    : null;
}

export type SimStatus = 'notRun' | 'queued' | 'running' | 'failed' | 'outdated' | 'upToDate' | 'fromFile';

export type SimRun = { phase: 'queued' } | { phase: 'running' } | { phase: 'failed'; tree: RocketTree };

// A `failed` entry only counts against the design it was recorded on.
export function simStatus(
  sim: Simulation,
  runs: Record<string, SimRun>,
  tree: RocketTree,
  outdated: boolean,
): SimStatus {
  const run = runs[sim.id];
  if (run?.phase === 'queued') return 'queued';
  if (run?.phase === 'running') return 'running';
  if (run?.phase === 'failed' && run.tree === tree) return 'failed';
  if (!sim.result) return sim.fileSummary ? (outdated ? 'outdated' : 'fromFile') : 'notRun';
  return outdated ? 'outdated' : 'upToDate';
}

const SIM_STATUS_KEY: Record<SimStatus, string> = {
  upToDate: 'sims.statusUpToDate',
  outdated: 'sims.statusOutdated',
  queued: 'sims.statusQueued',
  running: 'sims.statusRunning',
  failed: 'sims.statusFailed',
  notRun: 'sims.notRun',
  fromFile: 'sims.statusFromFile',
};

export function simStatusLabel(status: SimStatus, t: (key: string) => string): string {
  return t(SIM_STATUS_KEY[status]);
}

export const withoutResults = (sims: readonly Simulation[]): Simulation[] =>
  sims.map((s) => ({ ...s, result: null, resultLaunch: undefined }));

// A UUID, so ids minted after a reload cannot collide with persisted ones.
function newSimId(): string {
  return uuid();
}

/** `base`, or `base 2`, `base 3` ... where it is taken. */
export function nextFreeName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base} ${n}`;
  return name;
}

export function newSimulation(name: string, configId: string, launch: LaunchConditions): Simulation {
  return { id: newSimId(), name, configId, launch, result: null };
}

export interface SimPrefs {
  timeStep: number;
  maxTime: number;
  // Radians.
  maxAngleStep: number;
  stepper: SimStepper;
  randomSeed: number | null;
  // m/s.
  deploymentSpeedWarn: number;
  mainHighSpeedWarn: number;
  mainLowSpeedWarn: number;
  drogueLowSpeedWarn: number;
  guideAwareRodClearance: boolean;
  // m/s.
  railExitVelocityMin: number;
  // The kernel compares lengths as text in this unit, so a unit switch changes what a run records.
  lengthUnit?: string;
}

// A key missing here would never invalidate results; `EXHAUSTIVE` fails to compile then.
export const SIM_PREF_KEYS = [
  'timeStep',
  'maxTime',
  'maxAngleStep',
  'stepper',
  'randomSeed',
  'deploymentSpeedWarn',
  'mainHighSpeedWarn',
  'mainLowSpeedWarn',
  'drogueLowSpeedWarn',
  'guideAwareRodClearance',
  'railExitVelocityMin',
  'lengthUnit',
] as const satisfies readonly (keyof SimPrefs)[];

type EXHAUSTIVE =
  Exclude<keyof SimPrefs, (typeof SIM_PREF_KEYS)[number]> extends never
    ? true
    : ['SIM_PREF_KEYS is missing', Exclude<keyof SimPrefs, (typeof SIM_PREF_KEYS)[number]>];
const _exhaustive: EXHAUSTIVE = true;
void _exhaustive;

// Key by key: the settings object is rebuilt on every unrelated change.
export function changedPrefKeys(before: SimPrefs, after: SimPrefs): (keyof SimPrefs)[] {
  return SIM_PREF_KEYS.filter((k) => before[k] !== after[k]);
}

// The bridge defaults an omitted seed to 42; mirrors OpenRocket's `new Random().nextInt()`, signed 32-bit.
export const freshSeed = (): number => Math.floor(Math.random() * 2 ** 32) - 2 ** 31;

// Matches the bridge's `(int)` cast (truncate, saturate) so the field shows the seed flown.
export function seedFromInput(v: number | null): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return Math.max(-(2 ** 31), Math.min(2 ** 31 - 1, Math.trunc(v)));
}

// Radians, kelvin, Pa.
export function simConditions(launch: CompleteLaunch, prefs?: SimPrefs) {
  // Into the wind uses the pad-altitude wind, as SimulationOptions.getLaunchRodDirection does.
  const windDirDeg = surfaceWind(launch).headingDeg;
  const rodDirDeg = launch.launchIntoWind ? windDirDeg : (launch.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG);
  return {
    launchRodLength: launch.launchRodLengthM,
    launchRodAngle: degToRad(launch.launchRodAngleDeg),
    launchRodDirection: degToRad(rodDirDeg),
    windAverage: launch.windAverage,
    windStdDeviation: launch.windStdDev,
    windDirection: degToRad(launch.windDirectionDeg ?? DEFAULT_HEADING_DEG),
    windLevels: launch.windLevels?.map((l) => ({
      altitude: l.altitudeM,
      speed: l.speed,
      direction: degToRad(l.directionDeg),
      stddev: l.stddev,
    })),
    windAltitudeReference: launch.windAltitudeReference,
    geodetic: launch.geodetic,
    gravityModel: launch.gravityModel,
    constantGravity: launch.constantGravity,
    // A stored value can hold a step outside the range the kernel flies.
    maxAngleStep: prefs?.maxAngleStep == null ? undefined : clampMaxAngleStep(prefs.maxAngleStep),
    stepper: prefs?.stepper,
    launchAltitude: launch.launchAltitudeM,
    launchLatitude: launch.latitudeDeg,
    launchLongitude: launch.longitudeDeg,
    temperature: launch.temperatureC != null ? LAUNCH_SI.degC.toSi(launch.temperatureC) : undefined,
    pressure: launch.pressureHPa != null ? LAUNCH_SI.hPa.toSi(launch.pressureHPa) : undefined,
    // Omitted when null: the bridge reads an absent key as NaN and stays ISA.
    relativeHumidity: launch.relativeHumidity ?? undefined,
    atmosphereLevels: launch.atmosphereLevels?.length
      ? launch.atmosphereLevels.map((l) => ({
          altitude: l.altitudeM,
          temperature: LAUNCH_SI.degC.toSi(l.temperatureC),
          pressure: LAUNCH_SI.hPa.toSi(l.pressureHPa),
          relativeHumidity: l.relativeHumidity,
        }))
      : undefined,
    timeStep: prefs?.timeStep,
    maxTime: prefs?.maxTime,
    randomSeed: prefs?.randomSeed ?? freshSeed(),
    recoverySpeedWarn: prefs?.deploymentSpeedWarn,
    mainHighSpeedWarn: prefs?.mainHighSpeedWarn,
    mainLowSpeedWarn: prefs?.mainLowSpeedWarn,
    drogueLowSpeedWarn: prefs?.drogueLowSpeedWarn,
    guideAwareRodClearance: prefs?.guideAwareRodClearance,
    railExitMinSpeed: prefs?.railExitVelocityMin,
    // All series, not `summary`'s 17: the app can only plot or export what it asked for.
    series: 'full' as const,
  };
}
