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

/** Ported from OpenRocket `FinSetConfig.calculateAutoTab` and `computeFinTabLength`. */

type FinLines = { angles: number[]; halfThickness: number };

function finLines(fin: ComponentNode): FinLines {
  const defaults = KERNEL_DEFAULTS[fin.type as 'trapezoidfinset'];
  const count = countOf(fin, 'finCount', defaults.finCount);
  const rotation = num(fin, 'rotation', 0);
  return {
    angles: Array.from({ length: count }, (_, i) => rotation + (2 * Math.PI * i) / count),
    halfThickness: num(fin, 'thickness', defaults.thickness) / 2,
  };
}

/** Deliberately differs from desktop, which treats every tube as on-axis (wrong for a cluster or offset mount). */
function tubeReach(tube: ComponentNode, fins: FinLines): number {
  const r = num(tube, 'outerRadius', KERNEL_DEFAULTS.innertube.outerRadius);
  const h = fins.halfThickness;
  let reach = 0;
  for (const { radialPosition: d, radialDirection: dir } of clusterPlacesOf(tube)) {
    for (const angle of fins.angles) {
      const along = d * Math.cos(dir - angle);
      const across = d * Math.sin(dir - angle);
      const gap = Math.abs(across - Math.max(-h, Math.min(h, across)));
      if (gap >= r) continue;
      reach = Math.max(reach, along + Math.sqrt(r * r - gap * gap));
    }
  }
  return reach;
}

type Ring = {
  /** From the parent's fore end. */
  top: number;
  /** Axial. */
  thickness: number;
  outerRadius: number;
};

const ringBottom = (r: Ring): number => r.top + r.thickness;

function offsetFromTop(child: ComponentNode, parentLength: number, parentStart: number): number {
  return startFromPosition(positionOf(child), axialLength(child), parentLength, parentStart);
}

/** `FinSetConfig.isComponentInsideFinSpan`: partial overlap counts. */
function overlapsFin(childTop: number, childLength: number, finTop: number, finLength: number): boolean {
  const cMin = childTop;
  const cMax = childTop + childLength;
  const fMin = finTop;
  const fMax = finTop + finLength;
  return (cMin >= fMin && cMin < fMax) || (cMax > fMin && cMax <= fMax) || (cMin <= fMin && cMax >= fMax);
}

/** A direct port of `computeFinTabLength`. */
function tabBetweenRings(rings: Ring[], finTop: number, finLength: number): { length: number; offset: number } {
  // Touching rings merge; as two they would leave a zero-length tab between them.
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

  let top: Ring | null = null;
  let bottom: Ring | null = null;
  for (const ring of merged) {
    if (top === null) {
      top = ring;
    } else if (ringBottom(ring) <= finTop) {
      top = ring;
      bottom = null;
    } else if (ringBottom(top) <= finTop) {
      if (bottom === null) {
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
    length = finLength;
  } else if (bottom === null) {
    if (ringBottom(top) >= finTop) {
      offset = ringBottom(top) - finTop;
      length = finTop + finLength - ringBottom(top);
    } else {
      const diff = top.top - finTop;
      length = diff < 0 ? finLength : diff;
    }
  } else if (ringBottom(top) < finTop) {
    const toBottomRing = bottom.top - finTop;
    length = toBottomRing > finLength ? finLength : toBottomRing;
  } else {
    offset = ringBottom(top) - finTop;
    length = bottom.top > finLength + finTop ? finLength + finTop - ringBottom(top) : bottom.top - ringBottom(top);
  }
  return { length: Math.max(0, length), offset };
}

export function canAutoFinTab(node: ComponentNode | null | undefined, parent: ComponentNode | null): boolean {
  return !!node && isPlanarFinSet(node.type) && !!parent && isChainType(parent.type);
}

/** Forces offset method top: both computed numbers are measured from the fin's leading edge. */
export function autoFinTab(tree: RocketTree, id: string): Partial<ComponentNode> | null {
  const found = findWithParent(tree.components, id);
  if (!found) return null;
  const { node, parent } = found;
  if (!canAutoFinTab(node, parent) || !parent) return null;

  const parentLength = partLength(parent);
  const parentStart = parentStartOf(tree, parent);
  const finLength = finRootChord(node);
  const finTop = offsetFromTop(node, parentLength, parentStart);

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

  // The narrower end: on a boat tail the wider end would put the tab through the skin.
  const front = finTop + placed.offset;
  const back = front + placed.length;
  const bodyRadius = Math.min(stationRadius(parent, front), stationRadius(parent, back));
  const height = bodyRadius - maxTubeRadius;
  if (height >= 0) (patch as Record<string, unknown>)['tabHeight'] = height;
  return patch;
}
