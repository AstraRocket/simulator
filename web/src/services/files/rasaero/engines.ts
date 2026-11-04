import type { ComponentNode } from '../../../engine/openRocketEngine';
import { walkNodes } from '../../../tree/treeWalk';
import { clusterCount } from '../../../tree/cluster';
import { str } from '../../../tree/nodeProps';

/** RASAero II throws a NullReferenceException on an engine name missing from its motor database. */
export const CDX1_ENGINE_EXPORT = true;

// Subset of desktop RASAeroCommonConstants.OPENROCKET_TO_RASAERO_MANUFACTURER; unmatched makers are omitted.
const RASAERO_MFG: Array<[abbrev: string, names: string[]]> = [
  ['AT', ['AEROTECH', 'AT', 'ISP']],
  ['ES', ['ESTES', 'ESTES INDUSTRIES', 'ES', 'E']],
  ['AP', ['APOGEE', 'APOGEE COMPONENTS', 'AP']],
  ['QU', ['QUEST', 'QUEST AEROSPACE', 'QU', 'Q']],
  [
    'CTI',
    [
      'CESARONI',
      'CESARONI TECHNOLOGY',
      'CESARONI TECHNOLOGY INC',
      'CESARONI TECHNOLOGY INCORPORATED',
      'CTI',
      'CES',
      'PRO38',
    ],
  ],
  ['EM', ['ELLIS', 'ELLIS MOUNTAIN', 'EM']],
  ['Contrail', ['CONTRAIL', 'CONTRAIL ROCKETS', 'CONTRAIL ROCKET', 'CR']],
  ['RV', ['ROCKETVISION', 'ROCKETVISION FLIGHT-STAR', 'ROCKET VISION', 'RV']],
  ['RR', ['ROADRUNNER', 'ROADRUNNER ROCKETRY', 'RR']],
  ['SRS', ['SKYR', 'SKY RIPPER', 'SKYRIPPER', 'SKY RIPPER SYSTEMS', 'SRS']],
  ['LR', ['LOKI', 'LOKI RESEARCH', 'LR']],
  ['PML', ['PML', 'PUBLIC MISSILES', 'PUBLIC MISSILES LTD', 'PUBLIC MISSILES LIMITED']],
  ['KBA', ['KBA', 'KOSDON BY AEROTECH', 'KOSDON/AT', 'KOSDON/AEROTECH', 'K-AT']],
  ['GM', ['GORILLA', 'GORILLA ROCKET MOTORS', 'GORILLA MOTORS', 'GM']],
  ['RTW', ['RATT', 'RATT WORKS', 'RTW', 'RT']],
  ['HT', ['HYPERTEK', 'HT']],
  ['AMW', ['AMW', 'ANIMAL MOTOR WORKS', 'ANIMAL', 'AW']],
  ['WCH', ['WEST COAST HYBRIDS', 'WEST COAST HYBRID', 'WEST COAST', 'WCH', 'WCR']],
  // Not an Animal Motor Works alias in desktop's Manufacturer table.
  ['AMW/ProX', ['AMW PROX', 'AMW/PROX']],
];
const RASAERO_MFG_LOOKUP: Record<string, string> = Object.fromEntries(
  RASAERO_MFG.flatMap(([abbrev, names]) => names.map((n) => [n, abbrev])),
);

function rasaeroManufacturerAbbrev(mfg: string | undefined): string | null {
  if (!mfg) return null;
  const n = mfg.trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
  if (n.startsWith('AEROTECH') || n.startsWith('AT-') || n.startsWith('RCS-')) return 'AT';
  return RASAERO_MFG_LOOKUP[n] ?? null;
}

export interface Cdx1ExportEngine {
  designation: string;
  manufacturer?: string;
  /** Seconds; `PLUGGED_DELAY` or more for a plugged motor. */
  delay?: number;
  ignitionEvent?: string;
  ignitionDelay?: number;
}

export interface StageEngineSlot {
  engine: string | null;
  motor?: Cdx1ExportEngine;
  mount?: ComponentNode;
  extraMotors: boolean;
}

/** The two spaces in 'DESIGNATION  (ABBREV)' are what the desktop's RASAero importer reads back. */
export function stageEngineSlots(
  stagesIn: ComponentNode[],
  motors: Record<string, Cdx1ExportEngine> | undefined,
  engineOn: boolean,
): StageEngineSlot[] {
  return stagesIn.map((st): StageEngineSlot => {
    if (!motors) return { engine: null, extraMotors: false };
    // One engine per stage: the first mount wins, as SimulationListDTO.findMotorMount.
    const mounts = [...walkNodes(st.children ?? [])].filter((n) => n.id && motors[n.id]);
    const mount = mounts[0];
    const found = mount ? motors[mount.id!] : undefined;
    const abbrev = found && engineOn ? rasaeroManufacturerAbbrev(found.manufacturer) : null;
    return {
      engine: found && abbrev ? `${found.designation}  (${abbrev})` : null,
      motor: found,
      mount,
      extraMotors: mounts.length > 1 || (!!mount && mountMotorCount(mount) > 1),
    };
  });
}

export function mountMotorCount(mount: ComponentNode): number {
  return clusterCount(str(mount, 'cluster', 'single'));
}
