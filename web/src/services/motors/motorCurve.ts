import type { MotorSpec } from '../../engine/openRocketEngine';
import type { Keyed } from '../../i18n/keyedError';

/**
 * The single "does this motor carry a usable thrust curve" predicate.
 *
 * It matches the builder (`openRocketEngine.setMotorById`): at least
 * {@link MIN_CURVE_SAMPLES} samples and nothing {@link curveProblem} refuses.
 *
 * Every module uses this one threshold. With a threshold per module, a one-sample
 * motor could be "flyable" to the Run button, empty at the mount at build time,
 * and then fail the kernel's own "too short thrust curve" check from another path.
 */
export const MIN_CURVE_SAMPLES = 2;

const finiteArray = (xs: unknown): xs is number[] => Array.isArray(xs) && xs.every((x) => Number.isFinite(x));

/**
 * Why the kernel would refuse `motor`, or null when it would take it: the one
 * set of checks the engine guard (`openRocketEngine.setMotorById`) throws from
 * and {@link hasUsableCurve} answers from, so nothing the builder seats can
 * fail the build.
 *
 * The scalars cross into the kernel too: a catalog row missing `length` makes
 * the length and the CG NaN, which TeaVM reports as an opaque BigInt
 * conversion error. The delay may be Infinity (plugged) but not NaN.
 */
export function curveProblem(motor: MotorSpec): Keyed | null {
  const name = motor.designation;
  const scalars: [Keyed, number][] = [
    [{ key: 'errors.motorCurve.whatDiameter' }, motor.diameter],
    [{ key: 'errors.motorCurve.whatLength' }, motor.length],
    [{ key: 'errors.motorCurve.whatCg' }, motor.cgX],
  ];
  for (const [what, v] of scalars) {
    if (!Number.isFinite(v)) return { key: 'errors.motorCurve.notFinite', values: { motor: name, what } };
  }
  if (Number.isNaN(motor.ejectionDelay)) {
    return {
      key: 'errors.motorCurve.notFinite',
      values: { motor: name, what: { key: 'errors.motorCurve.whatDelay' } },
    };
  }
  if (motor.diameter <= 0 || motor.length <= 0) return { key: 'errors.motorCurve.size', values: { motor: name } };

  const { times, thrusts, masses } = motor;
  if (!finiteArray(times) || !finiteArray(thrusts) || !finiteArray(masses)) {
    return { key: 'errors.motorCurve.nonFinite', values: { motor: name } };
  }
  // The kernel reads the three arrays in lockstep (times[i], thrusts[i],
  // masses[i]), so a short one would index past its end.
  if (times.length !== thrusts.length || times.length !== masses.length) {
    return {
      key: 'errors.motorCurve.lengths',
      values: { motor: name, times: times.length, thrusts: thrusts.length, masses: masses.length },
    };
  }
  // The kernel integrates between consecutive samples, and a negative interval
  // silently subtracts impulse.
  for (let i = 1; i < times.length; i++) {
    if (times[i]! < times[i - 1]!) {
      return {
        key: 'errors.motorCurve.backwards',
        values: { motor: name, sample: i, before: times[i - 1]!, after: times[i]! },
      };
    }
  }
  if (masses.some((m) => m < 0)) return { key: 'errors.motorCurve.negativeMass', values: { motor: name } };
  // A motor that weighs nothing for the whole burn is not a motor: the kernel
  // flies it and returns an optimistic flight. The real-world source is an
  // .rse whose samples carry no mass attribute.
  if (masses.length > 0 && masses.every((m) => m === 0)) {
    return { key: 'errors.motorCurve.noMass', values: { motor: name } };
  }
  return null;
}

/** Whether `m` carries a curve the kernel will accept. Null-safe. */
export function hasUsableCurve(m: MotorSpec | null | undefined): boolean {
  if (!m || !Array.isArray(m.times) || m.times.length < MIN_CURVE_SAMPLES) return false;
  return curveProblem(m) === null;
}
