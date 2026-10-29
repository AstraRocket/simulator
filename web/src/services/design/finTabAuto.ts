import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { finRootChord } from '../../tree/finPlanform';
import { countOf, num, positionOf } from '../../tree/nodeProps';
import { clusterPlacesOf } from '../../tree/cluster';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import { axialLength, partLength, startFromPosition } from '../../tree/position';
import { parentStartOf } from '../../tree/axialRebase';
import { stationRadius } from '../../tree/shapeProfile';
import { findWithParent } from '../../tree/treeWalk';
import { isChainType } from '../../tree/componentKinds';
import { isPlanarFinSet } from '../../tree/tubefins';

/**
 * OpenRocket's **Calculate automatically** button for a through-the-wall fin tab.
 *
 * A tab is a tongue on the fin root that passes through a slot in the airframe
 * and is glued to what is inside, so the fin's load goes into the motor mount
 * rather than into the tube skin. Where it can go is decided by what is already
 * in the way: it has to sit between two centering rings, reach down to the motor
 * mount tube and no further, and not run past the root chord.
 *
 * That is arithmetic nobody should do by hand, and it is the reason the desktop
 * has a button for it. Ported from `FinSetConfig.calculateAutoTab` and its
 * `computeFinTabLength` helper, including the ring-merging rule and every one of
 * its six cases, because the interesting designs are the ones where a ring
 * straddles an end of the fin root.
 *
 * Returns the patch to apply, or `null` when there is nothing to compute: a fin
 * set on something that is not a symmetric body, which the desktop also does
 * nothing for.
 */

/** Each fin's direction about the body axis and the half width of its tab. */
type FinLines = { angles: number[]; halfThickness: number };

/**
 * The fins as `FinSet.getInstanceAngles` places them: the first at the set's
 * `rotation`, the rest evenly around, in the same y/z frame a cluster tube's
 * center is given in.
 */
function finLines(fin: ComponentNode): FinLines {
  const defaults = KERNEL_DEFAULTS[fin.type as 'trapezoidfinset'];
  const count = countOf(fin, 'finCount', defaults.finCount);
  const rotation = num(fin, 'rotation', 0);
  return {
    angles: Array.from({ length: count }, (_, i) => rotation + (2 * Math.PI * i) / count),
    halfThickness: num(fin, 'thickness', defaults.thickness) / 2,
  };
}

/**
 * How far out from the axis an inner tube meets a fin's tab, the deepest the
 * tab may go: the highest point of any tube of the cluster that lies inside
 * any fin's tab, the tab being a slab its thickness wide along the fin's line.
 *
 * Desktop's `calculateAutoTab` takes the tube's outer radius, as if every
 * tube sat on the axis. For one centered tube that is exactly this answer.
 * For a cluster or an offset mount it is not: a 3-ring of 12 mm tubes reaches
 * about 26 mm out, so a tab cut down to 12 mm runs through them, while a fin
 * that sits between the tubes misses them and may go deeper. 0 when no fin's
 * line meets the tube.
 */
function tubeReach(tube: ComponentNode, fins: FinLines): number {
  const r = num(tube, 'outerRadius', KERNEL_DEFAULTS.innertube.outerRadius);
  const h = fins.halfThickness;
  let reach = 0;
  for (const { radialPosition: d, radialDirection: dir } of clusterPlacesOf(tube)) {
    for (const angle of fins.angles) {
      // The tube's center, along the fin's line and across it.
      const along = d * Math.cos(dir - angle);
      const across = d * Math.sin(dir - angle);
      // The tube's top over the slab is where the slab comes nearest its center.
      const gap = Math.abs(across - Math.max(-h, Math.min(h, across)));
      if (gap >= r) continue;
      reach = Math.max(reach, along + Math.sqrt(r * r - gap * gap));
    }
  }
  return reach;
}

/** A centering ring reduced to what the placement math needs. */
type Ring = {
  /** Distance from the parent's fore end to the ring's fore face. */
  top: number;
  /** The ring's axial thickness (its `length`). */
  thickness: number;
  /** How far out it reaches, which is what decides whether it blocks the tab. */
  outerRadius: number;
};

const ringBottom = (r: Ring): number => r.top + r.thickness;

/**
 * Where a child's fore end sits, measured from its parent's fore end. A fin set
 * has no `length`: its axial extent is the root chord, which a `bottom` or
 * `middle` placement needs to find the leading edge. `parentStart` is the
 * parent's rocket-frame start, which an `absolute` child is measured against.
 */
function offsetFromTop(child: ComponentNode, parentLength: number, parentStart: number): number {
  return startFromPosition(positionOf(child), axialLength(child), parentLength, parentStart);
}

/**
 * Whether a part inside the body overlaps the fin root at all.
 *
 * `FinSetConfig.isComponentInsideFinSpan`: partial overlap counts, because a
 * mount tube that reaches only halfway under the fin still decides how deep the
 * tab can go over that half.
 */
function overlapsFin(childTop: number, childLength: number, finTop: number, finLength: number): boolean {
  const cMin = childTop;
  const cMax = childTop + childLength;
  const fMin = finTop;
  const fMax = finTop + finLength;
  return (cMin >= fMin && cMin < fMax) || (cMax > fMin && cMax <= fMax) || (cMin <= fMin && cMax >= fMax);
}

/**
 * The tab's length and offset, between the last two rings that qualify.
 *
 * A direct port of `computeFinTabLength`, whose own comment lists the six cases:
 * all rings ahead of the fin, one ring ahead and the second ahead of or behind
 * the fin's trailing edge, the same two with the first ring inside the root, and
 * all rings behind the fin. Returns the offset as well, because upstream writes
 * it into the same model it reads.
 */
function tabBetweenRings(rings: Ring[], finTop: number, finLength: number): { length: number; offset: number } {
  // Merge rings that touch or overlap into one virtual ring: two rings glued
  // face to face are one obstruction, and treating them as two would put a tab
  // of zero length between them.
  const sorted = [...rings].sort((a, b) => a.top - b.top);
  const merged: Ring[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && ringBottom(last) >= r.top) {
      const bottom = Math.max(ringBottom(last), ringBottom(r));
      last.top = Math.min(last.top, r.top);
      last.thickness = bottom - last.top;
    } else {
      merged.push({ ...r });
    }
  }

  // The pair the tab goes between: the last two that qualify, walking aft.
  let top: Ring | null = null;
  let bottom: Ring | null = null;
  for (const ring of merged) {
    if (top === null) {
      top = ring;
    } else if (ringBottom(ring) <= finTop) {
      // Entirely ahead of the fin, so it becomes the new upper bound.
      top = ring;
      bottom = null;
    } else if (ringBottom(top) <= finTop) {
      if (bottom === null) {
        // A ring in the forward half of the root is a better upper bound than a
        // lower one; further aft than that and it is the lower bound.
        if (ringBottom(ring) < finTop + finLength / 2) top = ring;
        else bottom = ring;
      } else if (ring.top <= finTop + finLength) {
        top = bottom;
        bottom = ring;
      }
    } else if (bottom === null) {
      bottom = ring;
    }
  }

  let length: number;
  let offset = 0;
  if (top === null || top === bottom) {
    // No usable rings: the tab is the whole root chord.
    length = finLength;
  } else if (bottom === null) {
    if (ringBottom(top) >= finTop) {
      // One ring, its aft face inside the root: start the tab there.
      offset = ringBottom(top) - finTop;
      length = finTop + finLength - ringBottom(top);
    } else {
      const diff = top.top - finTop;
      // The ring is entirely outside the root, so the tab is the whole chord;
      // otherwise it runs from the fin's leading edge to the ring's fore face.
      length = diff < 0 ? finLength : diff;
    }
  } else if (ringBottom(top) < finTop) {
    const toBottomRing = bottom.top - finTop;
    length = toBottomRing > finLength ? finLength : toBottomRing;
  } else {
    offset = ringBottom(top) - finTop;
    length =
      bottom.top > finLength + finTop
        ? // The lower ring is past the trailing edge: stop at the trailing edge.
          finLength + finTop - ringBottom(top)
        : bottom.top - ringBottom(top);
  }
  return { length: Math.max(0, length), offset };
}

/** Whether Calculate automatically has anything to work with on this fin set. */
export function canAutoFinTab(node: ComponentNode | null | undefined, parent: ComponentNode | null): boolean {
  // `stationRadius` treats only a chain member as a body a fin set can be mounted on.
  return !!node && isPlanarFinSet(node.type) && !!parent && isChainType(parent.type);
}

/**
 * Work out a through-the-wall tab for this fin set: the patch to apply, or
 * `null` when there is no symmetric parent to measure against.
 *
 * The offset method is forced to **top**, because both numbers it computes are
 * measured from the fin's leading edge. The desktop puts the user's own choice
 * back afterward, which only matters there because its own spinner shows the
 * offset in that frame; here the patch is the answer and the frame is part of it.
 */
export function autoFinTab(tree: RocketTree, id: string): Partial<ComponentNode> | null {
  const found = findWithParent(tree.components, id);
  if (!found) return null;
  const { node, parent } = found;
  if (!canAutoFinTab(node, parent) || !parent) return null;

  const parentLength = partLength(parent);
  const parentStart = parentStartOf(tree, parent);
  const finLength = finRootChord(node);
  const finTop = offsetFromTop(node, parentLength, parentStart);

  // What is inside the body under the fin. A mount tube sets how deep the tab
  // can go; the rings set where along the root it can sit.
  let maxTubeRadius = 0;
  let maxRingRadius = 0;
  const rings: Ring[] = [];
  const fins = finLines(node);
  for (const child of parent.children ?? []) {
    const top = offsetFromTop(child, parentLength, parentStart);
    if (child.type === 'innertube') {
      if (!overlapsFin(top, partLength(child), finTop, finLength)) continue;
      maxTubeRadius = Math.max(maxTubeRadius, tubeReach(child, fins));
    } else if (child.type === 'centeringring') {
      maxRingRadius = Math.max(maxRingRadius, num(child, 'outerRadius'));
      rings.push({ top, thickness: partLength(child), outerRadius: num(child, 'outerRadius') });
    }
  }
  // A ring no wider than the mount tube is not an obstruction: the tab clears it
  // at the depth the tube already forces.
  const blocking = rings.filter((r) => r.outerRadius > maxTubeRadius);

  const placed =
    maxRingRadius > maxTubeRadius && blocking.length > 0
      ? tabBetweenRings(blocking, finTop, finLength)
      : { length: finLength, offset: 0 };

  const patch: Partial<ComponentNode> = {
    tabOffsetMethod: 'top',
    tabOffset: placed.offset,
    tabLength: placed.length,
  };

  // How deep: down to the mount tube, from whichever end of the tab the body is
  // narrower at. On a boat tail those two differ, and cutting to the wider one
  // would put the tab through the skin.
  const front = finTop + placed.offset;
  const back = front + placed.length;
  const bodyRadius = Math.min(stationRadius(parent, front), stationRadius(parent, back));
  const height = bodyRadius - maxTubeRadius;
  // A negative height means the tube is wider than the body there, which is a
  // broken design rather than a tab; upstream leaves the height alone too.
  if (height >= 0) (patch as Record<string, unknown>)['tabHeight'] = height;
  return patch;
}
