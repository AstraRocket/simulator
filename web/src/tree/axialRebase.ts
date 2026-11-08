import type { ComponentNode, ComponentPosition, RocketTree } from '../engine/openRocketEngine';
import { axialLength, axialStart, layStages, partLength, stacksInParent, startFromPosition } from './position';

// A method change keeps the part in place, as `setAxialMethod` and `setTabOffsetMethod` do.

export interface AxialFrame {
  start: number;
  length: number;
}

// A pod or booster member is placed by its first copy, as `getComponentLocations()[0]` is.
export function axialFrames(tree: RocketTree): Map<string, AxialFrame> {
  const out = new Map<string, AxialFrame>();
  const visit = (n: ComponentNode, start: number, length: number): void => {
    if (n.id) out.set(n.id, { start, length });
    let chained = start;
    for (const c of n.children ?? []) {
      if (stacksInParent(n, c)) {
        const len = partLength(c);
        visit(c, chained, len);
        chained += len;
        continue;
      }
      const own = axialLength(c);
      visit(c, axialStart(c, own, start, length), own);
    }
  };
  for (const { stage, start, length } of layStages(tree, visit)) {
    if (stage.type === 'stage' && stage.id) out.set(stage.id, { start, length });
  }
  return out;
}

export function axialFrameOf(tree: RocketTree, id: string): AxialFrame | null {
  return axialFrames(tree).get(id) ?? null;
}

export function parentStartOf(tree: RocketTree, parent: ComponentNode | null | undefined): number {
  return (parent?.id ? axialFrameOf(tree, parent.id)?.start : undefined) ?? 0;
}

/** As AxialMethod.getAsOffset; `childLen` is a fin set's root chord. */
export function rebasePosition(
  pos: ComponentPosition,
  method: ComponentPosition['method'],
  childLen: number,
  parent: AxialFrame,
): ComponentPosition {
  if (method === pos.method) return pos;
  // Leading edge, from the parent's leading edge.
  const rel = startFromPosition(pos, childLen, parent.length, parent.start);
  const offset =
    method === 'absolute'
      ? rel + parent.start
      : method === 'middle'
        ? rel + (childLen - parent.length) / 2
        : method === 'bottom'
          ? rel + (childLen - parent.length)
          : rel;
  return { method, offset };
}
