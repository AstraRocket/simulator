import type { ComponentNode } from '../../../engine/openRocketEngine';
import { num } from '../../../tree/nodeProps';
import { nodeOuterProfile, profileEnds, shouldersOf, type Shoulder } from '../../../tree/shapeProfile';
import { partLength } from '../../../tree/position';
import { kernelDefault } from '../../../tree/kernelDefaults';

// Points are `[radius, y]` with aft at y = 0, ordered fore to aft.
// Wall is `thickness * hyp / l` per slice (`SymmetricComponent.calculateProperties`), not `r - thickness`.

/** `SymmetricComponent.DIVISIONS`. */
const DIVISIONS = 128;

/** `Transition.MINFEATURE`. */
const MIN_FEATURE = 0.001;

const EPS = 1e-9;

export type Pt = [number, number];

export interface Section {
  profile: Pt[];
  innerProfile: Pt[];
  innerIsAxis: boolean;
}

export interface SymmetricSections {
  body: Section;
  shoulders: { fore: Section | null; aft: Section | null };
}

function push(points: Pt[], p: Pt): void {
  const last = points[points.length - 1];
  if (last && Math.abs(last[0] - p[0]) < EPS && Math.abs(last[1] - p[1]) < EPS) return;
  points.push(p);
}

function axisBore(fore: number, aft: number): Pt[] {
  return [
    [0, fore],
    [0, aft],
  ];
}

function stations(node: ComponentNode, length: number): number[] {
  const { fore, aft } = profileEnds(node);
  return nodeOuterProfile(node, length, fore, aft, DIVISIONS).map(([, r]) => r);
}

/** A boundary takes the mean of its two slices' depths; an end takes its one slice's. */
function boreRadii(radii: number[], length: number, wall: number): number[] {
  const l = length / DIVISIONS;
  const depth = radii.slice(1).map((r, n) => (wall * Math.hypot(r - radii[n]!, l)) / l);
  return radii.map((r, i) => {
    const before = depth[i - 1];
    const after = depth[i];
    const d = before === undefined ? (after ?? 0) : after === undefined ? before : (before + after) / 2;
    return Math.max(r - d, 0);
  });
}

function bodySection(node: ComponentNode, length: number, radii: number[]): Section {
  const y = (i: number) => length * (1 - i / DIVISIONS);
  const profile: Pt[] = [];
  radii.forEach((r, i) => push(profile, [r, y(i)]));
  if (node['filled'] === true) return { profile, innerProfile: axisBore(length, 0), innerIsAxis: true };
  const wall = num(node, 'thickness', kernelDefault(node.type, 'thickness') ?? 0);
  const bore = boreRadii(radii, length, wall);
  if (bore.every((r) => r < EPS)) return { profile, innerProfile: axisBore(length, 0), innerIsAxis: true };
  const innerProfile: Pt[] = [];
  bore.forEach((r, i) => push(innerProfile, [r, y(i)]));
  return { profile, innerProfile, innerIsAxis: false };
}

/** Outline and bore step to the body's at the end plane so the union has a face to merge on. */
function shoulderSection(
  s: Shoulder,
  which: 'fore' | 'aft',
  length: number,
  endR: number,
  bodyBore: number,
): Section | null {
  if (!(s.length > MIN_FEATURE) || !(s.radius > 0) || !(s.thickness > 0)) return null;
  const bore = Math.max(s.radius - s.thickness, 0);
  const solid = bore < EPS;
  const joinBore = solid ? 0 : bodyBore;
  const cap = s.capped && !solid ? Math.min(s.thickness, s.length) : 0;
  const profile: Pt[] = [];
  const innerProfile: Pt[] = [];
  if (which === 'fore') {
    const free = length + s.length;
    push(profile, [s.radius, free]);
    push(profile, [s.radius, length]);
    push(profile, [endR, length]);
    if (cap > 0) {
      push(innerProfile, [0, free]);
      push(innerProfile, [0, free - cap]);
      push(innerProfile, [bore, free - cap]);
    } else {
      push(innerProfile, [bore, free]);
    }
    push(innerProfile, [bore, length]);
    push(innerProfile, [joinBore, length]);
  } else {
    const free = -s.length;
    push(profile, [endR, 0]);
    push(profile, [s.radius, 0]);
    push(profile, [s.radius, free]);
    push(innerProfile, [joinBore, 0]);
    push(innerProfile, [bore, 0]);
    if (cap > 0) {
      push(innerProfile, [bore, free + cap]);
      push(innerProfile, [0, free + cap]);
      push(innerProfile, [0, free]);
    } else {
      push(innerProfile, [bore, free]);
    }
  }
  return { profile, innerProfile, innerIsAxis: innerProfile.every(([r]) => r < EPS) };
}

export function symmetricSections(node: ComponentNode): SymmetricSections {
  const length = Math.max(partLength(node), 0);
  const radii = stations(node, length);
  const body = bodySection(node, length, radii);
  const { fore, aft } = shouldersOf(node);
  const boreAt = (end: 'fore' | 'aft'): number => {
    const pts = body.innerProfile;
    return (end === 'fore' ? pts[0] : pts[pts.length - 1])?.[0] ?? 0;
  };
  return {
    body,
    shoulders: {
      fore: shoulderSection(fore, 'fore', length, radii[0] ?? 0, boreAt('fore')),
      aft: shoulderSection(aft, 'aft', length, radii[radii.length - 1] ?? 0, boreAt('aft')),
    },
  };
}
