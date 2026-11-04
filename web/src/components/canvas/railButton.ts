import type { ComponentNode } from '../../engine/openRocketEngine';
import { num } from '../../tree/nodeProps';
import { KERNEL_RAILBUTTON_OUTER_DIAMETER } from '../../tree/kernelDefaults';
import { COMPONENT_DEFAULTS } from '../../services/design/componentDefaults';

// `reach` is height plus screw head, as `RailButton.getInstanceBoundingBox` bounds an instance.
export function railButtonSize(node: ComponentNode): { diameter: number; reach: number } {
  const height = Math.max(0, num(node, 'height', COMPONENT_DEFAULTS.railbutton.height));
  const screw = Math.max(0, num(node, 'screwHeight', COMPONENT_DEFAULTS.railbutton.screwHeight));
  return { diameter: num(node, 'outerDiameter', KERNEL_RAILBUTTON_OUTER_DIAMETER), reach: height + screw };
}
