import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import type { FlightConfig } from '../flight/flightConfigs';
import { toCatalogMm } from '../motors/catalogUnits';
import { motorFitsMount, mountFit } from '../motors/motorPicker';
import { findMounts } from './treeEdit';

export interface WideMotor {
  node: ComponentNode;
  designation: string;
  /** mm. */
  diameter: number;
  /** mm. */
  bore: number;
}

/**
 * Motors loaded in any configuration that are wider than their mount's bore, by the motor picker's own fit rule.
 * The engine flies them anyway, so this is a build check, not a flight one. Each mount and motor is listed once.
 * Length is left out: a motor may stick out past the mount's overhang setting and still be built.
 */
export function tooWideMotors(tree: RocketTree, configs: readonly FlightConfig[]): WideMotor[] {
  const out: WideMotor[] = [];
  for (const node of findMounts(tree)) {
    const fit = mountFit(node);
    if (!fit) continue;
    const seen = new Set<string>();
    for (const config of configs) {
      const spec = config.motors[node.id as string]?.spec;
      if (!spec?.designation || !(spec.diameter > 0) || seen.has(spec.designation)) continue;
      const diameter = toCatalogMm(spec.diameter);
      if (motorFitsMount({ diameter }, { bore: fit.bore })) continue;
      seen.add(spec.designation);
      out.push({ node, designation: spec.designation, diameter, bore: fit.bore });
    }
  }
  return out;
}
