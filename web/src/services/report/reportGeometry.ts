import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { bodyTubeRadius, countOf } from '../../tree/nodeProps';
import { isFinSet, tubeFinSeat } from '../../tree/tubefins';
import {
  FREEFORM_FALLBACK,
  bodyRadiusAt,
  finCutContour,
  finMount,
  finPointsWithRoot,
  finSpan,
  type FinParent,
} from '../../tree/finPlanform';
import { nodeOuterProfile, profileEnds } from '../../tree/shapeProfile';
import { axialChain, partLength, podPlacement } from '../../tree/position';
import { isAssembly } from '../../tree/assembly';

// Outputs are mm.

export type Pt = [number, number];
import { M_TO_MM } from '../../prefs/units';
import { kernelDefault } from '../../tree/kernelDefaults';

export function finPlanformMm(node: ComponentNode, parent: FinParent = null): { pts: Pt[]; count: number } {
  const height = finSpan(node);
  const contour = finCutContour(node, parent) ?? FREEFORM_FALLBACK;
  // PDF y grows down: the body surface sits at y = height so the template prints tip-up.
  const pts: Pt[] = contour.map(([x, y]) => [x * M_TO_MM, (height - y) * M_TO_MM]);
  return { pts, count: countOf(node, 'finCount', kernelDefault(String(node.type), 'finCount') ?? 3) };
}

export function profileMm(
  node: ComponentNode,
  foreR: number,
  aftR: number,
): { w: number; h: number; pts: Pt[] } | null {
  const len = partLength(node);
  if (len <= 0) return null;
  const prof = nodeOuterProfile(node, len, foreR, aftR, 80);
  const maxR = Math.max(...prof.map(([, r]) => r), aftR, foreR);
  const h = maxR * 2 * M_TO_MM;
  const cy = h / 2;
  const top: Pt[] = prof.map(([x, r]) => [x * M_TO_MM, cy - r * M_TO_MM]);
  const bot: Pt[] = [...prof].reverse().map(([x, r]) => [x * M_TO_MM, cy + r * M_TO_MM]);
  return { w: len * M_TO_MM, h, pts: [...top, ...bot] };
}

/** Centerline at y = 0, +up (mm). */
export function rocketSideView(tree: RocketTree): { w: number; h: number; body: Pt[]; fins: Pt[][]; pods: Pt[][] } {
  const chain = axialChain(tree);
  const fins: Pt[][] = [];
  const pods: Pt[][] = [];
  let maxUp = 0.001;
  let maxX = 0;

  /** `lx` is m. */
  const radiusSampler = (node: ComponentNode) => (lx: number) => bodyRadiusAt(node, lx) ?? 0;

  const addFins = (
    node: ComponentNode,
    parent: ComponentNode,
    pStart: number,
    pLen: number,
    radiusAt: (lx: number) => number,
    cy: number,
  ) => {
    const push = (plan: Pt[], topR: number) => {
      fins.push(plan.map(([px, py]) => [px * M_TO_MM, (cy + py) * M_TO_MM]));
      fins.push(plan.map(([px, py]) => [px * M_TO_MM, (cy - py) * M_TO_MM])); // mirror below
      maxUp = Math.max(maxUp, Math.abs(cy) + topR);
    };

    if (node.type === 'tubefinset') {
      // No rootChord; its length picks the radius sample station, so a wrong one floats it on a taper.
      const { length: len, start: s0, bodyRadius: R, tubeRadius: rt } = tubeFinSeat(node, pStart, pLen, radiusAt);
      const topR = R + 2 * rt;
      push(
        [
          [s0, R],
          [s0, topR],
          [s0 + len, topR],
          [s0 + len, R],
        ],
        topR,
      );
      return;
    }

    const mount = finMount(node, parent, pStart);
    if (!mount) return;
    const height = finSpan(node);
    const start = pStart + mount.front;
    const R = mount.radiusAt(mount.front);
    // Lifted by the radius under the fin front (FinSet.getFinFront().getY()).
    const outline = finPointsWithRoot(node, mount) ?? FREEFORM_FALLBACK;
    push(
      outline.map(([px, py]) => [start + px, R + py]),
      R + height,
    );
  };

  // Mutually recursive with emitAssembly, so these are hoisted function declarations. Profile is meters.
  function walkChain(nodes: ComponentNode[], xStart: number, cy: number): { profile: Pt[]; endX: number } {
    const profile: Pt[] = [];
    let x = xStart;
    let chainMaxR = 0.001;

    const revolve = (node: ComponentNode, foreR: number, aftR: number, len: number) => {
      for (const [px, r] of nodeOuterProfile(node, len, foreR, aftR, 60)) {
        profile.push([x + px, r]);
        chainMaxR = Math.max(chainMaxR, r);
      }
    };

    const emitChildren = (n: ComponentNode, hostLen: number, radiusAt: (lx: number) => number) => {
      const hostStart = x;
      for (const c of n.children ?? []) {
        const t = String(c.type);
        if (isFinSet(t)) addFins(c, n, hostStart, hostLen, radiusAt, cy);
        else if (isAssembly(t)) emitAssembly(c, n, hostStart, hostLen, cy);
      }
    };

    for (const n of nodes) {
      const len = partLength(n);
      if (n.type === 'nosecone' || n.type === 'transition') {
        const { fore: foreR, aft: aftR } = profileEnds(n);
        revolve(n, foreR, aftR, len);
        emitChildren(n, len, radiusSampler(n));
        x += len;
      } else if (n.type === 'bodytube') {
        const R = bodyTubeRadius(n);
        profile.push([x, R], [x + len, R]);
        chainMaxR = Math.max(chainMaxR, R);
        emitChildren(n, len, radiusSampler(n));
        x += len;
      }
    }

    maxUp = Math.max(maxUp, Math.abs(cy) + chainMaxR);
    maxX = Math.max(maxX, x);
    return { profile, endX: x };
  }

  function emitAssembly(pod: ComponentNode, host: ComponentNode, hostStart: number, hostLen: number, cy: number) {
    const at = podPlacement(pod, host, hostStart, hostLen);
    for (const off of at.copies) {
      const center = cy + off.y;
      const { profile } = walkChain(pod.children ?? [], at.start, center);
      if (profile.length < 2) continue;
      pods.push([
        ...profile.map(([px, r]) => [px * M_TO_MM, (center + r) * M_TO_MM] as Pt),
        ...[...profile].reverse().map(([px, r]) => [px * M_TO_MM, (center - r) * M_TO_MM] as Pt),
      ]);
    }
  }

  const main = walkChain(chain, 0, 0);
  const body: Pt[] = [
    ...main.profile.map(([px, r]) => [px * M_TO_MM, r * M_TO_MM] as Pt),
    ...[...main.profile].reverse().map(([px, r]) => [px * M_TO_MM, -r * M_TO_MM] as Pt),
  ];
  return { w: maxX * M_TO_MM, h: 2 * maxUp * M_TO_MM, body, fins, pods };
}
