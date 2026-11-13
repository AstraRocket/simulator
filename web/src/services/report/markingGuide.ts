import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { kernelDefault } from '../../tree/kernelDefaults';
import { ringInstanceOffsets } from '../../tree/assembly';
import { bodyTubeRadius, bool, countOf, finCant, num } from '../../tree/nodeProps';
import { finRootChord, finTabSpan } from '../../tree/finPlanform';
import { isFinSet, isPlanarFinSet } from '../../tree/tubefins';

// Port of desktop swing FinMarkingGuide.java (not extracted); the companion test pins each formula.

export const TWO_PI = 2 * Math.PI;

// FinMarkingGuide.PAPER_THICKNESS_IN_METERS: strip wraps at radius + paper or its ends will not meet.
export const PAPER_THICKNESS_M = 0.0001;

export const GUIDE_WIDTH_MM = 76.2;

interface GuideMark {
  /** mm from the seam edge, along the wrap. */
  posMm: number;
  name: string;
  type: string;
  /** rad */
  cant: number;
  rootChordMm: number;
  slot: GuideSlot | null;
}

/** mm, measured forward from the aft end of the fin's root. */
export interface GuideSlot {
  aftMm: number;
  foreMm: number;
  widthMm: number;
}

export interface MarkingGuide {
  tubeId: string;
  name: string;
  /** Paper wrap length, not the tube's circumference. */
  circumferenceMm: number;
  /** Seam angle (rad). */
  origin: number;
  marks: GuideMark[];
}

type OmitReason = 'noWrap' | 'noFins';

interface OmittedPart {
  name: string;
  type: string;
  reason: OmitReason;
}

export interface MarkingGuideSet {
  guides: MarkingGuide[];
  omitted: OmittedPart[];
}

const isAngular = (type: string): boolean => isFinSet(type) || type === 'launchlug' || type === 'railbutton';

export const guideCircumferenceMm = (outerRadiusM: number): number =>
  (outerRadiusM + PAPER_THICKNESS_M) * TWO_PI * 1000;

// Unlike upstream makeZeroTwoPi, exactly 2π folds to 0 so radialOrigin sees no phantom gap.
export const zeroTwoPi = (v: number): number => {
  const r = v % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
};

// FinMarkingGuide.findRadialOrigin; the wrap-around gap is seeded first.
export function radialOrigin(angles: number[]): number {
  const pos = angles.map(zeroTwoPi).sort((a, b) => a - b);
  if (pos.length === 0) return 0;
  if (pos.length === 1) return zeroTwoPi(pos[0]! + Math.PI);

  let biggest = TWO_PI - pos[pos.length - 1]! + pos[0]!;
  let center = zeroTwoPi(pos[0]! - biggest / 2);
  for (let i = 1; i < pos.length; i++) {
    const d = pos[i]! - pos[i - 1]!;
    if (d > biggest) {
      biggest = d;
      center = zeroTwoPi(pos[i - 1]! + d / 2);
    }
  }
  return center;
}

// Props and fallbacks must match rocketPieces.ts and exportParts.ts/exportWriters.ts.
export function mountAngles(node: ComponentNode): number[] {
  const type = String(node.type);
  if (!isFinSet(type)) return [num(node, 'angleOffset', kernelDefault(type, 'angleOffset') ?? Math.PI)];
  const count = countOf(node, 'finCount', kernelDefault(type, 'finCount') ?? 3);
  return ringInstanceOffsets(count, 0, num(node, 'rotation', 0)).map((o) => o.angle);
}

export function cutPoints(markPositions: number[], circumferenceMm: number, maxLengthMm: number): number[] {
  const parts = Math.max(1, Math.ceil(circumferenceMm / maxLengthMm - 1e-9));
  if (parts === 1) return [0, circumferenceMm];

  const sorted = [...markPositions].sort((a, b) => a - b);
  const edges = [0, ...sorted, circumferenceMm];
  const candidates = edges.slice(1).map((e, i) => (e + edges[i]!) / 2);
  const clearance = (at: number) => sorted.reduce((best, m) => Math.min(best, Math.abs(m - at)), Infinity);

  const cuts = [0];
  for (let k = 1; k < parts; k++) {
    const prev = cuts[k - 1]!;
    const lo = Math.max(prev, circumferenceMm - (parts - k) * maxLengthMm);
    const hi = Math.min(circumferenceMm, prev + maxLengthMm);
    const even = Math.min(hi, Math.max(lo, (k * circumferenceMm) / parts));
    let best = even;
    let bestClear = clearance(even);
    for (const c of [lo, hi, ...candidates]) {
      if (c < lo || c > hi) continue;
      const clear = clearance(c);
      if (clear > bestClear || (clear === bestClear && Math.abs(c - even) < Math.abs(best - even))) {
        best = c;
        bestClear = clear;
      }
    }
    cuts.push(best);
  }
  cuts.push(circumferenceMm);
  return cuts;
}

function finSlot(fin: ComponentNode, tube: ComponentNode): GuideSlot | null {
  const type = String(fin.type);
  if (!isPlanarFinSet(type) || finCant(fin) !== 0 || bool(tube, 'filled')) return null;
  const root = finRootChord(fin);
  const tab = finTabSpan(fin, root, bodyTubeRadius(tube));
  if (!tab) return null;
  const thickness = kernelDefault(type, 'thickness') ?? 0;
  return {
    aftMm: (root - tab.x1) * 1000,
    foreMm: (root - tab.x0) * 1000,
    widthMm: num(fin, 'thickness', thickness) * 1000,
  };
}

function buildGuide(tube: ComponentNode, angular: ComponentNode[]): MarkingGuide {
  const circumferenceMm = guideCircumferenceMm(bodyTubeRadius(tube));
  const raw = angular.flatMap((c) => mountAngles(c).map((angle) => ({ angle, node: c })));
  const origin = radialOrigin(raw.map((r) => r.angle));
  const marks = raw
    .map(({ angle, node }) => {
      const posMm = (zeroTwoPi(angle - origin) / TWO_PI) * circumferenceMm;
      const planar = isPlanarFinSet(String(node.type));
      const cant = planar ? finCant(node) : 0;
      return {
        posMm,
        name: String(node.name ?? ''),
        type: String(node.type),
        cant,
        rootChordMm: cant !== 0 ? finRootChord(node) * 1000 : 0,
        slot: finSlot(node, tube),
      };
    })
    .sort((a, b) => a.posMm - b.posMm);

  return { tubeId: String(tube.id), name: String(tube.name ?? ''), circumferenceMm, origin, marks };
}

export function markingGuides(tree: RocketTree): MarkingGuideSet {
  const guides: MarkingGuide[] = [];
  const omitted: OmittedPart[] = [];

  const visit = (node: ComponentNode): void => {
    const kids = node.children ?? [];
    const angular = kids.filter((c) => isAngular(String(c.type)));
    if (angular.length) {
      const reason: OmitReason | null =
        node.type !== 'bodytube' ? 'noWrap' : angular.some((c) => isFinSet(String(c.type))) ? null : 'noFins';
      if (reason === null) guides.push(buildGuide(node, angular));
      else for (const c of angular) omitted.push({ name: String(c.name ?? ''), type: String(c.type), reason });
    }
    for (const c of kids) visit(c);
  };
  for (const stage of tree.components) visit(stage);

  return { guides, omitted };
}
