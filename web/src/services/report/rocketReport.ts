import { motorStatistics, type MotorSpec } from '../../engine/openRocketEngine';
import { impulseClass } from '../motors/motorCombine';
import { motorName } from '../motors/motorName';
import { curveStats, specSamples } from '../motors/motorMath';

// SI in, SI out.

export interface MotorStats {
  designation: string;
  manufacturer?: string;
  /** N */
  avgThrust: number;
  /** N */
  maxThrust: number;
  /** s */
  burnTime: number;
  /** N·s */
  totalImpulse: number;
  impulseClass: string;
  /** Loaded mass (kg). */
  weight: number;
  /** m */
  diameter: number;
  /** m */
  length: number;
}

export function motorStats(spec: MotorSpec): MotorStats {
  // Desktop ThrustCurveMotor.computeStatistics; a curve the kernel rejects has no burn or average.
  const curve = specSamples(spec);
  const kernel = motorStatistics(curve);
  const own = curveStats(curve);
  const impulse = kernel?.totalImpulse ?? own.impulse;
  return {
    designation: motorName(spec),
    manufacturer: spec.manufacturer,
    avgThrust: kernel?.averageThrust ?? NaN,
    maxThrust: kernel?.maxThrust ?? own.max,
    burnTime: kernel?.burnTime ?? NaN,
    totalImpulse: impulse,
    impulseClass: impulseClass(impulse),
    weight: spec.masses?.length ? spec.masses[0]! : 0,
    diameter: spec.diameter,
    length: spec.length,
  };
}
