import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { stageNodes, walkNodes } from '../../tree/treeWalk';
import { findNode, findRecoveryDevices, recoveryDevices, updateNode } from '../design/treeEdit';
import { DEFAULT_BAY_PRESSURE_PA } from './ejectionCharge';
import { ejectionBay, PIN_SIZES, type EjectionBay, type PinSize, type ShearPins } from './ejectionBay';
import { deviceRoles, recoveryCharges, stageNamesById, withCharges, type ChargeRole } from './recoveryCharges';
import { isFiniteNumber, isRecord } from '../app/numbers';
import { str } from '../../tree/nodeProps';

// The `.ork` stores BAYS_KEY inside the tube's element (`orkBays`) because part ids are minted fresh on every load.

export const BAYS_KEY = 'recoveryBays';

export const TEST_RESULTS = ['clean', 'violent', 'partial', 'none', 'pinsHeld'] as const;
export type TestResult = (typeof TEST_RESULTS)[number];

export interface BayPins {
  count: number;
  size: PinSize | null;
  /** One pin's strength, N. */
  forceN: number;
}

export interface GroundTest {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Powder, kg. */
  chargeKg: number;
  pins: BayPins | null;
  result: TestResult;
  notes: string;
}

export interface BayRecord {
  pins?: BayPins;
  pressurePa?: number;
  boreM?: number;
  lengthM?: number;
  /** Flight charges, kg. */
  primaryKg?: number;
  backupKg?: number;
  flownTestId?: string;
  tests: GroundTest[];
}

export type TubeBays = Partial<Record<ChargeRole, BayRecord>>;

export function baysOf(tube: ComponentNode | null | undefined): TubeBays {
  const v = tube?.[BAYS_KEY];
  return isTubeBays(v) ? v : {};
}

export function bayRecord(tree: RocketTree, tubeId: string, role: ChargeRole): BayRecord {
  return baysOf(findNode(tree, tubeId))[role] ?? { tests: [] };
}

// Flight charges are also written to the bay's mass objects so the two never disagree.
export function updateBay(tree: RocketTree, tubeId: string, role: ChargeRole, patch: Partial<BayRecord>): RocketTree {
  const tube = findNode(tree, tubeId);
  if (!tube) return tree;
  const bays = baysOf(tube);
  const merged: BayRecord = { ...(bays[role] ?? { tests: [] }), ...patch };
  for (const k of Object.keys(merged) as (keyof BayRecord)[]) if (merged[k] === undefined) delete merged[k];
  let next = updateNode(tree, tubeId, { [BAYS_KEY]: { ...bays, [role]: merged } });
  if ('primaryKg' in patch || 'backupKg' in patch) {
    next = withCharges(next, tubeId, role, merged.primaryKg ?? null, merged.backupKg ?? null);
  }
  return next;
}

export interface DesignBay {
  stageId: string;
  stageName?: string;
  tubeId: string;
  tubeName: string;
  role: ChargeRole;
  devices: string[];
  drawn: EjectionBay;
  record: BayRecord;
}

export function designBays(tree: RocketTree): DesignBay[] {
  const out: DesignBay[] = [];
  const roles = deviceRoles(tree);
  const stageNames = stageNamesById(tree);
  const stageOf = new Map<string, string>();
  for (const stage of stageNodes(tree)) {
    for (const d of recoveryDevices(tree, stage.id as string)) stageOf.set(d.id as string, stage.id as string);
  }
  for (const device of findRecoveryDevices(tree)) {
    const id = device.id;
    const role = id ? roles.get(id) : undefined;
    if (!id || !role) continue;
    const drawn = ejectionBay(tree, id);
    if (!drawn) continue;
    const name = str(device, 'name');
    const held = out.find((b) => b.tubeId === drawn.tubeId && b.role === role);
    if (held) {
      if (name) held.devices.push(name);
      continue;
    }
    out.push({
      stageId: stageOf.get(id) ?? '',
      ...(stageNames.has(drawn.tubeId) ? { stageName: stageNames.get(drawn.tubeId) } : {}),
      tubeId: drawn.tubeId,
      tubeName: drawn.tubeName,
      role,
      devices: name ? [name] : [],
      drawn,
      record: bayRecord(tree, drawn.tubeId, role),
    });
  }
  return out;
}

export type PinSource = 'bay' | 'mass' | 'default';

export interface EffectiveBay {
  boreM: number;
  lengthM: number;
  pressurePa: number;
  pins: ShearPins;
  pinSource: PinSource;
}

export function effectiveBay(bay: Pick<DesignBay, 'drawn' | 'record'>): EffectiveBay {
  const { drawn, record } = bay;
  return {
    boreM: record.boreM ?? drawn.boreM,
    lengthM: record.lengthM ?? drawn.lengthM,
    pressurePa: record.pressurePa ?? DEFAULT_BAY_PRESSURE_PA,
    pins: record.pins ? { ...record.pins, from: null } : drawn.pins,
    pinSource: record.pins ? 'bay' : drawn.pins.from ? 'mass' : 'default',
  };
}

export function bayCharges(
  tree: RocketTree,
  bay: Pick<DesignBay, 'tubeId' | 'role' | 'record'>,
): {
  primaryKg: number | null;
  backupKg: number | null;
} {
  if (bay.record.primaryKg != null || bay.record.backupKg != null) {
    return { primaryKg: bay.record.primaryKg ?? null, backupKg: bay.record.backupKg ?? null };
  }
  const held = recoveryCharges(tree).filter((c) => c.tubeId === bay.tubeId && c.role === bay.role);
  return {
    primaryKg: held.find((c) => !c.backup)?.massKg ?? null,
    backupKg: held.find((c) => c.backup)?.massKg ?? null,
  };
}

export function hasBayRecords(tree: RocketTree): boolean {
  for (const n of walkNodes(tree.components)) if (Object.keys(baysOf(n)).length) return true;
  return false;
}

const optNum = (v: unknown) => v === undefined || (isFiniteNumber(v) && v > 0);

function isPins(v: unknown): v is BayPins {
  return (
    isRecord(v) &&
    isFiniteNumber(v['count']) &&
    v['count'] >= 0 &&
    isFiniteNumber(v['forceN']) &&
    (v['size'] === null || (PIN_SIZES as readonly unknown[]).includes(v['size']))
  );
}

function isTest(v: unknown): v is GroundTest {
  return (
    isRecord(v) &&
    typeof v['id'] === 'string' &&
    typeof v['date'] === 'string' &&
    isFiniteNumber(v['chargeKg']) &&
    (v['pins'] === null || isPins(v['pins'])) &&
    (TEST_RESULTS as readonly unknown[]).includes(v['result']) &&
    typeof v['notes'] === 'string'
  );
}

function isBayRecord(v: unknown): v is BayRecord {
  return (
    isRecord(v) &&
    (v['pins'] === undefined || isPins(v['pins'])) &&
    ['pressurePa', 'boreM', 'lengthM', 'primaryKg', 'backupKg'].every((k) => optNum(v[k])) &&
    (v['flownTestId'] === undefined || typeof v['flownTestId'] === 'string') &&
    Array.isArray(v['tests']) &&
    v['tests'].every(isTest)
  );
}

export function isTubeBays(v: unknown): v is TubeBays {
  return isRecord(v) && Object.entries(v).every(([k, r]) => (k === 'drogue' || k === 'main') && isBayRecord(r));
}
