import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { lineageOf } from '../../tree/treeWalk';

export type OverrideKind = 'mass' | 'cg' | 'cd';

const KEYS: Record<OverrideKind, { value: string; sub: string }> = {
  mass: { value: 'overrideMass', sub: 'overrideSubcomponentsMass' },
  cg: { value: 'overrideCGX', sub: 'overrideSubcomponentsCG' },
  cd: { value: 'overrideCD', sub: 'overrideSubcomponentsCD' },
};

/** Kernel `getMassOverriddenBy`: the outermost overriding ancestor wins. */
export function overriddenBy(tree: RocketTree, id: string, kind: OverrideKind): ComponentNode | null {
  const { value, sub } = KEYS[kind];
  const overriding = lineageOf(tree.components, id)
    .slice(1)
    .filter((p) => typeof p[value] === 'number' && p[sub] === true);
  return overriding[overriding.length - 1] ?? null;
}
