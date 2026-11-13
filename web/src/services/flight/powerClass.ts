import type { ComponentNode, MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import { clusterCount } from '../../tree/cluster';
import { curveStats, specSamples } from '../motors/motorMath';
import { motorStatistics } from '../../engine/openRocketEngine';
import type { FlightConfig } from './flightConfigs';
import { propellantMass } from './recoverySizing';
import { countOf } from '../../tree/nodeProps';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';

// A property of the configuration, not the design: two configurations of one design can fall on either side.
export type PowerClass = 'model' | 'highPower';

/** SI. Exceeding any one makes a rocket high power; the first two are per motor. */
const HIGH_POWER = {
  motorImpulseNs: 160,
  motorAvgThrustN: 80,
  installedImpulseNs: 320,
  installedPropellantKg: 0.125,
  liftoffMassKg: 1.5,
} as const;

export interface SeatedMotor {
  mountId: string;
  spec: MotorSpec;
  count: number;
}

// A node with no count flies two, the bridge's default (`ComponentFactory.applyAssembly`).
const instancesOf = (n: ComponentNode): number =>
  n.type === 'podset' || n.type === 'parallelstage'
    ? countOf(n, 'instanceCount', KERNEL_DEFAULTS[n.type].instanceCount)
    : 1;

export function seatedMotors(tree: RocketTree, config: FlightConfig): SeatedMotor[] {
  const grounded = new Set(config.grounded ?? []);
  const out: SeatedMotor[] = [];
  const walk = (nodes: readonly ComponentNode[], copies: number) => {
    for (const n of nodes) {
      if ((n.type === 'stage' || n.type === 'parallelstage') && typeof n.id === 'string' && grounded.has(n.id)) {
        continue;
      }
      // The kernel places a clustered tube's contents once per cluster position.
      const here =
        copies * instancesOf(n) * (n.type === 'innertube' ? clusterCount(n['cluster'] as string | undefined) : 1);
      if (n.motorMount === true && typeof n.id === 'string') {
        const seated = config.motors[n.id];
        if (seated) out.push({ mountId: n.id, spec: seated.spec, count: here });
      }
      if (n.children) walk(n.children, here);
    }
  };
  walk(tree.components, 1);
  return out;
}

const averages = new WeakMap<MotorSpec, number>();
function kernelAverage(spec: MotorSpec, curve: [number, number][]): number | null {
  const kept = averages.get(spec);
  if (kept !== undefined) return kept;
  const avg = motorStatistics(curve)?.averageThrust ?? null;
  if (avg !== null) averages.set(spec, avg);
  return avg;
}

// `dryMassKg` is the kernel's motorless mass; null before the engine answers.
export function powerClass(
  motors: readonly Pick<SeatedMotor, 'spec' | 'count'>[],
  dryMassKg: number | null | undefined,
): PowerClass {
  let installed = 0;
  let loaded = 0;
  let propellant = 0;
  for (const { spec, count } of motors) {
    const curve = specSamples(spec);
    const stats = curveStats(curve);
    // The kernel's average (between 5%-of-peak crossings) once loaded; the curve's own until then.
    const avg = kernelAverage(spec, curve) ?? stats.avg;
    if (stats.impulse > HIGH_POWER.motorImpulseNs || avg > HIGH_POWER.motorAvgThrustN) return 'highPower';
    installed += stats.impulse * count;
    loaded += (spec.masses[0] ?? 0) * count;
    propellant += propellantMass(spec) * count;
  }
  if (installed > HIGH_POWER.installedImpulseNs) return 'highPower';
  if (propellant > HIGH_POWER.installedPropellantKg) return 'highPower';
  if (dryMassKg != null && dryMassKg + loaded > HIGH_POWER.liftoffMassKg) return 'highPower';
  return 'model';
}

export function configPowerClass(
  tree: RocketTree,
  config: FlightConfig,
  dryMassKg: number | null | undefined,
): PowerClass {
  return powerClass(seatedMotors(tree, config), dryMassKg);
}
