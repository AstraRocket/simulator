import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { walkNodes } from '../../tree/treeWalk';
import { MATERIAL_KEYS, MATERIAL_SLOTS } from './materialSlots';

/**
 * kg/m² and kg/m. A screen for unit slips such as grams entered as kilograms, not measured limits:
 * the parts files shipped a 90 kg/m² paper streamer and a 0.00007 kg/m² nylon canopy.
 */
export const RECOVERY_DENSITY_RANGE = {
  surface: { min: 0.005, max: 1 },
  line: { min: 0.00001, max: 1 },
} as const;

export interface DensityOutlier {
  node: ComponentNode;
  material: 'surface' | 'line';
  density: number;
}

/** Zero is left alone: desktop weighs it as a weightless line, and catalog chutes with a stated mass carry it. */
export function recoveryDensityOutliers(node: ComponentNode): DensityOutlier[] {
  const out: DensityOutlier[] = [];
  for (const { part, material } of MATERIAL_SLOTS) {
    if (part !== node.type || (material !== 'surface' && material !== 'line')) continue;
    const density = node[MATERIAL_KEYS[material].density];
    if (typeof density !== 'number' || !Number.isFinite(density) || density === 0) continue;
    const { min, max } = RECOVERY_DENSITY_RANGE[material];
    if (density < min || density > max) out.push({ node, material, density });
  }
  return out;
}

export function treeRecoveryDensityOutliers(tree: RocketTree): DensityOutlier[] {
  return [...walkNodes(tree.components)].flatMap(recoveryDensityOutliers);
}
