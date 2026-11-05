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

// Charge names are file data in English, not UI text: do not localize them.

export type ChargeRole = 'drogue' | 'main';

export const CHARGE_TYPE = 'deploymentcharge';

export const BACKUP_FACTOR = 1.5;

export interface RecoveryCharge {
  nodeId: string;
  role: ChargeRole;
  backup: boolean;
  /** Powder, kg. */
  massKg: number;
  tubeId: string;
  tubeName: string;
}

export function chargeName(role: ChargeRole, backup: boolean): string {
  return `${role === 'main' ? 'Main' : 'Drogue'} ${backup ? 'backup charge' : 'charge'}`;
}

export function parseChargeName(name: string, isChargeType = false): { role: ChargeRole; backup: boolean } | null {
  const s = name.toLowerCase();
  if (!isChargeType && !/charge/.test(s)) return null;
  const role = /drogue/.test(s) ? 'drogue' : /main/.test(s) ? 'main' : null;
  return role ? { role, backup: /backup/.test(s) } : null;
}

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

export function stageNamesById(tree: RocketTree): Map<string, string> {
  const names = new Map<string, string>();
  for (const stage of stageNodes(tree)) {
    const name = typeof stage.name === 'string' ? stage.name : '';
    for (const n of walkNodes(stage.children ?? [])) if (typeof n.id === 'string') names.set(n.id, name);
  }
  return names;
}

export interface ChargeRow {
  role: ChargeRole;
  tubeId: string;
  tubeName: string;
  stageName?: string;
  primaryKg: number | null;
  backupKg: number | null;
}

// A design can fly two main bays, so a role alone does not name one.
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

// Kg; null removes. Returns the same tree when nothing changes, so no empty undo step is recorded.
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

const roundUpTenthGram = (kg: number): number => Math.ceil(kg * 1e4 - 1e-9) / 1e4;

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

export const suggestedBackup = (primaryKg: number): number => roundUpTenthGram(primaryKg * BACKUP_FACTOR);
