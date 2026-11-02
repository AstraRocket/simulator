import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { stageNodes, walkNodes } from '../../tree/treeWalk';
import { findNode, findRecoveryDevices, recoveryDevices, updateNode } from '../design/treeEdit';
import { DEFAULT_BAY_PRESSURE_PA } from './ejectionCharge';
import { ejectionBay, PIN_SIZES, type EjectionBay, type PinSize, type ShearPins } from './ejectionBay';
import { deviceRoles, recoveryCharges, stageNamesById, withCharges, type ChargeRole } from './recoveryCharges';

/**
 * A design's recovery bays as records of their own: each bay's shear pins,
 * target pressure, flight charges and ground test log, kept on the body tube
 * that is the bay, one record per role (a tube can hold a drogue bay and a main
 * bay either side of a bulkhead).
 *
 * The record rides on the tube node under {@link BAYS_KEY}, which no field
 * table names, so it is never in the property panel, never reaches the kernel
 * as anything it reads, and does not age a simulation's result: nothing in it
 * flies (`flightKey` skips it). The `.ork` carries it inside the tube's own
 * element (`orkBays`), so it moves with the tube and needs no id to find it
 * again, since part ids are minted fresh on every load.
 *
 * The flight charges are mirrored into deployment-charge mass objects
 * (`withCharges`), so their weight counts and desktop OpenRocket shows them.
 */

/** The tube node key the records ride on. */
export const BAYS_KEY = 'recoveryBays';

/** How a ground test went, in the order the log offers them. */
export const TEST_RESULTS = ['clean', 'violent', 'partial', 'none', 'pinsHeld'] as const;
export type TestResult = (typeof TEST_RESULTS)[number];

/** A bay's shear pins as the bay record states them. */
export interface BayPins {
  count: number;
  /** Null when the strength is a measured one rather than a size's typical. */
  size: PinSize | null;
  /** One pin's strength, N. */
  forceN: number;
}

export interface GroundTest {
  id: string;
  /** The day, `YYYY-MM-DD`. */
  date: string;
  /** Powder, kg. */
  chargeKg: number;
  /** The pins in for this test; null for none. */
  pins: BayPins | null;
  result: TestResult;
  notes: string;
}

export interface BayRecord {
  /** Unset: the pins come from a mass object, else the default. */
  pins?: BayPins;
  pressurePa?: number;
  /** Bore and length that override the design's, for a bay drawn differently from how it is built. */
  boreM?: number;
  lengthM?: number;
  /** The flight charges, kg. */
  primaryKg?: number;
  backupKg?: number;
  /** The ground test the primary was taken from, when it was. */
  flownTestId?: string;
  tests: GroundTest[];
}

export type TubeBays = Partial<Record<ChargeRole, BayRecord>>;

/** The records a tube carries. */
export function baysOf(tube: ComponentNode | null | undefined): TubeBays {
  const v = tube?.[BAYS_KEY];
  return isTubeBays(v) ? v : {};
}

/** One bay's record, or an empty one. */
export function bayRecord(tree: RocketTree, tubeId: string, role: ChargeRole): BayRecord {
  return baysOf(findNode(tree, tubeId))[role] ?? { tests: [] };
}

/**
 * `tree` with one bay's record changed by `patch`. A patch that sets the
 * flight charges also writes them to the bay's mass objects, so the two never
 * disagree. Every key set to undefined is dropped from the record.
 */
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

/** A bay of the design: a tube and role some recovery device sits in, with what it is made of. */
export interface DesignBay {
  /** The stage it is in, so a multi-stage design can show its bays by stage. */
  stageId: string;
  /** Its stage's name (`stageNamesById`); undefined only for a tube outside any stage. */
  stageName?: string;
  tubeId: string;
  tubeName: string;
  role: ChargeRole;
  /** The devices in it, by name. */
  devices: string[];
  /** Its geometry and pins as the design draws them. */
  drawn: EjectionBay;
  record: BayRecord;
}

/**
 * Every bay the design's recovery devices sit in, in tree order; one per tube
 * and role. A device with no role in its stage's plan (`deviceRoles`) has none.
 */
export function designBays(tree: RocketTree): DesignBay[] {
  const out: DesignBay[] = [];
  const roles = deviceRoles(tree);
  const stageNames = stageNamesById(tree);
  const stageOf = new Map<string, string>();
  for (const stage of stageNodes(tree)) {
    for (const d of recoveryDevices(tree, stage.id as string)) stageOf.set(d.id as string, stage.id as string);
  }
  for (const device of findRecoveryDevices(tree)) {
    const role = device.id ? roles.get(device.id) : undefined;
    if (!role) continue;
    const drawn = ejectionBay(tree, device.id!);
    if (!drawn) continue;
    const name = typeof device.name === 'string' ? device.name : '';
    const held = out.find((b) => b.tubeId === drawn.tubeId && b.role === role);
    if (held) {
      if (name) held.devices.push(name);
      continue;
    }
    out.push({
      stageId: stageOf.get(device.id!) ?? '',
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

/** Where a bay's pins come from: its record, a mass object named for them, or the default. */
export type PinSource = 'bay' | 'mass' | 'default';

/** A bay's settings as they size its charge: the record's where it has them, the design's elsewhere. */
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

/**
 * A bay's flight charges: the record's, else the mass objects a design saved
 * them as before it had records, from this bay's tube only.
 */
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

/** Whether any tube in the design carries a record. */
export function hasBayRecords(tree: RocketTree): boolean {
  for (const n of walkNodes(tree.components)) if (Object.keys(baysOf(n)).length) return true;
  return false;
}

// --- Shape checks, for a record read back from a file or storage ---

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || (isNum(v) && v > 0);

function isPins(v: unknown): v is BayPins {
  return (
    isObj(v) &&
    isNum(v['count']) &&
    v['count'] >= 0 &&
    isNum(v['forceN']) &&
    (v['size'] === null || (PIN_SIZES as readonly unknown[]).includes(v['size']))
  );
}

function isTest(v: unknown): v is GroundTest {
  return (
    isObj(v) &&
    typeof v['id'] === 'string' &&
    typeof v['date'] === 'string' &&
    isNum(v['chargeKg']) &&
    (v['pins'] === null || isPins(v['pins'])) &&
    (TEST_RESULTS as readonly unknown[]).includes(v['result']) &&
    typeof v['notes'] === 'string'
  );
}

function isRecord(v: unknown): v is BayRecord {
  return (
    isObj(v) &&
    (v['pins'] === undefined || isPins(v['pins'])) &&
    ['pressurePa', 'boreM', 'lengthM', 'primaryKg', 'backupKg'].every((k) => optNum(v[k])) &&
    (v['flownTestId'] === undefined || typeof v['flownTestId'] === 'string') &&
    Array.isArray(v['tests']) &&
    v['tests'].every(isTest)
  );
}

/** Whether `v` is a tube's records: only the two roles, each a well-formed record. */
export function isTubeBays(v: unknown): v is TubeBays {
  return isObj(v) && Object.entries(v).every(([k, r]) => (k === 'drogue' || k === 'main') && isRecord(r));
}
