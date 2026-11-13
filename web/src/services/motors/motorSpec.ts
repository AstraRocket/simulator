import { must } from '../app/must';
import { fromCatalog } from './catalogUnits';
import type { MotorSpec } from '../../engine/openRocketEngine';
import type { CatalogMotor } from './motorDb';
import { cumulativeImpulse } from './motorMath';
import { getMotorStore, isMotorType, motorHeaderProblem, type CustomMotor } from './motorStore';
import { finalizeCurve } from './curveFinalize';
import { KeyedError } from '../../i18n/keyedError';

/** In catalog units: mm and g. */
interface MotorMeta {
  designation: string;
  manufacturerAbbrev: string;
  diameter: number;
  length: number;
  totalWeightG: number;
  propWeightG: number;
}

interface ThrustSample {
  time: number;
  thrust: number;
}

/** Without measured masses, mass falls with cumulative impulse and CG is half the length, as OpenRocket does. */
export function samplesToMotorSpec(
  motor: MotorMeta,
  samples: ThrustSample[],
  ejectionDelay: number,
  cgSamples?: [number, number][],
  /** kg, parallel to `samples`; ignored unless it matches them one for one. */
  massSamples?: number[],
): MotorSpec {
  const measured = massSamples?.length === samples.length ? massSamples : undefined;
  if (samples.length === 0) {
    throw new KeyedError('errors.thrustcurve.noSamples', { motor: motor.designation });
  }
  const pts = finalizeCurve(samples.map((s, i) => ({ ...s, mass: measured?.[i] })));

  // Missing weights make TeaVM throw "cannot be converted to a BigInt" in the kernel.
  if (!Number.isFinite(motor.totalWeightG) || !Number.isFinite(motor.propWeightG)) {
    throw new KeyedError('errors.thrustcurve.noWeight', { motor: motor.designation });
  }
  const problem = motorHeaderProblem(motor);
  if (problem === 'numbers' || problem === 'size') {
    throw new KeyedError('errors.thrustcurve.badSize', {
      motor: motor.designation,
      diameter: motor.diameter,
      length: motor.length,
    });
  }
  if (problem === 'mass') throw new KeyedError('errors.thrustcurve.badWeight', { motor: motor.designation });
  if (problem === 'propOverTotal') {
    throw new KeyedError('errors.thrustcurve.propOverTotal', {
      motor: motor.designation,
      prop: motor.propWeightG,
      total: motor.totalWeightG,
    });
  }

  if (pts.some((p) => p.thrust < 0)) {
    throw new KeyedError('errors.thrustcurve.negativeThrust', { motor: motor.designation });
  }
  const cgX = cgSamples?.[0]?.[1] ?? motor.length / 2000;
  if (!Number.isFinite(cgX) || cgX < 0 || cgX > fromCatalog(motor.length)) {
    throw new KeyedError('errors.thrustcurve.badCg', { motor: motor.designation, length: motor.length });
  }

  const totalMass = fromCatalog(motor.totalWeightG);
  const propMass = fromCatalog(motor.propWeightG);

  const times = pts.map((p) => p.time);
  const thrusts = pts.map((p) => p.thrust);
  const cumImpulse = cumulativeImpulse(times, thrusts);
  const totImpulse = cumImpulse[cumImpulse.length - 1]!;
  // Matches `AbstractMotorLoader.calculateMass`.
  const masses = measured
    ? pts.map((p) => must(p.mass, 'measured mass'))
    : cumImpulse.map((impulse) => (totImpulse > 0 ? totalMass - propMass * (impulse / totImpulse) : totalMass));

  return {
    designation: motor.designation,
    manufacturer: motor.manufacturerAbbrev,
    diameter: fromCatalog(motor.diameter),
    length: fromCatalog(motor.length),
    times,
    thrusts,
    masses,
    // m from the motor's forward end.
    cgX,
    ejectionDelay,
  };
}

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
    // Stored in mm and grams; the spec wants m and kg.
    cm.cgMm === undefined ? undefined : [[0, fromCatalog(cm.cgMm)]],
    cm.massesG?.map(fromCatalog),
  );
  return { ...spec, imported: true, ...(cm.type ? { type: cm.type } : {}) };
}
