import type { MotorSpec } from '../../engine/openRocketEngine';
import type { CatalogMotor } from './motorDb';
import { cumulativeImpulse } from './motorMath';
import { getMotorStore, isMotorType, type CustomMotor } from './motorStore';
import { finalizeCurve } from './curveFinalize';
import { KeyedError } from '../../i18n/keyedError';

/**
 * Catalog rows and imported motor files as flyable {@link MotorSpec}s, built
 * entirely from what is on this device.
 *
 * Nothing here touches the network. Every catalog motor's curve is bundled by
 * the build-time sync (scripts/sync-motors.mjs), which asks thrustcurve.org for
 * every motor's files; a motor the sync found no curve for has none to fetch at
 * pick time either, so it is refused rather than looked up again. An imported
 * `.eng` / `.rse` carries its own curve.
 *
 * Catalog units are mm / grams; converted to the engine's SI at the boundary here.
 */

/** The figures beyond the curve a MotorSpec is built from, in catalog units. */
interface MotorMeta {
  designation: string;
  manufacturerAbbrev: string;
  /** mm */
  diameter: number;
  /** mm */
  length: number;
  totalWeightG: number;
  propWeightG: number;
}

interface ThrustSample {
  time: number;
  thrust: number;
}

/**
 * Pure transform: thrust samples + catalog metadata → engine MotorSpec.
 * Mass at each sample time interpolates from total weight down to burnout
 * weight proportionally to cumulative impulse (trapezoidal), matching how
 * OpenRocket treats .eng files. CG uses the file's real launch CG (`cgSamples`,
 * from the RockSim data) when available, else falls back to half the motor
 * length, the same approximation OpenRocket applies to RASP data without CG.
 */
export function samplesToMotorSpec(
  motor: MotorMeta,
  samples: ThrustSample[],
  ejectionDelay: number,
  cgSamples?: [number, number][],
  /**
   * Mass at each sample, kg, parallel to `samples` before the normalization
   * below. Only a `.rse` import has one: the format measures the mass curve
   * rather than leaving it to be reconstructed. Ignored unless it matches the
   * samples one for one, because a column that has to be stretched to fit is a
   * guess, not a measurement.
   */
  massSamples?: number[],
): MotorSpec {
  // Normalize, as desktop's motor loader does. A supplied mass column rides
  // along through every step rather than being indexed separately afterward,
  // so a file whose samples are not in time order cannot end up with its masses
  // against the wrong times, and an added t=0 point takes the first mass (the
  // loaded mass) rather than shifting the whole column by one.
  const measured = massSamples?.length === samples.length ? massSamples : undefined;
  if (samples.length === 0) {
    throw new KeyedError('errors.thrustcurve.noSamples', { motor: motor.designation });
  }
  // Into the shape the kernel takes: from t = 0, one thrust per time (curveFinalize).
  const pts = finalizeCurve(samples.map((s, i) => ({ ...s, mass: measured?.[i] })));

  // thrustcurve.org's catalog is not uniformly populated: some entries publish
  // no loaded/propellant weight, and a few list more propellant than loaded
  // mass. Without this guard those become NaN / negative masses that reach the
  // kernel, where TeaVM throws a raw "cannot be converted to a BigInt" and the
  // whole design blanks. Refuse with something a rocketeer can act on.
  if (!Number.isFinite(motor.totalWeightG) || !Number.isFinite(motor.propWeightG)) {
    throw new KeyedError('errors.thrustcurve.noWeight', { motor: motor.designation });
  }
  // A negative propellant mass makes the mass rise over the burn, and a loaded
  // mass of zero or less leaves nothing to fly; the kernel refuses neither.
  if (motor.propWeightG < 0 || !(motor.totalWeightG > 0)) {
    throw new KeyedError('errors.thrustcurve.badWeight', { motor: motor.designation });
  }
  if (motor.propWeightG > motor.totalWeightG) {
    throw new KeyedError('errors.thrustcurve.propOverTotal', {
      motor: motor.designation,
      prop: motor.propWeightG,
      total: motor.totalWeightG,
    });
  }
  // diameter/length feed kernel geometry (÷1000 → m); a malformed/compromised
  // catalog entry with a non-finite or non-positive size would NaN/blank the design.
  const badSize = (v: number) => !Number.isFinite(v) || v <= 0;
  if (badSize(motor.diameter) || badSize(motor.length)) {
    throw new KeyedError('errors.thrustcurve.badSize', {
      motor: motor.designation,
      diameter: motor.diameter,
      length: motor.length,
    });
  }

  // ThrustCurveMotor.Builder.build() refuses a negative thrust and a CG
  // outside the motor, and the bridge builds every seated motor through it.
  // Refused here with the motor named rather than as a raw kernel message.
  if (pts.some((p) => p.thrust < 0)) {
    throw new KeyedError('errors.thrustcurve.negativeThrust', { motor: motor.designation });
  }
  const cgX = cgSamples?.[0]?.[1] ?? motor.length / 2000;
  if (!Number.isFinite(cgX) || cgX < 0 || cgX > motor.length / 1000) {
    throw new KeyedError('errors.thrustcurve.badCg', { motor: motor.designation, length: motor.length });
  }

  const totalMass = motor.totalWeightG / 1000;
  const propMass = motor.propWeightG / 1000;

  const times = pts.map((p) => p.time);
  const thrusts = pts.map((p) => p.thrust);
  const cumImpulse = cumulativeImpulse(times, thrusts);
  const totImpulse = cumImpulse[cumImpulse.length - 1]!;
  // The file's own mass curve when it has one, else the reconstruction: mass
  // falls from loaded to burnout in proportion to cumulative impulse. That is
  // what OpenRocket does for a RASP file and, via `AbstractMotorLoader
  // .calculateMass`, for a `.rse` that asks for its mass to be auto-calculated:
  // the same arithmetic, so `.rse` import ports no copy of it.
  const masses = measured
    ? pts.map((p) => p.mass!)
    : cumImpulse.map((impulse) => (totImpulse > 0 ? totalMass - propMass * (impulse / totImpulse) : totalMass));

  return {
    designation: motor.designation,
    manufacturer: motor.manufacturerAbbrev,
    diameter: motor.diameter / 1000,
    length: motor.length / 1000,
    times,
    thrusts,
    masses,
    // Real launch CG from the file (m from nose) when the sync bundled it, else
    // mid-length, matching OpenRocket, which reads CG from the RockSim file and
    // falls back to half-length for RASP-only motors.
    cgX,
    ejectionDelay,
  };
}

/**
 * The full MotorSpec for a catalog row: an imported motor from its stored
 * file, a catalog motor from its bundled curve (`curveIndex` picks among
 * several). A catalog motor without a bundled curve is refused: the sync asked
 * thrustcurve.org for it and found none, so there is nothing to fly.
 */
export async function catalogMotorSpec(cat: CatalogMotor, ejectionDelay: number, curveIndex = 0): Promise<MotorSpec> {
  const spec = await buildMotorSpec(cat, ejectionDelay, curveIndex);
  return cat.code && cat.code !== cat.designation ? { ...spec, code: cat.code } : spec;
}

async function buildMotorSpec(cat: CatalogMotor, ejectionDelay: number, curveIndex: number): Promise<MotorSpec> {
  if (cat.custom && cat.id) {
    const id = cat.id;
    const cm = (await getMotorStore().listCustomMotors()).find((m) => m.id === id);
    if (!cm) {
      throw new KeyedError('errors.thrustcurve.importGone', { motor: cat.designation });
    }
    return customMotorToSpec(cm, ejectionDelay);
  }

  const curve = cat.curves?.[curveIndex] ?? cat.curves?.[0];
  if (!curve || curve.samples.length === 0 || cat.length == null || cat.propWeightG == null) {
    throw new KeyedError('errors.thrustcurve.noCurve', { motor: cat.designation });
  }
  const spec = samplesToMotorSpec(
    {
      designation: cat.designation,
      manufacturerAbbrev: cat.manufacturer,
      diameter: cat.diameter,
      length: cat.length,
      totalWeightG: cat.mass,
      propWeightG: cat.propWeightG,
    },
    curve.samples.map(([time, thrust]) => ({ time, thrust })),
    ejectionDelay,
    cat.cg,
  );
  return { ...spec, curveSrc: curve.src, ...(isMotorType(cat.type) ? { type: cat.type } : {}) };
}

/**
 * A parsed `.eng` / `.rse` motor as a flyable {@link MotorSpec}.
 *
 * Exported because such a motor does not have to be in the user's own custom
 * list to be flyable: a `.ork` from the desktop embeds the thrust curve of every
 * motor it uses, and `loadOrk` builds a spec straight from one of those rather
 * than leaving the mount empty. Nothing is written to the store on that path -
 * the curve belongs to the design that carried it, not to the user's catalog.
 */
export function customMotorToSpec(cm: CustomMotor, ejectionDelay: number): MotorSpec {
  const spec = samplesToMotorSpec(
    {
      designation: cm.designation,
      manufacturerAbbrev: cm.manufacturer,
      diameter: cm.diameter,
      length: cm.length,
      totalWeightG: cm.totalWeightG,
      propWeightG: cm.propWeightG,
    },
    cm.samples,
    ejectionDelay,
    // Both are `.rse`-only, and both are stored in the file's units: the CG as a
    // launch value in mm from the motor's forward end (the spec wants m), the
    // masses in grams (the spec wants kg).
    cm.cgMm === undefined ? undefined : [[0, cm.cgMm / 1000]],
    cm.massesG?.map((g) => g / 1000),
  );
  // The type rides along so a save writes the curve back under it.
  return { ...spec, imported: true, ...(cm.type ? { type: cm.type } : {}) };
}
