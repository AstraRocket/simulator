import type {
  ComponentNode,
  FlightResult,
  MotorSpec,
  RocketTree,
  SimulationOptions,
} from '../../engine/openRocketEngine';
import { LAUNCH_SI } from '../../prefs/launchUnits';
import { toCatalogMm } from '../motors/catalogUnits';
import type { CatalogMotor } from '../motors/motorDb';
import type { MountFit } from '../motors/motorPicker';
import type { FlightConfig } from './flightConfigs';
import { seriesAt } from './flightEvents';
import { MAIN_BAND, canopyDiameter, siteAirDensity } from './recoverySizing';

// Calm air off a vertical rod: at zero angle of attack the stand-in fins and nose never steer it.

// SI; `cgM` is from the nose tip, without a motor.
export interface SimpleInputs {
  diameterM: number;
  lengthM: number;
  dryMassKg: number;
  mountDiameterM: number;
  fins?: SimpleFins;
  cgM: number;
  chute?: SimpleChute | null;
}

export interface SimpleChute {
  diameterM: number;
  cd: number;
}

export const SIMPLE_CHUTE_CD = 0.8;

export function simpleChuteDiameter(
  dryMassKg: number,
  motor: Pick<MotorSpec, 'masses'> | null,
  launch: Pick<SimpleLaunch, 'launchAltitudeM' | 'temperatureC'>,
  cd: number,
): number {
  const casing = motor?.masses?.length ? motor.masses[motor.masses.length - 1]! : 0;
  const rho = siteAirDensity(launch.launchAltitudeM, launch.temperatureC);
  return canopyDiameter(dryMassKg + casing, MAIN_BAND.target, cd, rho);
}

export const SIMPLE_FIN_SHAPES = ['trapezoid', 'elliptical', 'parabolic'] as const;
export type SimpleFinShape = (typeof SIMPLE_FIN_SHAPES)[number];

export interface SimpleFins {
  count: number;
  shape: SimpleFinShape;
  rootChordM: number | null;
  spanM: number | null;
}

export const SIMPLE_FIN_COUNT = { min: 1, max: 8 } as const;

// Nose length in body diameters.
export const SIMPLE_NOSE_CALIBERS = 4;

// In body diameters.
const FIN = { root: 3, span: 1.5 } as const;

export function simpleFins(i: Pick<SimpleInputs, 'diameterM' | 'fins'>): {
  count: number;
  shape: SimpleFinShape;
  rootChordM: number;
  spanM: number;
} {
  return {
    count: i.fins?.count ?? 3,
    shape: i.fins?.shape ?? 'trapezoid',
    rootChordM: i.fins?.rootChordM ?? FIN.root * i.diameterM,
    spanM: i.fins?.spanM ?? FIN.span * i.diameterM,
  };
}

// The stage mass is pinned, so the wall only shapes the parts.
const WALL_M = 0.0005;

export type SimpleProblem = 'tooShort' | 'finsTooLong' | 'mountTooWide' | 'cgOutside';

export function simpleProblem(i: SimpleInputs): SimpleProblem | null {
  if (simpleBodyLength(i) <= 0) return 'tooShort';
  if (i.cgM <= 0 || i.cgM >= i.lengthM) return 'cgOutside';
  if (simpleFins(i).rootChordM > simpleBodyLength(i)) return 'finsTooLong';
  // A mount too wide for its own tube is minimum diameter, which flies.
  if (i.mountDiameterM >= i.diameterM) return 'mountTooWide';
  return null;
}

export function simpleBodyLength(i: Pick<SimpleInputs, 'diameterM' | 'lengthM'>): number {
  return i.lengthM - i.diameterM * SIMPLE_NOSE_CALIBERS;
}

// Length limit is the body tube, not the mount: a longer motor hangs out the back.
export function simpleMountFit(i: SimpleInputs): MountFit {
  return { bore: toCatalogMm(i.mountDiameterM), maxLength: toCatalogMm(simpleBodyLength(i)) };
}

// 3/32 in, 1/8 in, 3/16 in.
function finThickness(diameterM: number): number {
  if (diameterM < 0.04) return 0.00238125;
  if (diameterM < 0.08) return 0.003175;
  return 0.0047625;
}

// Points run root leading edge to root trailing edge, as OpenRocket's do.
export function parabolicOutline(rootChordM: number, spanM: number, steps = 12): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const x = k / steps;
    pts.push([x * rootChordM, spanM * (1 - (1 - x) ** 2)]);
  }
  pts.push([rootChordM, 0]);
  return pts;
}

function finNode(i: SimpleInputs): Record<string, unknown> {
  const f = simpleFins(i);
  const common = {
    id: 'fins',
    finCount: f.count,
    thickness: finThickness(i.diameterM),
    position: { method: 'bottom', offset: 0 },
  };
  if (f.shape === 'elliptical') {
    return { type: 'ellipticalfinset', ...common, rootChord: f.rootChordM, height: f.spanM };
  }
  if (f.shape === 'parabolic') {
    return { type: 'freeformfinset', ...common, points: parabolicOutline(f.rootChordM, f.spanM) };
  }
  return {
    type: 'trapezoidfinset',
    ...common,
    rootChord: f.rootChordM,
    tipChord: f.rootChordM / 2,
    sweep: f.rootChordM / 2,
    height: f.spanM,
  };
}

export const SIMPLE_MOUNT_ID = 'mount';

export function simpleMinDiameter(i: Pick<SimpleInputs, 'diameterM' | 'mountDiameterM'>): boolean {
  return i.mountDiameterM / 2 + 2 * WALL_M >= i.diameterM / 2;
}

export function simpleRocketTree(i: SimpleInputs, motor: Pick<MotorSpec, 'length'>): RocketTree {
  const d = i.diameterM;
  const r = d / 2;
  const mountR = i.mountDiameterM / 2;
  const nose = {
    type: 'nosecone',
    id: 'nose',
    shape: 'ogive',
    length: d * SIMPLE_NOSE_CALIBERS,
    aftRadius: r,
    aftRadiusAuto: false,
    thickness: WALL_M,
  };
  if (simpleMinDiameter(i)) {
    const body = {
      type: 'bodytube',
      id: SIMPLE_MOUNT_ID,
      length: simpleBodyLength(i),
      outerRadius: r,
      outerRadiusAuto: false,
      thickness: r - mountR,
      motorMount: true,
      motorOverhang: 0,
      children: [finNode(i), ...chuteNode(i, mountR)],
    };
    return simpleTree(i, [nose, body]);
  }
  const body = {
    type: 'bodytube',
    id: 'body',
    length: simpleBodyLength(i),
    outerRadius: r,
    outerRadiusAuto: false,
    thickness: WALL_M,
    children: [
      finNode(i),
      ...chuteNode(i, r - WALL_M),
      {
        type: 'innertube',
        id: SIMPLE_MOUNT_ID,
        motorMount: true,
        length: motor.length,
        outerRadius: mountR + WALL_M,
        outerRadiusAuto: false,
        thickness: WALL_M,
        motorOverhang: 0,
        position: { method: 'bottom', offset: 0 },
      },
    ],
  };
  return simpleTree(i, [nose, body]);
}

function chuteNode(i: SimpleInputs, innerR: number): Record<string, unknown>[] {
  if (!i.chute) return [];
  return [
    {
      type: 'parachute',
      id: 'chute',
      diameter: i.chute.diameterM,
      cd: i.chute.cd,
      lineCount: 6,
      lineLength: 1.5 * i.chute.diameterM,
      radius: Math.min(0.0125, innerR * 0.9),
      length: 0.025,
      deployEvent: 'ejection',
      deployDelay: 0,
      position: { method: 'top', offset: 0 },
    },
  ];
}

function simpleTree(i: SimpleInputs, parts: Record<string, unknown>[]): RocketTree {
  return {
    name: 'Simple rocket',
    components: [
      {
        type: 'stage',
        id: 's1',
        // The motor is not a subcomponent, so its mass is still added and burned off.
        overrideMass: i.dryMassKg,
        overrideSubcomponentsMass: true,
        // The stage starts at the nose tip, so its CG is the rocket's.
        overrideCGX: i.cgM,
        overrideSubcomponentsCG: true,
        children: parts,
      } as unknown as ComponentNode,
    ],
  };
}

export function simpleConfig(spec: MotorSpec): FlightConfig {
  return { id: 'simple', name: null, motors: { [SIMPLE_MOUNT_ID]: { spec } } };
}

// SI, except temperature in °C (null for the standard atmosphere).
export interface SimpleLaunch {
  rodLengthM: number;
  launchAltitudeM: number;
  temperatureC: number | null;
}

// Always calm and vertical: with wind or rod angle the made-up fins would steer the flight.
export function simpleOptions(l: SimpleLaunch): SimulationOptions {
  return {
    launchRodLength: l.rodLengthM,
    launchRodAngle: 0,
    windAverage: 0,
    windStdDeviation: 0,
    launchAltitude: l.launchAltitudeM,
    temperature: l.temperatureC != null ? LAUNCH_SI.degC.toSi(l.temperatureC) : undefined,
    // Full, for the thrust-to-weight series the summary set leaves out.
    series: 'full',
  };
}

export const SIMPLE_MACH_CAUTION = 0.8;

// SI; null where the flight did not produce one.
export interface SimpleFigures {
  railExit: number;
  railTwr: number | null;
  maxAcceleration: number;
  burnoutTime: number | null;
  burnoutAltitude: number | null;
  apogee: number;
  maxVelocity: number;
  maxMach: number;
  timeToApogee: number;
  optimumDelay: number | null;
  // Calibers.
  railStability: number | null;
  deployVelocity: number | null;
  landingVelocity: number | null;
  flightTime: number | null;
}

// Calibers.
export const SIMPLE_STABILITY_MIN = 1;

export const SIMPLE_GUIDE_MAX = 16;

export interface SimpleGuideRow {
  key: string;
  motor: CatalogMotor;
  spec: MotorSpec;
  figures: SimpleFigures;
  nearest: number | null;
}

export interface SimpleGuideFailure {
  key: string;
  motor: CatalogMotor;
  reason: string;
}

export interface SimpleGuide {
  key: string;
  asked: number;
  partial: boolean;
  rows: SimpleGuideRow[];
  failed: SimpleGuideFailure[];
}

const finite = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

// Without a parachute nothing after apogee is read: the descent is a meaningless tumble.
export function simpleFigures(result: FlightResult, chute = false): SimpleFigures {
  const s = result.summary;
  const at = (series: string, time: number | undefined) =>
    time == null ? null : finite(seriesAt(result.series, series, time));
  const rodTime = result.events.find((e) => e.type === 'LAUNCHROD')?.time;
  const burnout = result.events.filter((e) => e.type === 'BURNOUT').pop()?.time;
  return {
    railExit: s.launchRodVelocity,
    railTwr: at('Twr', rodTime),
    maxAcceleration: s.maxAcceleration,
    burnoutTime: burnout ?? null,
    burnoutAltitude: at('altitude', burnout),
    apogee: s.maxAltitude,
    maxVelocity: s.maxVelocity,
    maxMach: s.maxMachNumber,
    timeToApogee: s.timeToApogee,
    optimumDelay: finite(s.optimumDelay),
    railStability: at('stability', rodTime),
    deployVelocity: chute ? finite(s.deploymentVelocity) : null,
    landingVelocity: chute ? finite(s.groundHitVelocity) : null,
    flightTime: chute ? finite(s.flightTime) : null,
  };
}
