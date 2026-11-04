import type { ComponentNode, ComponentType, RocketTree } from '../../engine/openRocketEngine';
import { asStageNodes } from '../design/orkTree';
import { isPrintable } from '../files/componentFormats';

// Keep free of heavy imports (meshers, 3MF writer) so they stay out of the main bundle.

export interface PrintablePart {
  id: string;
  name: string;
  type: ComponentType;
  depth: number;
}

export function printableParts(tree: RocketTree): PrintablePart[] {
  const out: PrintablePart[] = [];
  const walk = (nodes: ComponentNode[] | undefined, depth: number): void => {
    for (const n of nodes ?? []) {
      const id = n.id;
      if (id && isPrintable(n.type)) out.push({ id, name: n.name ?? '', type: n.type, depth });
      // Always recurse: an unprintable parent (stage, pod set) can have printable children.
      walk(n.children, depth + (id && isPrintable(n.type) ? 1 : 0));
    }
  };
  for (const stage of asStageNodes(tree)) walk(stage.children, 0);
  return out;
}
