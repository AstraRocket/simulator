import type { ComponentNode } from '../../engine/openRocketEngine';

/** Must match the `materials.generated.json` entry (a test holds them equal). */
export const DEFAULT_FILLET_MATERIAL = {
  name: 'Epoxy - West System Six10',
  density: 1180,
  group: 'Adhesives',
} as const;

/** Only for a newly created fillet: one from a file without a material means Cardboard (see filletXml). */
export function withFilletDefault(
  node: ComponentNode | null | undefined,
  patch: Partial<ComponentNode>,
): Partial<ComponentNode> {
  const radius = patch['filletRadius'];
  if (typeof radius !== 'number' || !(radius > 0)) return patch;
  const before = node?.['filletRadius'];
  if (typeof before === 'number' && before > 0) return patch;
  if (node?.['filletDensity'] !== undefined || patch['filletDensity'] !== undefined) return patch;
  return {
    ...patch,
    filletMaterialName: DEFAULT_FILLET_MATERIAL.name,
    filletDensity: DEFAULT_FILLET_MATERIAL.density,
    filletMaterialGroup: DEFAULT_FILLET_MATERIAL.group,
  };
}
