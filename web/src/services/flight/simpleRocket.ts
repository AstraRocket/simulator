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

/**
 * The simple rocket: a few numbers anyone can measure with a tape, a scale and a balance point,
 * flown through the real kernel.
 *
 * thrustcurve.org's Motor Guide answers "how high on this motor" from a point
 * mass and a drag coefficient the user is asked to type. Nobody knows their
 * rocket's Cd, so this asks for the size instead and lets OpenRocket compute the
 * drag the way it does for any design: a 4:1 ogive nose, one body tube and the
 * user's fins (count, shape, length and width, any of them left to stand-ins),
 * every part at the kernel's default finish, with the whole stage pinned to the
 * mass the user weighed.
 *
 * The nose is made up, which is why the flight is pinned to calm air off a
 * vertical rod: at zero angle of attack the fins make no normal force, so the
 * stand-in nose never steers the trajectory. Stability is still reported, from
 * the CG the user measured and their fins, against the stand-in nose. What the
 * made-up nose still touches is drag, so apogee is an estimate; rail-exit speed
 * and thrust-to-weight barely depend on drag.
 *
 * A parachute is optional. With one, it opens on the motor's ejection charge
 * and the flight runs to the ground; without one, nothing after apogee is read.
 *
 * The tree is a real design, too: "Open as a design" starts one from it.
 */

/** What the user measured. SI. */
export interface SimpleInputs {
  /** Outer diameter of the body. */
  diameterM: number;
  /** Nose tip to aft end. */
  lengthM: number;
  /** The rocket without a motor. */
  dryMassKg: number;
  /** Inner diameter of the motor mount: the widest motor it takes. */
  mountDiameterM: number;
  /** The fins, as far as the user cares to say; stand-ins where they don't. */
  fins?: SimpleFins;
  /** The balance point without a motor, from the nose tip. */
  cgM: number;
  /** The parachute, opened by the motor's ejection charge; none flies the rocket without one. */
  chute?: SimpleChute | null;
}

/** A parachute as flown: its size already settled (see `simpleChuteDiameter`). */
export interface SimpleChute {
  diameterM: number;
  cd: number;
}

/** A canopy's Cd when the user gives none: a flat or hemispherical round chute, the app's default. */
export const SIMPLE_CHUTE_CD = 0.8;

/**
 * The canopy that lands the rocket at the main band's target rate (18 ft/s):
 * the dry mass plus the motor's spent casing, under the site's air. With no
 * motor yet, the dry mass alone.
 */
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

/** Fin outlines the simple rocket can build. */
export const SIMPLE_FIN_SHAPES = ['trapezoid', 'elliptical', 'parabolic'] as const;
export type SimpleFinShape = (typeof SIMPLE_FIN_SHAPES)[number];

/**
 * The fins, every field optional. A blank length or width takes the stand-in's
 * proportions for this body, so a rocket described only by its size still has
 * fins to fly with.
 */
export interface SimpleFins {
  count: number;
  shape: SimpleFinShape;
  /** Root chord: along the body, where the fin is glued. */
  rootChordM: number | null;
  /** Span: from the body out to the tip. */
  spanM: number | null;
}

/** The fewest and most fins the form offers. */
export const SIMPLE_FIN_COUNT = { min: 1, max: 8 } as const;

/** Nose length in body diameters: a 4:1 ogive. */
export const SIMPLE_NOSE_CALIBERS = 4;

/**
 * The stand-in fin, in body diameters, for whatever the user leaves blank: a
 * sport model's proportions, big enough that a long body is not left marginal
 * by fins smaller than the ones it would really carry.
 */
const FIN = { root: 3, span: 1.5 } as const;

/** The fins as flown: the user's where given, the stand-in's where not. */
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

/** A thin wall for the tubes. The stage mass is pinned, so it only shapes the parts. */
const WALL_M = 0.0005;

/** Why these inputs cannot be flown, or null when they can. */
export type SimpleProblem = 'tooShort' | 'finsTooLong' | 'mountTooWide' | 'cgOutside';

export function simpleProblem(i: SimpleInputs): SimpleProblem | null {
  if (simpleBodyLength(i) <= 0) return 'tooShort';
  if (i.cgM <= 0 || i.cgM >= i.lengthM) return 'cgOutside';
  // The fin root has to fit on the body tube, which is all there is behind the nose.
  if (simpleFins(i).rootChordM > simpleBodyLength(i)) return 'finsTooLong';
  // A mount as wide as the body leaves no wall. Anything narrower flies: a
  // mount with no room for its own tube is the body itself (minimum diameter).
  if (i.mountDiameterM >= i.diameterM) return 'mountTooWide';
  return null;
}

/** The body tube's length: everything aft of the nose. */
export function simpleBodyLength(i: Pick<SimpleInputs, 'diameterM' | 'lengthM'>): number {
  return i.lengthM - i.diameterM * SIMPLE_NOSE_CALIBERS;
}

/**
 * Which motors the simple rocket takes, as the motor browser's fit filter reads it:
 * no wider than the mount, no longer than the body tube. Not the mount's
 * length: a motor longer than its mount hangs out the back on a retainer and
 * flies fine.
 */
export function simpleMountFit(i: SimpleInputs): MountFit {
  return { bore: toCatalogMm(i.mountDiameterM), maxLength: toCatalogMm(simpleBodyLength(i)) };
}

/**
 * Fin stock by body size, the sheet a fin that size is cut from: 3/32 in on
 * a minimum-diameter sport model, 1/8 in up to about 3 in, 3/16 in past it.
 */
function finThickness(diameterM: number): number {
  if (diameterM < 0.04) return 0.00238125;
  if (diameterM < 0.08) return 0.003175;
  return 0.0047625;
}

/**
 * A parabolic fin as a freeform outline: the leading edge a parabola rising
 * from the root's leading edge to the tip, which sits over the trailing edge,
 * and a straight trailing edge back down to the root. Points run from the root
 * leading edge around to the root trailing edge, as OpenRocket's do.
 */
export function parabolicOutline(rootChordM: number, spanM: number, steps = 12): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const x = k / steps;
    pts.push([x * rootChordM, spanM * (1 - (1 - x) ** 2)]);
  }
  pts.push([rootChordM, 0]);
  return pts;
}

/** The fin set node for these fins, at the tail of the body tube. */
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
  // A clipped delta with a square trailing edge: the tip half the root, swept
  // back so its trailing edge lines up with the root's.
  return {
    type: 'trapezoidfinset',
    ...common,
    rootChord: f.rootChordM,
    tipChord: f.rootChordM / 2,
    sweep: f.rootChordM / 2,
    height: f.spanM,
  };
}

/** The mount node's id, which the flight configuration seats the motor in. */
export const SIMPLE_MOUNT_ID = 'mount';

/**
 * Whether the motor goes straight in the body tube: no room between them for
 * an inner tube's two walls, as on a 29 mm motor in a 30 mm body.
 */
export function simpleMinDiameter(i: Pick<SimpleInputs, 'diameterM' | 'mountDiameterM'>): boolean {
  return i.mountDiameterM / 2 + 2 * WALL_M >= i.diameterM / 2;
}

/**
 * The simple rocket as a component tree, with a mount as long as `motor` so
 * whatever motor is picked sits flush with the tail.
 */
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
  // Minimum diameter: the body is the mount, its wall whatever the motor leaves.
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

/**
 * The parachute, packed at the top of the body tube and opened by the motor's
 * ejection charge. Its own mass is the stage override's, like every part's.
 */
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
      // Packed to fit whatever the tube leaves, at the default packed length.
      radius: Math.min(0.0125, innerR * 0.9),
      length: 0.025,
      deployEvent: 'ejection',
      deployDelay: 0,
      position: { method: 'top', offset: 0 },
    },
  ];
}

/** The stage around the parts, pinned to the weighed mass and measured CG. */
function simpleTree(i: SimpleInputs, parts: Record<string, unknown>[]): RocketTree {
  return {
    name: 'Simple rocket',
    components: [
      {
        type: 'stage',
        id: 's1',
        // The weighed mass in place of every part's own, so the made-up parts
        // weigh nothing of their own. The motor is not a subcomponent: its mass
        // is added and burned off as on any design.
        overrideMass: i.dryMassKg,
        overrideSubcomponentsMass: true,
        // The measured balance point likewise. The stage starts at the nose
        // tip, so its own CG is the rocket's.
        overrideCGX: i.cgM,
        overrideSubcomponentsCG: true,
        children: parts,
      } as unknown as ComponentNode,
    ],
  };
}

/** The motor seated in the simple rocket's mount. */
export function simpleConfig(spec: MotorSpec): FlightConfig {
  return { id: 'simple', name: null, motors: { [SIMPLE_MOUNT_ID]: { spec } } };
}

/** Where the simple rocket flies from. SI, except temperature, which is the form's °C. */
export interface SimpleLaunch {
  rodLengthM: number;
  launchAltitudeM: number;
  /** Null for the standard atmosphere. */
  temperatureC: number | null;
}

/**
 * Calm air off a vertical rod, every time: no wind, no turbulence, no rod
 * angle. With any of them the made-up fins would steer the flight.
 */
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

/**
 * Above this Mach the drag estimate is the weak part of the answer: the
 * made-up nose and fins carry more of the drag near Mach 1. A note on the
 * figures, not a verdict on the motor.
 */
export const SIMPLE_MACH_CAUTION = 0.8;

/** What the simple rocket's flight says. SI; null where the flight did not produce one. */
export interface SimpleFigures {
  /** Speed off the rod. */
  railExit: number;
  /** Thrust-to-weight at rod exit. */
  railTwr: number | null;
  maxAcceleration: number;
  burnoutTime: number | null;
  /** Altitude above the pad at burnout. */
  burnoutAltitude: number | null;
  apogee: number;
  maxVelocity: number;
  maxMach: number;
  timeToApogee: number;
  /** Coast from burnout to apogee, the kernel's figure. */
  optimumDelay: number | null;
  /** Stability margin off the rod, in calibers: the user's CG and fins, the stand-in nose. */
  railStability: number | null;
  /** Speed when the parachute opened; null without one. */
  deployVelocity: number | null;
  /** Speed at touchdown under the parachute; null without one. */
  landingVelocity: number | null;
  /** Liftoff to touchdown; null without a parachute. */
  flightTime: number | null;
}

/** Under this margin (calibers) off the rod, the stability figure is flagged. */
export const SIMPLE_STABILITY_MIN = 1;

/**
 * The most motors one simple-rocket guide may fly. Each is one flight, or two
 * with a parachute (the second at the nearest delay, as a design's guide
 * flies). The simple rocket is a handful of parts, so its flights are quick.
 */
export const SIMPLE_GUIDE_MAX = 16;

/** One candidate as the simple rocket flew it. */
export interface SimpleGuideRow {
  /** `keyOf` the catalog row. */
  key: string;
  motor: CatalogMotor;
  /** The motor as seated, at the nearest delay it is sold with when it has one. */
  spec: MotorSpec;
  figures: SimpleFigures;
  /** The nearest delay the motor is sold with to the ideal one; null when it offers none. */
  nearest: number | null;
}

/** A candidate that produced no row, and why. */
export interface SimpleGuideFailure {
  key: string;
  motor: CatalogMotor;
  reason: string;
}

/** One finished simple-rocket guide. */
export interface SimpleGuide {
  /** What it was flown from (`simpleKey`), so an edit makes it stale. */
  key: string;
  asked: number;
  /** Canceled part way: the rows are whole, the set is not. */
  partial: boolean;
  rows: SimpleGuideRow[];
  failed: SimpleGuideFailure[];
}

const finite = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

/**
 * The figures a simple-rocket flight is read for. With no parachute, nothing
 * after apogee: the descent is a tumble that says nothing about the user's
 * rocket.
 */
export function simpleFigures(result: FlightResult, chute = false): SimpleFigures {
  const s = result.summary;
  const at = (series: string, time: number | undefined) =>
    time == null ? null : finite(seriesAt(result.series, series, time));
  const rodTime = result.events.find((e) => e.type === 'LAUNCHROD')?.time;
  // The last burnout, which is the motor's on a single-motor rocket.
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
