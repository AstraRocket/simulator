import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { clampEntry, SI_LIMITS } from '../../prefs/entryValue';
import type { Quantity } from '../../prefs/units';
import { partLabel } from '../../i18n/format';
import { mapTreePreserving } from '../../tree/treeWalk';

export interface RepairedValue {
  type: string;
  name: string;
  field: string;
  was: number;
  now: number;
}

/** Only bulk densities: a surface or line density has no real ceiling. */
const LIMITED: Record<string, { quantity: Quantity; label: string }> = {
  density: { quantity: 'density', label: 'units.q.density' },
  filletDensity: { quantity: 'density', label: 'prop.filletDensity' },
};

export function repairedText(r: RepairedValue, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const field = LIMITED[r.field]?.label ?? `prop.${r.field}`;
  return t('banner.repaired', { part: partLabel(t, r), field: t(field), was: r.was, now: r.now });
}

export function repairNode(node: ComponentNode): { node: ComponentNode; repaired: RepairedValue[] } {
  const repaired: RepairedValue[] = [];
  let out = node;
  for (const [key, { quantity }] of Object.entries(LIMITED)) {
    // A catalog preset's density can exceed the limit; desktop flies it as stated.
    if (key === 'density' && node['preset']) continue;
    const limit = SI_LIMITS[quantity];
    const v = node[key];
    if (!limit || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const now = clampEntry(v, limit.min, limit.max) ?? v;
    if (now === v) continue;
    repaired.push({ type: node.type, name: typeof node.name === 'string' ? node.name : '', field: key, was: v, now });
    out = { ...out, [key]: now };
  }
  return { node: out, repaired };
}

export function repairValues(tree: RocketTree): { tree: RocketTree; repaired: RepairedValue[] } {
  const repaired: RepairedValue[] = [];

  const fixNode = (node: ComponentNode): ComponentNode => {
    const fixed = repairNode(node);
    repaired.push(...fixed.repaired);
    return fixed.node;
  };

  const components = mapTreePreserving(tree.components, fixNode, 'pre');
  return { tree: components === tree.components ? tree : { ...tree, components }, repaired };
}
