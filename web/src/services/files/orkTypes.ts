import type { FlightSummary } from '../../engine/openRocketEngine';
import type { OrkSimulation } from './ork/importSimulations';
import { type MotorSpec, type RocketTree } from '../../engine/openRocketEngine';
import { type LaunchConditions } from '../design/orkTree';
import type { EmbeddedMotorFile } from './ork/embeddedMotors';
import type { ImportNote } from './importNote';
import type { SimPrefs } from '../flight/simulations';
import type { ComponentFigures } from './rktExport';
import { uuid } from '../app/uuid';

export type OrkSimPrefs = Pick<
  SimPrefs,
  | 'timeStep'
  | 'maxTime'
  | 'stepper'
  | 'randomSeed'
  | 'deploymentSpeedWarn'
  | 'mainHighSpeedWarn'
  | 'mainLowSpeedWarn'
  | 'drogueLowSpeedWarn'
>;

export interface OrkMotorRef {
  designation: string;
  manufacturer?: string;
  digest?: string;
  diameter: number;
  length: number;
  delay: number;
  mountId?: string;
  ignitionEvent?: string;
  ignitionDelay?: number;
}

interface OrkTreeImportResult {
  name: string;
  tree: RocketTree;
  motor?: OrkMotorRef;
  motors: Record<string, OrkMotorRef>;
  ignored: string[];
  notes: ImportNote[];
  /** Temperature/pressure are null when the file declares the ISA atmosphere. */
  launch?: Partial<LaunchConditions>;
  simulations?: OrkSimulation[];
  embeddedMotors?: string[];
}

export interface OrkFlightConfig {
  id: string;
  /** Desktop writes <name> only when the user renamed the configuration. */
  name: string | null;
  isDefault: boolean;
  motors: Record<string, OrkMotorRef>;
  deployments: Record<string, OrkDeployOverride>;
  separations: Record<string, OrkSepOverride>;
  grounded: string[];
}

export interface OrkDeployOverride {
  deployEvent?: string;
  deployAltitude?: number;
  deployDelay?: number;
}

export interface OrkSepOverride {
  separationEvent?: string;
  separationDelay?: number;
  separationAltitude?: number;
}

export interface OrkImportResult extends OrkTreeImportResult {
  configs: OrkFlightConfig[];
  /** Deployment and separation stay the bare tags whichever configuration this is. */
  chosenConfigId: string | null;
  format?: 'ork' | 'rkt';
}

export interface OrkExportMotor {
  designation: string;
  manufacturer?: string;
  /** Several database entries can share a designation; with no digest the desktop takes the first. */
  digest?: string;
  diameter: number;
  length: number;
  delay: number;
  ignitionEvent?: string;
  ignitionDelay?: number;
  embedded?: EmbeddedMotorFile;
  /** Not written itself. */
  seated?: MotorSpec;
}

/** `value` is preformatted (4 significant figures, no exponent). */
export interface DesignStat {
  field: string;
  value: string;
  unit: string;
}

export interface DesignStatGroup {
  scope: 'rocket' | 'stage';
  stageNumber?: number;
  name?: string;
  stats: DesignStat[];
}

/** Nose-tip to fin-root distances (m). */
export interface DesignFinSet {
  stageNumber: number;
  stage: string;
  name: string;
  topX: number;
  bottomX: number;
}

export interface DesignInfo {
  groups: DesignStatGroup[];
  finsets: DesignFinSet[];
}

interface OrkExportConfig {
  id: string;
  name: string | null;
  motors: Record<string, OrkExportMotor>;
  deployments?: Record<string, OrkDeployOverride>;
  separations?: Record<string, OrkSepOverride>;
  grounded?: string[];
}

export interface OrkExportSimulation {
  name: string;
  configId: string;
  launch: LaunchConditions;
  summary?: FlightSummary;
  /** The desktop loads any summary as current unless the status says outdated (SingleSimulationHandler). */
  status: 'uptodate' | 'outdated' | 'notsimulated';
  xmlExtra?: string[];
  prefs?: OrkSimPrefs;
}

export interface OrkTreeExportInput {
  name: string;
  tree: RocketTree;
  configs?: OrkExportConfig[];
  activeConfigId?: string | null;
  launch?: LaunchConditions;
  /** Takes precedence over `launch`. */
  simulations?: OrkExportSimulation[];
  simPrefs?: OrkSimPrefs;
  designInfo?: DesignInfo;
  componentInfo?: ComponentFigures;
}

export function defaultOrkConfig(partial: Partial<OrkFlightConfig> = {}): OrkFlightConfig {
  return {
    id: uuid(),
    name: null,
    isDefault: true,
    motors: {},
    deployments: {},
    separations: {},
    grounded: [],
    ...partial,
  };
}
