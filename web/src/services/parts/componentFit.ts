import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { num } from '../../tree/nodeProps';
import { ringBore, tubeRadii } from '../design/discGeometry';
import { findNode, findParent } from '../design/treeEdit';
import { symmetricNeighbors } from '../design/autoRadius';
import { profileEnds } from '../../tree/shapeProfile';
import { axialFrameOf } from '../../tree/axialRebase';
import { KERNEL_AUTO_RADIUS } from '../../tree/kernelDefaults';
import type { FitContext } from './componentFilter';

/** `profileEnds` knows a flipped nose cone's base is its fore end. */
function endDiameter(n: ComponentNode, end: 'fore' | 'aft'): number | undefined {
  if (n.type === 'bodytube') return num(n, 'outerRadius', KERNEL_AUTO_RADIUS) * 2;
  if (n.type === 'nosecone' || n.type === 'transition') return profileEnds(n)[end] * 2;
  return undefined;
}

function innerDiameter(n: ComponentNode): number | undefined {
  if (n.type !== 'bodytube' && n.type !== 'tubecoupler' && n.type !== 'innertube') return undefined;
  const innerR = tubeRadii(n)?.innerR ?? 0;
  return innerR > 0 ? innerR * 2 : undefined;
}

/** As desktop's `ComponentPresetChooserDialog`: a flipped nose cone's aft column matches the part ahead. */
function neighborMatches(tree: RocketTree, node: ComponentNode): Pick<FitContext, 'foreMatch' | 'aftMatch'> {
  if (node.type !== 'bodytube' && node.type !== 'nosecone' && node.type !== 'transition') return {};
  const around = symmetricNeighbors(tree.components).get(node);
  if (!around) return {};
  const flipped = node.type === 'nosecone' && node['flipped'] === true;
  const aftSide = flipped ? around.previous : around.next;
  return {
    foreMatch: around.previous ? endDiameter(around.previous, 'aft') : undefined,
    aftMatch: aftSide ? endDiameter(aftSide, 'fore') : undefined,
  };
}

function mountDiameter(tree: RocketTree, node: ComponentNode, parent: ComponentNode | null): number | undefined {
  if (node.type !== 'centeringring' || !parent) return undefined;
  const start = parent.id ? (axialFrameOf(tree, parent.id)?.start ?? 0) : 0;
  const bore = ringBore(node, parent, Infinity, start);
  return bore > 0 ? bore * 2 : undefined;
}

export function fitContextFor(tree: RocketTree, nodeId: string | null): FitContext | undefined {
  if (!nodeId) return undefined;
  const node = findNode(tree, nodeId);
  if (!node) return undefined;
  const parent = findParent(tree, nodeId);
  return {
    parentInner: parent ? innerDiameter(parent) : undefined,
    // The mount a ring holds is its sibling, not its child.
    mountOuter: mountDiameter(tree, node, parent),
    ...neighborMatches(tree, node),
  };
}
