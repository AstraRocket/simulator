import type { MotorSpec } from '../../engine/openRocketEngine';
import type { Keyed } from '../../i18n/keyedError';

/** Must match `openRocketEngine.setMotorById`. */
export const MIN_CURVE_SAMPLES = 2;

const finiteArray = (xs: unknown): xs is number[] => Array.isArray(xs) && xs.every((x) => Number.isFinite(x));

/** A NaN scalar surfaces in TeaVM as an opaque BigInt error. The delay may be Infinity (plugged) but not NaN. */
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
  if (times.length !== thrusts.length || times.length !== masses.length) {
    return {
      key: 'errors.motorCurve.lengths',
      values: { motor: name, times: times.length, thrusts: thrusts.length, masses: masses.length },
    };
  }
  for (let i = 1; i < times.length; i++) {
    if (times[i]! < times[i - 1]!) {
      return {
        key: 'errors.motorCurve.backwards',
        values: { motor: name, sample: i, before: times[i - 1]!, after: times[i]! },
      };
    }
  }
  if (masses.some((m) => m < 0)) return { key: 'errors.motorCurve.negativeMass', values: { motor: name } };
  if (masses.length > 0 && masses.every((m) => m === 0)) {
    return { key: 'errors.motorCurve.noMass', values: { motor: name } };
  }
  return null;
}

export function hasUsableCurve(m: MotorSpec | null | undefined): boolean {
  if (!m || !Array.isArray(m.times) || m.times.length < MIN_CURVE_SAMPLES) return false;
  return curveProblem(m) === null;
}
