import type { ComponentNode } from '../engine/openRocketEngine';

/** The hidden parts plus everything inside them: a stage never reaches the drawing code, only its parts do. */
export function hiddenPartIds(components: ComponentNode[], hidden: ReadonlySet<string>): ReadonlySet<string> {
  const out = new Set<string>();
  if (hidden.size === 0) return out;
  const walk = (nodes: ComponentNode[], under: boolean) => {
    for (const n of nodes) {
      const hide = under || (!!n.id && hidden.has(n.id));
      if (hide && n.id) out.add(n.id);
      walk(n.children ?? [], hide);
    }
  };
  walk(components, false);
  return out;
}
