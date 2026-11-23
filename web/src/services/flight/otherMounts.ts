import { PLUGGED_DELAY, type ComponentNode, type MotorSpec, type RocketTree } from '../../engine/openRocketEngine';
import { findMounts } from '../design/treeEdit';
import { lineageOf } from '../../tree/treeWalk';
import { toCatalogMm } from '../motors/catalogUnits';
import { motorFitsMount, mountFit } from '../motors/motorPicker';
import { sameMotorSpec, type FlightConfig } from './flightConfigs';

export interface OtherMountLoad {
  node: ComponentNode;
  spec: MotorSpec;
  /** Null when the mount is empty in this configuration. */
  replaces: MotorSpec | null;
  /** The mount was plugged, so it stays plugged with the new motor. */
  keptPlugged: boolean;
}

export interface OtherMountOffer {
  loads: OtherMountLoad[];
  /** Mounts the motor is too wide for. */
  skipped: ComponentNode[];
}

/** A booster is a stage of its own, as the kernel numbers it. */
function stageOf(tree: RocketTree, id: string): ComponentNode | null {
  return lineageOf(tree.components, id).find((n) => n.type === 'stage' || n.type === 'parallelstage') ?? null;
}

const plugged = (spec: MotorSpec | undefined): boolean => !!spec && spec.ejectionDelay >= PLUGGED_DELAY;

/**
 * The other mounts of `fromId`'s stage that `spec` could also be loaded into. Each keeps its own
 * ignition (the store spreads the seated entry); a plugged mount stays plugged, since a cluster
 * usually ejects from one motor. Mounts already holding exactly what they would get are left out.
 */
export function otherMountOffer(
  tree: RocketTree,
  config: FlightConfig,
  fromId: string,
  spec: MotorSpec,
): OtherMountOffer {
  const stage = stageOf(tree, fromId);
  const motor = { diameter: toCatalogMm(spec.diameter) };
  const offer: OtherMountOffer = { loads: [], skipped: [] };
  for (const node of findMounts(tree)) {
    const id = node.id as string;
    if (id === fromId || stageOf(tree, id) !== stage) continue;
    const fit = mountFit(node);
    if (fit && !motorFitsMount(motor, fit)) {
      offer.skipped.push(node);
      continue;
    }
    const seated = config.motors[id]?.spec;
    const keptPlugged = plugged(seated) && !plugged(spec);
    const next = keptPlugged ? { ...spec, ejectionDelay: PLUGGED_DELAY } : spec;
    if (seated && sameMotorSpec(seated, next)) continue;
    offer.loads.push({ node, spec: next, replaces: seated ?? null, keptPlugged });
  }
  return offer;
}
