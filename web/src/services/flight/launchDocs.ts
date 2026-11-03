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

/**
 * What the flight card (`FlightCard`, on the Results tab) is filled in from: one simulation, the configuration
 * it flies, and the design. It is for the range table, so everything here is
 * what a flyer flies and is asked about, with the stage each piece is in.
 */
export interface LaunchMotor {
  /** The stage's index, top first, and its own name ('' when unnamed). */
  stageIndex: number;
  stageName: string;
  /** The mount as named in the design ('' when unnamed), and its type. */
  mount: { name: string; type: string };
  spec: MotorSpec;
  /** Copies flown from this mount: cluster positions, pods. */
  count: number;
  /** One motor's total impulse (N·s) and class letter. */
  impulseNs: number;
  impulseClass: string;
  /** The ejection delay (s), or null for a motor flown plugged. */
  delayS: number | null;
}

export interface LaunchDevice {
  stageIndex: number;
  stageName: string;
  node: ComponentNode;
  role: ChargeRole;
  /** When it opens on this flight: the configuration's override, else the design's. */
  deployEvent: string;
  deployAltitudeM: number;
  deployDelayS: number;
  /** A parachute's canopy diameter (m); null for a streamer. */
  diameterM: number | null;
}

/** The certification a flight needs, by the total impulse it puts on the pad. */
export type CertLevel = 0 | 1 | 2 | 3;

export interface LaunchDocs {
  designName: string;
  simName: string;
  configName: string;
  /** The flight was flown from inputs other than the current ones. */
  outdated: boolean;
  /**
   * The rocket as the live build weighs it, or null when the simulation flies
   * a configuration other than the one built, whose mass and CG these are not.
   */
  info: StaticInfo | null;
  motors: LaunchMotor[];
  /** Every motor's impulse times its copies (N·s), and the class it adds up to. */
  installedImpulseNs: number;
  installedClass: string;
  certLevel: CertLevel;
  /** The flight's figures, or null when it has not been flown. */
  flight: FlightSummary | null;
  launch: Pick<LaunchConditions, 'launchRodLengthM' | 'launchRodAngleDeg' | 'windAverage'>;
  devices: LaunchDevice[];
  charges: ChargeRow[];
}

/**
 * The certification level a flyer needs, from the total impulse on the pad:
 * up to G (160 N·s) none, H and I (to 640 N·s) Level 1, J to L (to 5,120 N·s)
 * Level 2, above that Level 3. NAR and Tripoli both rate a cluster or a staged
 * rocket by the total of its motors.
 */
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

  // Copies per seated motor, matched by the spec the configuration seats.
  const copies = new Map<MotorSpec, number>();
  for (const s of seatedMotors(tree, config)) copies.set(s.spec, (copies.get(s.spec) ?? 0) + s.count);

  const motors: LaunchMotor[] = [];
  for (const { stage, stageIndex } of flying) {
    for (const mount of collectNodes([stage], (n) => n.motorMount === true)) {
      const seated = config.motors[mount.id as string];
      if (!seated) continue;
      const impulseNs = curveStats(specSamples(seated.spec)).impulse;
      motors.push({
        stageIndex,
        stageName: typeof stage.name === 'string' ? stage.name : '',
        mount: { name: typeof mount.name === 'string' ? mount.name : '', type: mount.type },
        spec: seated.spec,
        count: copies.get(seated.spec) ?? 1,
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
        stageName: typeof stage.name === 'string' ? stage.name : '',
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
