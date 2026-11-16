// Port of OpenRocket's `file/motor/RockSimMotorLoader.java`; `rseParser.test.ts` holds its mass math to `samplesToMotorSpec`.
import { customMotorId, MAX_MOTOR_MASS_G, motorHeaderProblem, type CustomMotor } from './motorStore';
import { impulseClass } from './motorCombine';
import { delayList } from './motorPicker';
import { totalImpulse } from './motorMath';
import { parseXmlText } from '../files/xmlUtil';
import { readDecimal } from '../files/numberText';
import { MAX_CURVE_SAMPLES, MAX_THRUST_N, finalizeCurve, finalizeThrustCurve, sortLists } from './curveFinalize';
import { rseMotorDigest } from './motorDigest';
import { KeyedError } from '../../i18n/keyedError';

const TYPES: Record<string, NonNullable<CustomMotor['type']>> = {
  'single-use': 'SU',
  hybrid: 'hybrid',
  reloadable: 'reload',
};

/** `loadOrk` parses every `.rse` in an untrusted `.ork`; caps a crafted file. */
export const MAX_RSE_ENGINES = 2000;

interface Point {
  time: number;
  thrust: number;
  /** Grams; NaN when absent. */
  mass: number;
  /** Millimeters from the motor's forward end; NaN when absent. */
  cg: number;
}

/** Same regex as `AbstractMotorLoader.removeDelay`. */
export function removeDelay(designation: string): string {
  return /-([0-9]+|[pP])$/.test(designation) ? designation.slice(0, designation.lastIndexOf('-')) : designation;
}

function num(el: Element, name: string, whatKey: string): number {
  const raw = el.getAttribute(name);
  if (raw === null) throw new KeyedError('errors.motorFile.rseMissing', { what: { key: whatKey } });
  // Plain decimal only: `Number` would read '' as 0 and "0x10" as 16.
  const v = readDecimal(raw);
  if (!Number.isFinite(v)) throw new KeyedError('errors.motorFile.rseInvalid', { what: { key: whatKey }, raw });
  return v;
}

function optNum(el: Element, name: string): number {
  const raw = el.getAttribute(name);
  if (raw === null) return NaN;
  const v = readDecimal(raw);
  return Number.isFinite(v) ? v : NaN;
}

function parseEngine(el: Element): { motor: CustomMotor; digest: string } {
  const manufacturer = el.getAttribute('mfg')?.trim();
  if (!manufacturer) throw new KeyedError('errors.motorFile.rseNoMaker');
  const code = el.getAttribute('code')?.trim();
  if (!code) throw new KeyedError('errors.motorFile.rseNoCode');
  const designation = removeDelay(code);

  // Kept in mm and grams, unlike upstream; `samplesToMotorSpec` converts to SI.
  const diameter = num(el, 'dia', 'errors.motorFile.attrDiameter');
  const length = num(el, 'len', 'errors.motorFile.attrLength');
  const totalWeightG = num(el, 'initWt', 'errors.motorFile.attrInitialMass');
  const propWeightG = num(el, 'propWt', 'errors.motorFile.attrPropellantMass');

  // `num` has refused a non-number already.
  const problem = motorHeaderProblem({ diameter, length, totalWeightG, propWeightG });
  if (problem === 'numbers' || problem === 'size')
    throw new KeyedError('errors.motorFile.rseSize', { motor: designation });
  if (problem === 'oversize') throw new KeyedError('errors.motorFile.oversize', { motor: designation });
  if (problem) throw new KeyedError('errors.motorFile.rseMass', { motor: designation });

  const sampleEls = el.querySelectorAll('data > eng-data');
  if (sampleEls.length > MAX_CURVE_SAMPLES) {
    throw new KeyedError('errors.motorFile.rseTooManyPoints', { motor: designation, max: MAX_CURVE_SAMPLES });
  }
  const rows: Point[] = [...sampleEls].map((d) => ({
    time: optNum(d, 't'),
    thrust: optNum(d, 'f'),
    mass: optNum(d, 'm'),
    cg: optNum(d, 'cg'),
  }));
  for (const r of rows) {
    if (!Number.isFinite(r.time) || !Number.isFinite(r.thrust)) {
      throw new KeyedError('errors.motorFile.rseBadPoint', { motor: designation });
    }
    if (r.time < 0) throw new KeyedError('errors.motorFile.rseNegativeTime', { motor: designation });
  }
  const points = finalizeCurve(rows);
  if (points.length < 2) throw new KeyedError('errors.motorFile.rseNoCurve', { motor: designation });

  if (points.some((p) => p.thrust < 0)) {
    throw new KeyedError('errors.motorFile.rseNegativeThrust', { motor: designation });
  }
  if (points.some((p) => p.thrust > MAX_THRUST_N)) {
    throw new KeyedError('errors.motorFile.rseThrustTooHigh', { motor: designation });
  }
  if (!points.some((p) => p.thrust > 0)) {
    throw new KeyedError('errors.motorFile.rseNoThrust', { motor: designation });
  }

  const samples = points.map((p) => ({ time: p.time, thrust: p.thrust }));

  // As upstream: used only when given for every point and not auto-calculated.
  const autoMass = !isFalse(el.getAttribute('auto-calc-mass'));
  const autoCg = !isFalse(el.getAttribute('auto-calc-cg'));
  const haveMass = !autoMass && points.every((p) => Number.isFinite(p.mass));
  const haveCg = !autoCg && points.every((p) => Number.isFinite(p.cg));
  // `isMassArray` would otherwise silently drop the motor later.
  if (haveMass && points.some((p) => p.mass < 0)) {
    throw new KeyedError('errors.motorFile.rseNegativeMass', { motor: designation });
  }
  if (haveMass && points.some((p) => p.mass > MAX_MOTOR_MASS_G)) {
    throw new KeyedError('errors.motorFile.oversize', { motor: designation });
  }
  if (haveCg && points.some((p) => p.cg < 0 || p.cg > length)) {
    throw new KeyedError('errors.motorFile.rseCgOutside', { motor: designation, length });
  }

  const type = TYPES[(el.getAttribute('Type') ?? '').trim().toLowerCase()];

  const motor: CustomMotor = {
    id: customMotorId(manufacturer, designation),
    designation,
    manufacturer,
    class: impulseClass(totalImpulse(samples)),
    diameter,
    length,
    totalWeightG,
    propWeightG,
    delayList: delayList(el.getAttribute('delays'), 'rocksim'),
    type,
    massesG: haveMass ? points.map((p) => p.mass) : undefined,
    // Launch value only: `MotorSpec.cgX` is a scalar.
    cgMm: haveCg ? points[0]!.cg : undefined,
    samples,
    source: 'rse',
  };
  return { motor, digest: desktopDigest(rows, autoMass, autoCg, totalWeightG, propWeightG) };
}

/**
 * The digest desktop gives this motor (`RockSimMotorLoader.getMotor`), from the rows as read: a missing or
 * unreadable mass or CG anywhere turns that series to calculated, as the flags do.
 */
function desktopDigest(rows: readonly Point[], autoMass: boolean, autoCg: boolean, initG: number, propG: number) {
  const times = rows.map((r) => r.time);
  const thrusts = rows.map((r) => r.thrust);
  const masses = rows.map((r) => r.mass / 1000);
  const cgs = rows.map((r) => r.cg / 1000);
  sortLists(times, thrusts, masses, cgs);
  finalizeThrustCurve(times, thrusts, [masses, cgs]);
  const calcMass = autoMass || !masses.every(Number.isFinite);
  const calcCg = autoCg || !cgs.every(Number.isFinite);
  return rseMotorDigest({
    times,
    thrusts,
    masses: calcMass ? { launch: initG / 1000, burnout: initG / 1000 - propG / 1000 } : masses,
    cgs: calcCg ? null : cgs,
  });
}

/** Off only when the file says so explicitly, as upstream. */
const isFalse = (v: string | null) => v === '0' || v?.toLowerCase() === 'false';

export function parseRse(text: string): CustomMotor[] {
  return parseRseWithDigests(text).map((e) => e.motor);
}

/** Each motor with the digest desktop names it by in a `.ork`. */
export function parseRseWithDigests(text: string): { motor: CustomMotor; digest: string }[] {
  const doc = parseXmlText(text, '.rse');
  const engineEls = doc.querySelectorAll('engine');
  if (engineEls.length === 0) throw new KeyedError('errors.motorFile.rseNoEngine');
  // Counted before the spread, so a crafted file never materializes the array.
  if (engineEls.length > MAX_RSE_ENGINES) {
    throw new KeyedError('errors.motorFile.rseTooManyMotors', { max: MAX_RSE_ENGINES });
  }
  return [...engineEls].map(parseEngine);
}
