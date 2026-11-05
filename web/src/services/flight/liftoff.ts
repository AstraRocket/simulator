import type { MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import type { FlightConfig } from './flightConfigs';
import { seatedMotors } from './powerClass';
import type { Liftoff } from '../motors/motorPerf';

// Stands in for an empty mount when counting how many motors it takes; never flown.
const PROBE: MotorSpec = {
  designation: '',
  diameter: 0,
  length: 0,
  times: [],
  thrusts: [],
  masses: [],
  cgX: 0,
  ejectionDelay: 0,
};

// `dryKg` is the kernel's `massEmpty`.
export function liftoffFor(tree: RocketTree, config: FlightConfig, mountId: string, dryKg: number): Liftoff {
  const { [mountId]: here, ...rest } = config.motors;
  const others = seatedMotors(tree, { ...config, motors: rest });
  const otherMotorsKg = others.reduce((sum, m) => sum + m.count * (m.spec.masses[0] ?? 0), 0);
  const alone = seatedMotors(tree, { ...config, motors: { [mountId]: here ?? { spec: PROBE } } });
  return { dryKg, otherMotorsKg, count: alone[0]?.count ?? 1 };
}
