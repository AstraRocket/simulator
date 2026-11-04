// Engine units: SI and radians, except launchLatitude/launchLongitude in degrees.
// Must stay the first import: TeaVM reads its stdout/stderr sinks once at evaluation.
import './kernelLogSink.js';
import { declaredLength, readStreamWithProgress } from '../services/app/fetchProgress';
import { nsKey } from '../services/storage/storageKeys';
import { errorMessage } from '../services/app/errorMessage';
import { KeyedError } from '../i18n/keyedError';
import type { DocumentMaterial } from '../services/materials/documentMaterials';
import { curveProblem } from '../services/motors/motorCurve';

// In web/public/ so Vite serves them verbatim: import-analysis warns on the loader's dynamic imports.
const WASM_URL = `${import.meta.env.BASE_URL}engine/openrocket-engine.wasm`;
const WASM_RUNTIME_URL = `${import.meta.env.BASE_URL}engine/openrocket-engine.wasm-runtime.js`;

type EngineApi = typeof import('./vendor/openrocket-engine.mjs');
let active: EngineApi | null = null;
let initPromise: Promise<'wasm' | 'js'> | null = null;

const envelopeText = (err: unknown): string => (typeof err === 'string' ? err : JSON.stringify(err));

/** Throws until initEngine() resolves; the app mounts first, so main-thread callers check `engineStore.phase`. */
function eng(): EngineApi {
  if (!active) {
    throw new KeyedError('errors.engine.notReady');
  }
  return active;
}

export function engineActive(): boolean {
  return active !== null;
}

export function __setEngineForTests(stub: Partial<EngineApi> | null): void {
  active = stub as EngineApi | null;
  engineGeneration++;
}

/** Bumped on every handle-table reset, so a stale design fails instead of addressing a reused handle. */
let engineGeneration = 0;

export class StaleDesignError extends KeyedError {
  constructor() {
    super('errors.engine.staleDesign');
    this.name = 'StaleDesignError';
  }
}

/** Void and primitive exports throw raw, in a different shape per target (JS wraps, WASM-GC traps). */
export class EngineCallError extends Error {
  readonly engineCause: unknown;
  readonly cause: unknown;

  constructor(
    readonly operation: string,
    engineCause: unknown,
  ) {
    const detail = errorMessage(engineCause);
    super(`engine ${operation} failed: ${detail || '(no message)'}`);
    this.name = 'EngineCallError';
    this.engineCause = engineCause;
    // Not `{ cause }`: the ES2020 lib has no Error options bag.
    this.cause = engineCause;
  }
}

function callEngine<T>(operation: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KeyedError) throw e;
    throw new EngineCallError(operation, e);
  }
}

function parseEnvelope<T>(operation: string, raw: string, expectArray = false): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EngineCallError(operation, new Error(`reply is not JSON: ${String(raw).slice(0, 120)}`));
  }
  if (expectArray) {
    if (Array.isArray(parsed)) return parsed as T;
    const err = (parsed as { error?: unknown } | null)?.error;
    throw new EngineCallError(operation, new Error(err ? envelopeText(err) : 'unexpected reply shape'));
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new EngineCallError(operation, new Error(`unexpected reply shape: ${String(raw).slice(0, 120)}`));
  }
  const err = (parsed as { error?: unknown }).error;
  if (err) throw new EngineCallError(operation, new Error(envelopeText(err)));
  return parsed as T;
}

/** Not retryable: the specifier must stay static for the bundler, so the module registry caches the failure. */
async function loadJsEngine(): Promise<EngineApi> {
  return await import('./vendor/openrocket-engine.mjs');
}

/**
 * A distinct url, or the browser coalesces the `<script>` onto the stalled request.
 * The precache must ignore `retry` (`ignoreURLParametersMatching` in vite.config.ts).
 */
export function retryUrl(url: string, attempt: number): string {
  return attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`;
}

function attemptUrl(url: string): string {
  return retryUrl(url, initAttempt);
}

/** Counted from the last byte, so a slow but moving link is not cut off. */
export const WASM_STALL_MS = 20_000;

interface StallWatch {
  signal: AbortSignal;
  poke(): void;
  stop(): void;
}

function stallWatch(ms: number): StallWatch {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poke = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctl.abort(new Error(`WASM download stalled for ${ms} ms`)), ms);
  };
  poke();
  return { signal: ctl.signal, poke, stop: () => clearTimeout(timer) };
}

function loadWasmRuntime(signal: AbortSignal): Promise<void> {
  const g = globalThis as unknown as { TeaVM?: { wasmGC?: unknown } };
  if (g.TeaVM?.wasmGC) return Promise.resolve();
  // A Worker has no <script>, and Vite won't serve /public via import(), so go through a Blob URL.
  if (typeof document === 'undefined') {
    return fetch(attemptUrl(WASM_RUNTIME_URL), { signal })
      .then((r) => {
        if (!r.ok) throw new Error(`WASM-GC runtime fetch failed (${r.status})`);
        return r.text();
      })
      .then(async (src) => {
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        try {
          await import(/* @vite-ignore */ url);
        } finally {
          URL.revokeObjectURL(url);
        }
      });
  }
  return new Promise<void>((resolve, reject) => {
    // A <script> cannot be aborted, so a stall rejects the wait instead.
    if (signal.aborted) return reject(signal.reason as Error);
    signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
    const s = document.createElement('script');
    s.src = attemptUrl(WASM_RUNTIME_URL);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('WASM-GC runtime failed to load'));
    document.head.appendChild(s);
  });
}

/** Works only because `load()` runs `installImports` after building its default `teavmConsole`. */
function installKernelConsole(imports: Record<string, unknown>): void {
  const g = globalThis as Record<string, unknown>;
  const pump = (globalName: string) => {
    let buf = '';
    return (c: number) => {
      if (c === 10) {
        const custom = g[globalName];
        if (typeof custom === 'function') (custom as (s: string) => void)(buf);
        buf = '';
      } else {
        buf += String.fromCharCode(c);
      }
    };
  };
  imports.teavmConsole = {
    putcharStdout: pump('$rt_putStdoutCustom'),
    putcharStderr: pump('$rt_putStderrCustom'),
  };
}

export type EngineLoadStatus = { phase: 'downloading'; loaded: number; total: number | null } | { phase: 'starting' };

/** `null`: a failed or stalled load a retry can recover. */
async function tryLoadWasm(onStatus?: (s: EngineLoadStatus) => void): Promise<EngineApi | 'unsupported' | null> {
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.compileStreaming !== 'function') {
    return 'unsupported';
  }
  const watch = stallWatch(WASM_STALL_MS);
  try {
    await loadWasmRuntime(watch.signal);
    watch.poke();
    const wasmGC = (
      globalThis as unknown as {
        TeaVM?: { wasmGC?: { load(src: ArrayBuffer, options?: unknown): Promise<{ exports: unknown }> } };
      }
    ).TeaVM?.wasmGC;
    if (!wasmGC?.load) return null;
    // Passing load() an ArrayBuffer sidesteps the runtime's Node-vs-browser detection.
    const res = await fetch(attemptUrl(WASM_URL), { signal: watch.signal });
    if (!res.ok) return null;
    watch.poke();
    const streamed = res.body
      ? await readStreamWithProgress(res.body, declaredLength(res), (p) => {
          watch.poke();
          onStatus?.({ phase: 'downloading', ...p });
        })
      : null;
    // readStreamWithProgress always allocates a plain (unshared) ArrayBuffer.
    const bytes = streamed ? (streamed.buffer as ArrayBuffer) : await res.arrayBuffer();
    watch.stop();
    onStatus?.({ phase: 'starting' });
    const teavm = await wasmGC.load(bytes, { installImports: installKernelConsole });
    const exports = teavm.exports as EngineApi;
    if (typeof exports.buildRocket !== 'function') return 'unsupported';
    return exports;
  } catch (e) {
    console.warn('[engine] WASM-GC unavailable, using the JS engine.', e);
    // A compile or link failure (no WASM-GC) repeats on every attempt.
    return e instanceof WebAssembly.CompileError || e instanceof WebAssembly.LinkError ? 'unsupported' : null;
  } finally {
    watch.stop();
  }
}

let jsOnly = false;

export function engineRetryCanRecover(): boolean {
  return !jsOnly;
}

export type BackendPref = 'wasm' | 'js' | 'auto';

export const ENGINE_PREF_KEY = nsKey('engine');

/** Main thread only: a worker has no page `location` or `localStorage`. */
export function backendPref(): BackendPref {
  try {
    const q = new URLSearchParams(location.search).get('engine');
    if (q === 'wasm' || q === 'js') return q;
    const ls = localStorage.getItem(ENGINE_PREF_KEY);
    if (ls === 'wasm' || ls === 'js') return ls;
  } catch {
    /* no location/localStorage (SSR/tests/workers) → auto */
  }
  return 'auto';
}

/** Bumped by {@link resetEngineInit} so an abandoned load cannot install itself later. */
let initAttempt = 0;

export function initEngine(onStatus?: (s: EngineLoadStatus) => void, pref?: BackendPref): Promise<'wasm' | 'js'> {
  if (!initPromise) {
    const mine = initAttempt;
    initPromise = (async () => {
      const wasm = (pref ?? backendPref()) === 'js' ? 'unsupported' : await tryLoadWasm(onStatus);
      if (wasm === 'unsupported') jsOnly = true;
      else if (wasm) {
        if (mine === initAttempt) {
          active = wasm;
          active.setLengthUnit(lengthUnit);
        }
        return 'wasm';
      }
      onStatus?.({ phase: 'downloading', loaded: 0, total: null });
      const js = await loadJsEngine();
      if (mine === initAttempt) {
        active = js;
        active.setLengthUnit(lengthUnit);
      }
      onStatus?.({ phase: 'starting' });
      return 'js';
    })();
  }
  return initPromise;
}

/** A rejected or stalled `initPromise` never clears itself. */
export function resetEngineInit(): void {
  initAttempt++;
  initPromise = null;
  active = null;
  engineGeneration++;
}

export type NoseShape = 'ogive' | 'conical' | 'ellipsoid' | 'power' | 'parabolic' | 'haack';

export interface MotorSpec {
  /** The common name (`F67`) the kernel and a `.ork` match on; F67C and F67W share it. */
  designation: string;
  code?: string;
  manufacturer?: string;
  diameter: number;
  length: number;
  /** s, N, and motor mass in kg at each time. */
  times: number[];
  thrusts: number[];
  masses: number[];
  /** m, from the motor's leading end. */
  cgX: number;
  /** s. Use {@link PLUGGED_DELAY} for a plugged motor. */
  ejectionDelay: number;
  curveSrc?: string;
  /** A save embeds this curve even under a catalog motor's name. */
  imported?: true;
  type?: MotorType;
}

export type MotorType = 'SU' | 'reload' | 'hybrid';

/** The kernel's `Motor.PLUGGED_DELAY` is Infinity, which JSON turns into null. */
export const PLUGGED_DELAY = 1e9;

const toKernelDelay = (d: number): number => (d >= PLUGGED_DELAY ? Infinity : d);

export type SimStepper = 'rk4' | 'rk6';

export interface SimulationOptions {
  launchRodLength?: number;
  /** Radians from vertical. */
  launchRodAngle?: number;
  /** Compass heading, radians (default π/2). */
  launchRodDirection?: number;
  windAverage?: number;
  windStdDeviation?: number;
  /** Radians. Ignored when windLevels is set. */
  windDirection?: number;
  /** altitude m, speed m/s, direction radians, stddev m/s. */
  windLevels?: { altitude: number; speed: number; direction: number; stddev: number }[];
  windAltitudeReference?: 'msl' | 'agl';
  geodetic?: 'flat' | 'spherical' | 'wgs84';
  gravityModel?: 'wgs' | 'constant';
  /** m/s^2. */
  constantGravity?: number;
  /** Radians. */
  maxAngleStep?: number;
  stepper?: SimStepper;
  launchAltitude?: number;
  /** K. */
  temperature?: number;
  /** Pa. */
  pressure?: number;
  /** Fraction (0..1). */
  relativeHumidity?: number;
  /** altitude m MSL, K, Pa, humidity fraction. */
  atmosphereLevels?: { altitude: number; temperature: number; pressure: number; relativeHumidity: number }[];
  /** Degrees, not radians. */
  launchLatitude?: number;
  /** Degrees, not radians. */
  launchLongitude?: number;
  timeStep?: number;
  maxTime?: number;
  randomSeed?: number;
  /** m/s. `drogueLowSpeedWarn` relies on PATCH(drogue-low-speed). */
  recoverySpeedWarn?: number;
  mainHighSpeedWarn?: number;
  mainLowSpeedWarn?: number;
  drogueLowSpeedWarn?: number;
  /** Off keeps the flight bit-identical to upstream (`api/GuideClearanceListener.java`). */
  guideAwareRodClearance?: boolean;
  /** m/s. */
  railExitMinSpeed?: number;
  series?: 'summary' | 'full';
}

export interface StaticInfo {
  length: number;
  lengthAerodynamic: number;
  /** kg, with the motor. */
  mass: number;
  /** kg, no motor. */
  massEmpty: number;
  /** m from nose tip, no motor. */
  cgEmpty: number;
  /** m from nose tip, with the motor. */
  cg: number;
  cp: number;
  cna: number;
  /** Do not re-derive: the app lacks `CaliberUnit`'s denominator. */
  stabilityCalibers: number;
  /** Not `(cp - cg) / length`: `length` includes non-aerodynamic parts. */
  stabilityPercent: number;
  refDiameter: number;
  /** kg·m², with the motor. */
  rollInertia: number;
  /** kg·m², with the motor. */
  pitchInertia: number;
  warnings: number;
  warningTexts: string[];
  /** Not from the engine's static JSON: filled by `computeStaticInfo`. */
  cd?: number;
}

export type ComponentType =
  | 'stage'
  | 'nosecone'
  | 'transition'
  | 'bodytube'
  | 'trapezoidfinset'
  | 'ellipticalfinset'
  | 'freeformfinset'
  | 'tubefinset'
  | 'innertube'
  | 'tubecoupler'
  | 'centeringring'
  | 'bulkhead'
  | 'engineblock'
  | 'launchlug'
  | 'railbutton'
  // .ork extension element: mass only, drag not modeled.
  | 'fairing'
  | 'parachute'
  | 'streamer'
  | 'shockcord'
  | 'masscomponent'
  // Nested under a body component, never at the rocket root.
  | 'podset'
  | 'parallelstage';

export type IgnitionEvent = 'automatic' | 'launch' | 'ejectioncharge' | 'burnout' | 'never';

export interface ComponentPosition {
  /** `after` forces offset to 0 (RocketComponent.setAfter), not getAsPosition's `outerLength + offset`. */
  method: 'top' | 'middle' | 'bottom' | 'absolute' | 'after';
  /** meters */
  offset: number;
  /** `orkExport` restores this only while `resolved` still matches the offset. */
  ork?: { method: 'absolute' | 'after'; offset: number; resolved: number };
}

/** Remaining keys are SI, radians (engine-java ComponentFactory). */
export interface ComponentNode {
  type: ComponentType;
  id?: string;
  name?: string;
  /** kg/m^3 */
  density?: number;
  position?: ComponentPosition;
  children?: ComponentNode[];
  [param: string]: unknown;
}

export interface RocketTree {
  name?: string;
  designer?: string;
  kitName?: string;
  comment?: string;
  revision?: string;
  designType?: string;
  /** Carried only: the app always measures against `maximum`. */
  referenceType?: string;
  customReference?: number;
  xmlExtra?: string[];
  docExtra?: string[];
  documentMaterials?: DocumentMaterial[];
  components: ComponentNode[];
}

export const DESIGN_TYPES = [
  'original',
  'commercial_kit',
  'clone_kit',
  'upscale_kit',
  'downscale_kit',
  'modified_kit',
  'kit_bash',
] as const;

export interface FlightSummary {
  maxAltitude: number;
  maxVelocity: number;
  maxAcceleration: number;
  maxMachNumber: number;
  timeToApogee: number;
  flightTime: number;
  groundHitVelocity: number;
  launchRodVelocity: number;
  deploymentVelocity: number | null;
  /** s. */
  optimumDelay: number | null;
  /** m. Null when no rod is long enough; absent when not requested. */
  railLengthNeeded?: number | null;
}

export interface FlightEvent {
  type: string;
  time: number;
  /** Not unique: unnamed parts share a default name. */
  source?: string;
  /** Absent from a result read from a file. */
  sourceId?: string;
}

export interface FlightSeries {
  time: number[];
  altitude: number[];
  velocity: number[];
  acceleration: number[];
  mass: number[];
  thrust: number[];
  drag: number[];
  mach: number[];
  /** calibers */
  stability: number[];
  cpLocation: number[];
  cgLocation: number[];
  /** rad */
  aoa: number[];
  /** NaN/Infinity arrive as JSON null. */
  [symbol: string]: (number | null)[] | undefined;
}

/** Branch 0 is the sustainer stack (same as the top-level data). */
export interface FlightBranch {
  name: string;
  events: FlightEvent[];
  series: FlightSeries;
}

export interface EngineWarning {
  key: string;
  message: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  sourceIds?: string[];
}

export interface FlightResult {
  summary: FlightSummary;
  events: FlightEvent[];
  series: FlightSeries;
  branches?: FlightBranch[];
  warnings?: EngineWarning[];
  warningTexts?: string[];
}

/** SI. */
export interface ComponentInfo {
  length: number;
  /** A fin set's is all fins combined. */
  mass: number;
  sectionMass: number;
  /** From the component's own front. */
  cgX: number;
  /** From the nose tip. */
  positionX: number;
  cordLength?: number;
  lineLength?: number;
  cd?: number;
}

/** SI. */
export interface ComponentMass {
  key?: string;
  /** Not unique; join on `key`. */
  name: string;
  eachMass: number;
  mass: number;
  /** From the nose tip. */
  cg: number;
}

export interface AeroSweepOptions {
  machMin?: number;
  machMax?: number;
  machStep?: number;
  aoaDeg?: number;
  /** Degrees. */
  thetaDeg?: number;
  /** rad/s; roll damping reads zero without it. */
  rollRate?: number;
  /** [mach, altitude m] pairs. */
  machAlt?: [number, number][];
}

export interface DragCurve {
  total: number[];
  friction: number[];
  pressure: number[];
  base: number[];
}

export interface AeroSweep {
  machs: number[];
  hasNozzle: boolean;
  /** Non-finite cells arrive as null, not 0 (a genuine 0 is valid). */
  nonFinite?: number;
  /** m from the nose tip. */
  cp: number[];
  /** Per radian, kernel reference area. */
  cna: number[];
  powerOff: DragCurve;
  powerOn: DragCurve;
  components: {
    /** Join on this, not `name` (unnamed parts share one). */
    key?: string;
    name: string;
    /** All instances; sums to the rocket's drag. */
    cd: (number | null)[];
    cdInstance?: (number | null)[];
    instances?: number;
    type?: string;
    friction?: (number | null)[];
    pressure?: (number | null)[];
    base?: (number | null)[];
    cna?: (number | null)[];
    /** m from the nose tip. */
    cp?: (number | null)[];
    rollForce?: (number | null)[];
    rollDamp?: (number | null)[];
  }[];
}

/** TeaVM reports a non-finite number as an opaque BigInt RangeError. */
function assertFiniteCurve(motor: MotorSpec): void {
  const problem = curveProblem(motor);
  if (problem) throw new KeyedError(problem.key, problem.values);
}

export class OpenRocketDesign {
  private readonly rawHandle: number;
  private readonly generation: number;

  private constructor(handle: number) {
    this.rawHandle = handle;
    this.generation = engineGeneration;
  }

  private get handle(): number {
    if (this.generation !== engineGeneration) throw new StaleDesignError();
    return this.rawHandle;
  }

  static buildTree(tree: RocketTree): OpenRocketDesign {
    const handle = callEngine('buildRocket', () => eng().buildRocket(JSON.stringify(tree)));
    return new OpenRocketDesign(handle);
  }

  setMotorById(componentId: string, motor: MotorSpec): void {
    assertFiniteCurve(motor);
    callEngine('setMotorById', () =>
      eng().setMotorById(
        this.handle,
        componentId,
        motor.designation,
        motor.diameter,
        motor.length,
        motor.times,
        motor.thrusts,
        motor.masses,
        motor.cgX,
        toKernelDelay(motor.ejectionDelay),
      ),
    );
  }

  setStageActiveById(componentId: string, active: boolean): void {
    callEngine('setStageActiveById', () => eng().setStageActiveById(this.handle, componentId, active));
  }

  /** Call after setMotorById. */
  setMotorIgnitionById(componentId: string, event: IgnitionEvent, delayS = 0): void {
    // An Infinity delay would write `"time":Infinity` into the result JSON.
    if (!Number.isFinite(delayS)) {
      throw new EngineCallError('setMotorIgnitionById', new Error(`delayS must be finite, got ${delayS}`));
    }
    callEngine('setMotorIgnitionById', () => eng().setMotorIgnitionById(this.handle, componentId, event, delayS));
  }

  staticInfo(): StaticInfo {
    const raw = callEngine('staticInfo', () => eng().getStaticInfo(this.handle));
    return parseEnvelope<StaticInfo>('staticInfo', raw);
  }

  componentInfo(componentId: string): ComponentInfo {
    const raw = callEngine('componentInfo', () => eng().getComponentInfo(this.handle, componentId));
    return parseEnvelope<ComponentInfo>('componentInfo', raw);
  }

  aeroSweep(options: AeroSweepOptions = {}): AeroSweep {
    const raw = callEngine('aeroSweep', () =>
      eng().getAeroSweep(
        this.handle,
        JSON.stringify({
          machMin: options.machMin ?? 0.05,
          machMax: options.machMax ?? 3.0,
          machStep: options.machStep ?? 0.05,
          aoaDeg: options.aoaDeg ?? 0,
          thetaDeg: options.thetaDeg ?? 0,
          rollRate: options.rollRate ?? 0,
          machAlt: options.machAlt,
        }),
      ),
    );
    return parseEnvelope<AeroSweep>('aeroSweep', raw);
  }

  worstThetaDeg(mach = 0.3, aoaDeg = 0): number {
    return callEngine('getWorstThetaDeg', () => eng().getWorstThetaDeg(this.handle, mach, aoaDeg));
  }

  componentMasses(): ComponentMass[] {
    const raw = callEngine('componentMasses', () => eng().getComponentMasses(this.handle));
    return parseEnvelope<ComponentMass[]>('componentMasses', raw, true);
  }

  simulate(options: SimulationOptions = {}): FlightResult {
    const raw = callEngine('simulate', () =>
      eng().simulateJson(
        this.handle,
        JSON.stringify({
          rodLength: options.launchRodLength ?? 1.0,
          rodAngle: options.launchRodAngle ?? 0,
          rodDirection: options.launchRodDirection,
          windAverage: options.windAverage ?? 0,
          windStdDeviation: options.windStdDeviation ?? 0,
          windDirection: options.windDirection,
          windLevels: options.windLevels,
          windAltitudeReference: options.windAltitudeReference,
          geodetic: options.geodetic,
          gravityModel: options.gravityModel,
          constantGravity: options.constantGravity,
          maxAngleStep: options.maxAngleStep,
          stepper: options.stepper,
          launchAltitude: options.launchAltitude ?? 0,
          temperature: options.temperature,
          pressure: options.pressure,
          relativeHumidity: options.relativeHumidity,
          atmosphereLevels: options.atmosphereLevels,
          launchLatitude: options.launchLatitude,
          launchLongitude: options.launchLongitude,
          timeStep: options.timeStep ?? 0.05,
          maxTime: options.maxTime,
          randomSeed: options.randomSeed,
          recoverySpeedWarn: options.recoverySpeedWarn,
          mainHighSpeedWarn: options.mainHighSpeedWarn,
          mainLowSpeedWarn: options.mainLowSpeedWarn,
          drogueLowSpeedWarn: options.drogueLowSpeedWarn,
          guideAwareRodClearance: options.guideAwareRodClearance,
          railExitMinSpeed: options.railExitMinSpeed,
          series: options.series,
        }),
      ),
    );
    const parsed = parseEnvelope<FlightResult>('simulate', raw);
    parsed.series = sanitizeSeries(parsed.series);
    if (parsed.branches) {
      for (const b of parsed.branches) b.series = sanitizeSeries(b.series);
    }
    return parsed;
  }
}

const NAMED_SERIES = [
  'time',
  'altitude',
  'velocity',
  'acceleration',
  'mass',
  'thrust',
  'drag',
  'mach',
  'stability',
  'cpLocation',
  'cgLocation',
  'aoa',
] as const;

/** A null in `number[]` throws on `.toFixed` and reads as 0 in arithmetic; the extras keep their nulls. */
export function sanitizeSeries(series: FlightSeries): FlightSeries {
  for (const key of NAMED_SERIES) {
    const arr = series[key] as unknown[] | undefined;
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (typeof v !== 'number') arr[i] = NaN;
    }
  }
  return series;
}

let lengthUnit = 'cm';

/** Not formatting only: the kernel compares airframe step/gap warnings as text in this unit, as desktop does. */
export function setKernelLengthUnit(symbol: string): void {
  lengthUnit = symbol;
  active?.setLengthUnit(symbol);
}

export function kernelLengthUnit(): string {
  return lengthUnit;
}

export function standardPressurePa(altitudeM: number): number | null {
  if (!active) return null;
  return callEngine('standardPressure', () => eng().getStandardPressure(altitudeM));
}

/** 0 to 1 (desktop hides very similar curves at 0.95). Curves are `[time s, thrust N]`. */
export function motorSimilarity(a: [number, number][], b: [number, number][]): number | null {
  if (!active) return null;
  return callEngine('motorSimilarity', () =>
    eng().getMotorSimilarity(
      a.map((p) => p[0]),
      a.map((p) => p[1]),
      b.map((p) => p[0]),
      b.map((p) => p[1]),
    ),
  );
}

export interface MotorStatistics {
  /** s between the crossings of 5% of peak thrust, not to the last sample. */
  burnTime: number;
  averageThrust: number;
  maxThrust: number;
  totalImpulse: number;
}

/** Curve is `[time s, thrust N]`. */
export function motorStatistics(curve: readonly (readonly [number, number])[]): MotorStatistics | null {
  if (!active) return null;
  try {
    const raw = callEngine('motorStatistics', () =>
      eng().getMotorStatistics(
        curve.map((p) => p[0]),
        curve.map((p) => p[1]),
      ),
    );
    return parseEnvelope<MotorStatistics>('motorStatistics', raw);
  } catch {
    return null;
  }
}

export function resetEngine(): void {
  callEngine('reset', () => eng().reset());
  engineGeneration++;
}
