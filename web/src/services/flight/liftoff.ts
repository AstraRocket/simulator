import type { RocketTree } from '../../engine/openRocketEngine';
import { emptyMotorSpec } from '../motors/motorCurve';
import type { FlightConfig } from './flightConfigs';
import { seatedMotors } from './powerClass';
import type { Liftoff } from '../motors/motorPerf';

// `dryKg` is the kernel's `massEmpty`.
export function liftoffFor(tree: RocketTree, config: FlightConfig, mountId: string, dryKg: number): Liftoff {
  const { [mountId]: here, ...rest } = config.motors;
  const others = seatedMotors(tree, { ...config, motors: rest });
  const otherMotorsKg = others.reduce((sum, m) => sum + m.count * (m.spec.masses[0] ?? 0), 0);
  const alone = seatedMotors(tree, { ...config, motors: { [mountId]: here ?? { spec: emptyMotorSpec() } } });
  return { dryKg, otherMotorsKg, count: alone[0]?.count ?? 1 };
}
