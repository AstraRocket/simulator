import type { ComponentNode, FlightSummary, MotorSpec, RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { collectNodes, stageNodes } from '../../tree/treeWalk';
import { effectiveDeployment, type FlightConfig } from './flightConfigs';
import { seatedMotors } from './powerClass';
import { chargeRows, deviceRoles, type ChargeRole, type ChargeRow } from './recoveryCharges';
import { isRecoveryDevice } from '../design/treeEdit';
import { curveStats, specSamples } from '../motors/motorMath';
import { impulseClass } from '../motors/motorCombine';
import { PLUGGED_DELAY } from '../../engine/openRocketEngine';
import type { LaunchConditions } from '../design/orkTree';
import { str } from '../../tree/nodeProps';

export interface LaunchMotor {
  stageIndex: number;
  stageName: string;
  mount: { name: string; type: string };
  spec: MotorSpec;
  count: number;
  /** One motor's, N·s. */
  impulseNs: number;
  impulseClass: string;
  delayS: number | null;
}

export interface LaunchDevice {
  stageIndex: number;
  stageName: string;
  node: ComponentNode;
  role: ChargeRole;
  deployEvent: string;
  deployAltitudeM: number;
  deployDelayS: number;
  diameterM: number | null;
}

export type CertLevel = 0 | 1 | 2 | 3;

export interface LaunchDocs {
  designName: string;
  simName: string;
  configName: string;
  outdated: boolean;
  /** Null when the simulation flies a configuration other than the one built. */
  info: StaticInfo | null;
  motors: LaunchMotor[];
  /** N·s, counting copies. */
  installedImpulseNs: number;
  installedClass: string;
  certLevel: CertLevel;
  flight: FlightSummary | null;
  launch: Pick<LaunchConditions, 'launchRodLengthM' | 'launchRodAngleDeg' | 'windAverage'>;
  devices: LaunchDevice[];
  charges: ChargeRow[];
}

// NAR and Tripoli rate clusters and staged rockets by total installed impulse, not per motor.
export function certLevel(installedNs: number): CertLevel {
  if (installedNs <= 160) return 0;
  if (installedNs <= 640) return 1;
  if (installedNs <= 5120) return 2;
  return 3;
}

export interface LaunchDocsInput {
  designName: string;
  simName: string;
  configName: string;
  outdated: boolean;
  tree: RocketTree;
  config: FlightConfig;
  info: StaticInfo | null;
  flight: FlightSummary | null;
  launch: LaunchConditions;
}

export function launchDocs(input: LaunchDocsInput): LaunchDocs {
  const { tree, config } = input;
  const grounded = new Set(config.grounded ?? []);
  const flying = stageNodes(tree)
    .map((stage, stageIndex) => ({ stage, stageIndex }))
    .filter(({ stage }) => !grounded.has(stage.id as string));

  // By mount: mounts flying the same motor can share one spec object.
  const copies = new Map(seatedMotors(tree, config).map((s) => [s.mountId, s.count]));

  const motors: LaunchMotor[] = [];
  for (const { stage, stageIndex } of flying) {
    for (const mount of collectNodes([stage], (n) => n.motorMount === true)) {
      const seated = config.motors[mount.id as string];
      if (!seated) continue;
      const impulseNs = curveStats(specSamples(seated.spec)).impulse;
      motors.push({
        stageIndex,
        stageName: str(stage, 'name'),
        mount: { name: str(mount, 'name'), type: mount.type },
        spec: seated.spec,
        count: copies.get(mount.id as string) ?? 1,
        impulseNs,
        impulseClass: impulseClass(impulseNs),
        delayS: seated.spec.ejectionDelay >= PLUGGED_DELAY ? null : seated.spec.ejectionDelay,
      });
    }
  }
  const installedImpulseNs = motors.reduce((sum, m) => sum + m.impulseNs * m.count, 0);

  const roles = deviceRoles(tree);
  const devices: LaunchDevice[] = [];
  for (const { stage, stageIndex } of flying) {
    for (const node of collectNodes([stage], (n) => isRecoveryDevice(n.type))) {
      const d = effectiveDeployment(config, node);
      const diameter = node['diameter'];
      devices.push({
        stageIndex,
        stageName: str(stage, 'name'),
        node,
        role: roles.get(node.id as string) ?? 'main',
        deployEvent: d.deployEvent,
        deployAltitudeM: d.deployAltitude,
        deployDelayS: d.deployDelay,
        diameterM: node.type === 'parachute' && typeof diameter === 'number' ? diameter : null,
      });
    }
  }

  return {
    designName: input.designName,
    simName: input.simName,
    configName: input.configName,
    outdated: input.outdated,
    info: input.info,
    motors,
    installedImpulseNs,
    installedClass: impulseClass(installedImpulseNs),
    certLevel: certLevel(installedImpulseNs),
    flight: input.flight,
    launch: {
      launchRodLengthM: input.launch.launchRodLengthM,
      launchRodAngleDeg: input.launch.launchRodAngleDeg,
      windAverage: input.launch.windAverage,
    },
    devices,
    charges: chargeRows(tree),
  };
}
