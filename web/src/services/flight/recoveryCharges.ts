import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { num } from '../../tree/nodeProps';
import { stageNodes, walkNodes } from '../../tree/treeWalk';
import {
  addChild,
  defaultNode,
  findNode,
  recoveryDevices,
  removeNode,
  stageMain,
  updateNode,
} from '../design/treeEdit';
import { blackPowderMass, pinShearPressure } from './ejectionCharge';

/**
 * The ejection charges a design carries: the drogue's and the main's, each with
 * a backup, kept in the design as mass objects.
 *
 * A charge is a mass object of the deployment charge type in the bay's tube,
 * named for its role ("Main charge", "Drogue backup charge"), whose mass is the
 * powder's. That puts the amount where desktop OpenRocket shows it too, round
 * trips it through the `.ork`, and counts the powder's weight in the design,
 * the same convention the shear pins follow (`ejectionBay`).
 *
 * The names are file data in English, like a part's name, not UI text: a design
 * saved in one language reads the same in another.
 */

export type ChargeRole = 'drogue' | 'main';

/** OpenRocket's mass object type for a deployment charge, which every saved charge carries. */
export const CHARGE_TYPE = 'deploymentcharge';

/** A suggested backup is this many times the primary. */
export const BACKUP_FACTOR = 1.5;

/** One charge mass object in the design. */
export interface RecoveryCharge {
  nodeId: string;
  role: ChargeRole;
  backup: boolean;
  /** Powder, kg. */
  massKg: number;
  /** The tube it sits in. */
  tubeId: string;
  tubeName: string;
}

/** The name a charge is saved under. */
export function chargeName(role: ChargeRole, backup: boolean): string {
  return `${role === 'main' ? 'Main' : 'Drogue'} ${backup ? 'backup charge' : 'charge'}`;
}

/**
 * A mass object's role as a charge, from its name, or null when the name is not
 * a charge's. Forgiving, as the pins are: it needs "charge" and "main" or
 * "drogue" anywhere in it, and is the backup when it says "backup". A mass
 * object already typed as a deployment charge (`isChargeType`) needs only the
 * role: "Main" or "Drogue backup" is enough.
 */
export function parseChargeName(name: string, isChargeType = false): { role: ChargeRole; backup: boolean } | null {
  const s = name.toLowerCase();
  if (!isChargeType && !/charge/.test(s)) return null;
  const role = /drogue/.test(s) ? 'drogue' : /main/.test(s) ? 'main' : null;
  return role ? { role, backup: /backup/.test(s) } : null;
}

/**
 * Every charge in the design, in tree order, each in the nearest body tube
 * above it: one kept in an inner tube inside the bay counts for the bay.
 */
export function recoveryCharges(tree: RocketTree): RecoveryCharge[] {
  const out: RecoveryCharge[] = [];
  const visit = (nodes: readonly ComponentNode[], tube: ComponentNode | null): void => {
    for (const c of nodes) {
      if (tube?.id && c.type === 'masscomponent' && c.id && typeof c.name === 'string') {
        const parsed = parseChargeName(c.name, c['massComponentType'] === CHARGE_TYPE);
        if (parsed) {
          out.push({
            nodeId: c.id,
            ...parsed,
            massKg: num(c, 'mass', 0),
            tubeId: tube.id,
            tubeName: typeof tube.name === 'string' ? tube.name : '',
          });
        }
      }
      if (c.children) visit(c.children, c.type === 'bodytube' ? c : tube);
    }
  };
  visit(tree.components, null);
  return out;
}

/**
 * The name of the stage each part is in, by part id, so a bay is named by its
 * stage as well as its tube: two stages can each have a "Body tube" bay. An
 * unnamed stage maps to '', for the caller to label (`stagePrefixed`).
 */
export function stageNamesById(tree: RocketTree): Map<string, string> {
  const names = new Map<string, string>();
  for (const stage of stageNodes(tree)) {
    const name = typeof stage.name === 'string' ? stage.name : '';
    for (const n of walkNodes(stage.children ?? [])) if (typeof n.id === 'string') names.set(n.id, name);
  }
  return names;
}

/** One bay's charges, as the report and the results list them. */
export interface ChargeRow {
  role: ChargeRole;
  /** The tube the charges sit in. */
  tubeId: string;
  tubeName: string;
  /** The stage it is in (`stageNamesById`); undefined only for a tube outside any stage. */
  stageName?: string;
  primaryKg: number | null;
  backupKg: number | null;
}

/**
 * The design's charges, one row per bay (a tube and a role), drogue bays first
 * since they fire first, each role's bays in tree order. A design can fly two
 * main bays, so a role alone does not name one.
 */
export function chargeRows(tree: RocketTree): ChargeRow[] {
  const charges = recoveryCharges(tree);
  const stages = stageNamesById(tree);
  const rows: ChargeRow[] = [];
  for (const role of ['drogue', 'main'] as const) {
    for (const c of charges) {
      if (c.role !== role || rows.some((r) => r.role === role && r.tubeId === c.tubeId)) continue;
      const inBay = charges.filter((x) => x.role === role && x.tubeId === c.tubeId);
      rows.push({
        role,
        tubeId: c.tubeId,
        tubeName: c.tubeName,
        ...(stages.has(c.tubeId) ? { stageName: stages.get(c.tubeId) } : {}),
        primaryKg: inBay.find((x) => !x.backup)?.massKg ?? null,
        backupKg: inBay.find((x) => x.backup)?.massKg ?? null,
      });
    }
  }
  return rows;
}

/**
 * Each recovery device's role in its stage's plan, by id. A single-deployment
 * stage (no drogue) has every device as a main. A dual-deployment stage has its
 * drogue and its main (`stageMain`: the one picked, else the first other), and
 * no role for any further device, which then has no bay or charges.
 */
export function deviceRoles(tree: RocketTree): Map<string, ChargeRole> {
  const roles = new Map<string, ChargeRole>();
  for (const stage of stageNodes(tree)) {
    const devices = recoveryDevices(tree, stage.id as string).filter((d) => typeof d.id === 'string');
    const main = stageMain(devices);
    for (const d of devices) {
      if (d['drogue'] === true) roles.set(d.id as string, 'drogue');
      else if (!main || d === main) roles.set(d.id as string, 'main');
    }
  }
  return roles;
}

/**
 * `tree` with the primary and backup charges of the bay `tubeId` holds for
 * `role` set to the given powder masses (kg). An existing charge of that bay is
 * changed where it is; a new one goes into `tubeId`. Another bay's charges of
 * the same role are left alone. A null mass removes that charge. Returns the
 * same tree when nothing changes, so no empty undo step is recorded.
 */
export function withCharges(
  tree: RocketTree,
  tubeId: string,
  role: ChargeRole,
  primaryKg: number | null,
  backupKg: number | null,
): RocketTree {
  const existing = recoveryCharges(tree);
  let next = tree;
  for (const [backup, massKg] of [
    [false, primaryKg],
    [true, backupKg],
  ] as const) {
    const held = existing.find((c) => c.tubeId === tubeId && c.role === role && c.backup === backup);
    if (massKg == null) {
      if (held) next = removeNode(next, held.nodeId);
    } else if (held) {
      // A charge found by its name alone is typed as one on the way through.
      const typed = findNode(next, held.nodeId)?.['massComponentType'] === CHARGE_TYPE;
      const patch = {
        ...(held.massKg !== massKg ? { mass: massKg } : {}),
        ...(typed ? {} : { massComponentType: CHARGE_TYPE }),
      };
      if (Object.keys(patch).length) next = updateNode(next, held.nodeId, patch);
    } else {
      next = addChild(next, tubeId, {
        ...defaultNode('masscomponent'),
        name: chargeName(role, backup),
        mass: massKg,
        massComponentType: CHARGE_TYPE,
      });
    }
  }
  return next;
}

/** `kg` rounded up to a tenth of a gram, the finest a powder scale at the field reads. */
const roundUpTenthGram = (kg: number): number => Math.ceil(kg * 1e4 - 1e-9) / 1e4;

/**
 * The primary charge to suggest for a bay: the powder for the target pressure,
 * or for the pressure that shears its pins when that is the larger, rounded up
 * to a tenth of a gram. Null until the bay and the pressure are all given.
 */
export function suggestedCharge(
  boreM: number | null,
  lengthM: number | null,
  pressurePa: number | null,
  pins: { count: number; forceN: number },
): number | null {
  if (boreM == null || lengthM == null || pressurePa == null) return null;
  const pinPa = pins.count > 0 ? pinShearPressure(pins.count, pins.forceN, boreM) : null;
  const kg = blackPowderMass(Math.max(pressurePa, pinPa ?? 0), boreM, lengthM);
  return kg == null ? null : roundUpTenthGram(kg);
}

/** The backup to suggest for a primary: {@link BACKUP_FACTOR} times it, rounded up as the primary is. */
export const suggestedBackup = (primaryKg: number): number => roundUpTenthGram(primaryKg * BACKUP_FACTOR);
