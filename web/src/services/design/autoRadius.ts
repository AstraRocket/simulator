import { must } from '../app/must';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { KERNEL_AUTO_RADIUS, KERNEL_DEFAULTS, kernelLength } from '../../tree/kernelDefaults';
import { bodyTubeRadius, noseConeAftRadius, num, str, transitionOuterRadius } from '../../tree/nodeProps';
import { tubeFinRadius } from '../../tree/tubefins';
import { DISC_TYPES } from '../files/componentFormats';
import { COMPONENT_DEFAULTS } from './componentDefaults';
import { boreAround, ringBore, tubeRadii } from './discGeometry';
import { mapTreePreserving, walkNodes, type MapContext } from '../../tree/treeWalk';
import { axialFrames } from '../../tree/axialRebase';
import { isPlanarFinSet } from '../../tree/tubefins';
import { isZero } from '../motors/mathEquals';
import { ASSEMBLY_TYPES, CHAIN_TYPES, MASS_OBJECT_TYPES } from '../../tree/componentKinds';
import { startFromPosition } from '../../tree/position';

// Mirrors OpenRocket's SymmetricComponent/Transition/BodyTube auto radii. An auto
// tube remembers its last source (`refComp`), so results depend on evaluation order.

type Patch = Partial<Record<string, number | boolean>>;

type Axial = 'top' | 'middle' | 'bottom' | 'after' | 'absolute';

interface Part {
  node: ComponentNode | null;
  type: string;
  parent: Part | null;
  /** Children attached so far: the bridge attaches one at a time, in tree order. */
  kids: Part[];
  design: Part[];
  symmetric: boolean;
  tube: boolean;
  ring: boolean;
  assembly: boolean;
  foreAuto: boolean;
  aftAuto: boolean;
  fore: number;
  aft: number;
  /** `BodyTube.refComp`: the neighbor this tube last took its radius from. */
  ref: Part | null;
  /** An assembly's is 0 until the rocket is updated. */
  length: number;
  method: Axial;
  offset: number;
  /** `position.x`, from the parent's fore end. */
  x: number;
  radiusMethod: string;
  radiusOffset: number;
  instances: number;
}

const hasRadius = (node: ComponentNode, key: string): boolean => Number.isFinite(node[key]);

const ASSEMBLIES = new Set(['stage', 'podset', 'parallelstage']);
const RINGS = ASSEMBLY_TYPES as ReadonlySet<string>;
const SYMMETRIC = CHAIN_TYPES as ReadonlySet<string>;
const AXIAL = new Set<string>(['top', 'middle', 'bottom', 'after', 'absolute']);
const MASS_OBJECTS = MASS_OBJECT_TYPES as ReadonlySet<string>;
const RING_PARTS = DISC_TYPES;

function asPosition(method: Axial, offset: number, inner: number, outer: number, parentStart: number): number {
  return method === 'after' ? outer + offset : startFromPosition({ method, offset }, inner, outer, parentStart);
}

/** `RocketComponent.setAxialOffset` snaps a position within a micrometer to zero. */
const snap = (x: number): number => (Math.abs(x) < 1e-6 ? 0 : x);

const MAX_DEPTH = 400;

class TooDeep extends Error {}

function partOf(node: ComponentNode | null, type: string): Part {
  const n = node ?? ({} as ComponentNode);
  const r = (key: string) => num(n, key, 0);
  const raw = n.position as { method?: unknown; offset?: unknown } | null | undefined;
  const placed = raw !== null && typeof raw === 'object';
  const rawMethod = placed && typeof raw.method === 'string' ? raw.method.toLowerCase() : '';
  const offset = placed && typeof raw.offset === 'number' && Number.isFinite(raw.offset) ? raw.offset : 0;
  const ring = RINGS.has(type);
  const assembly = ASSEMBLIES.has(type);
  const symmetric = SYMMETRIC.has(type);
  // Unplaced: body part AFTER, pod set BOTTOM; assemblies never AFTER (ComponentAssembly.setAxialMethod).
  let method: Axial = AXIAL.has(rawMethod) ? (rawMethod as Axial) : placed ? 'top' : 'after';
  if (ring) method = !placed ? 'bottom' : method === 'after' ? 'top' : method;
  if (type === 'stage') method = 'after';
  const p: Part = {
    node,
    type,
    parent: null,
    kids: [],
    design: [],
    symmetric,
    tube: type === 'bodytube',
    ring,
    assembly: assembly || type === 'rocket',
    foreAuto: false,
    aftAuto: false,
    fore: 0,
    aft: 0,
    ref: null,
    length: symmetric ? num(n, 'length', kernelLength(n.type) ?? 0) : 0,
    method,
    offset,
    // Placed before it has a parent, a part's position is its offset as given.
    x: !ring && placed ? snap(offset) : 0,
    radiusMethod: ring ? str(n, 'radiusMethod', 'relative').toLowerCase().replace(/_/g, '') : 'coaxial',
    radiusOffset: 0,
    instances: ring ? Math.max(1, Math.floor(num(n, 'instanceCount', KERNEL_DEFAULTS.podset.instanceCount))) : 1,
  };
  // PodSet.setRadiusOffset zeroes it except for RELATIVE and FREE.
  if (p.radiusMethod === 'relative' || p.radiusMethod === 'free') p.radiusOffset = num(n, 'radiusOffset', 0);
  if (type === 'bodytube') {
    const auto = n['outerRadiusAuto'] === true;
    const radius = bodyTubeRadius(n);
    Object.assign(p, { foreAuto: auto, aftAuto: auto, fore: radius, aft: radius });
  } else if (type === 'nosecone') {
    // `aftRadius` is the base wherever it sits; flipped, the base is in front.
    const auto = n['aftRadiusAuto'] === true;
    Object.assign(
      p,
      n['flipped'] === true
        ? { fore: noseConeAftRadius(n), aft: 0, foreAuto: auto, aftAuto: false }
        : { fore: 0, aft: noseConeAftRadius(n), foreAuto: false, aftAuto: auto },
    );
  } else if (type === 'transition') {
    Object.assign(p, {
      fore: r('foreRadius'),
      aft: r('aftRadius'),
      // An end with no radius is automatic, as ComponentFactory builds it.
      foreAuto: n['foreRadiusAuto'] === true || !hasRadius(n, 'foreRadius'),
      aftAuto: n['aftRadiusAuto'] === true || !hasRadius(n, 'aftRadius'),
    });
  }
  return p;
}

function rocketOf(components: readonly ComponentNode[]): { rocket: Part; staged: boolean } {
  const rocket = partOf(null, 'rocket');
  const make = (node: ComponentNode, parent: Part): Part => {
    const p = partOf(node, node.type);
    p.parent = parent;
    p.design = (node.children ?? []).map((c) => make(c, p));
    return p;
  };
  const staged = components.some((c) => c.type === 'stage');
  if (staged) {
    rocket.design = components.map((c) => make(c, rocket));
  } else {
    const stage = partOf(null, 'stage');
    stage.parent = rocket;
    stage.design = components.map((c) => make(c, stage));
    rocket.design = [stage];
  }
  return { rocket, staged };
}

/**
 * Replays the bridge's kernel call order (build, instance passes, settleAutoRadii,
 * getComponentGeometry): each `refComp` write changes every later evaluation.
 *
 * One long function on purpose: its helpers share `changes`, `depth` and `located` and must run in
 * the kernel's order. Splitting them would thread that state through every call and make this
 * harder to compare with the kernel.
 */
// eslint-disable-next-line max-lines-per-function -- helpers share state in kernel order; see the comment above
function resolveAxial(
  components: readonly ComponentNode[],
  out: Map<ComponentNode, Patch>,
  neighbors?: Map<ComponentNode, Neighbors>,
): void {
  const { rocket, staged } = rocketOf(components);
  let changes = 0;
  let depth = 0;
  const located = new Set<Part>();

  const lengthOf = (p: Part): number => p.length;
  const parentLength = (p: Part): number => (p.parent && p.parent.type !== 'rocket' ? lengthOf(p.parent) : 0);
  const frontOf = (p: Part): number => (p.parent ? frontOf(p.parent) + p.x : 0);
  const parentFront = (p: Part): number => (p.parent ? frontOf(p.parent) : 0);
  const offsetTop = (p: Part): number => {
    const v = p.x;
    return p.type === 'podset' && Math.abs(v) < 1e-8 ? 0 : v;
  };
  const offsetBottom = (p: Part): number => {
    const v = p.x + lengthOf(p) - parentLength(p);
    return p.type === 'podset' && Math.abs(v) < 1e-8 ? 0 : v;
  };

  const ringRadius = (asm: Part, part: Part): number => {
    switch (asm.radiusMethod) {
      case 'free':
        return asm.radiusOffset;
      case 'relative':
      case 'surface': {
        let r = asm.radiusMethod === 'relative' ? asm.radiusOffset : 0;
        if (asm.parent?.tube) r += outerRadius(asm.parent);
        if (part.ring) r += boundingRadius(part);
        return r;
      }
      default:
        return 0;
    }
  };

  const boundingRadius = (asm: Part): number => {
    let r = 0;
    for (const c of asm.kids) {
      if (c.tube) r = Math.max(r, outerRadius(c));
      else if (c.symmetric) {
        const fore = foreRadius(c);
        r = Math.max(r, Math.max(fore, aftRadius(c)));
      }
    }
    return r;
  };

  const inline = (self: Part, candidate: Part): boolean => {
    if (self.parent === candidate.parent) return true;
    const own = must(self.parent, 'part parent');
    if (own.ring && !isZero(ringRadius(own, self))) return false;
    const theirs = must(candidate.parent, 'part parent');
    if (theirs.ring) {
      // An auto tube's own pods are never in line: their radius reads the tube's.
      if (theirs.parent === self && (self.aftAuto || self.foreAuto)) return false;
      return isZero(ringRadius(theirs, candidate));
    }
    return true;
  };

  const placeOf = (self: Part, step: -1 | 1) => {
    const parent = self.parent;
    const grand = parent?.parent;
    if (!parent || !grand) return null;
    return { parent, grand, i: grand.kids.indexOf(parent), j: parent.kids.indexOf(self) + step };
  };

  const previous = (self: Part): Part | null => {
    const place = placeOf(self, -1);
    if (!place) return null;
    const { parent, grand } = place;
    let { i, j } = place;
    while (i >= 0) {
      const at = grand.kids[i]!;
      if (at.assembly) {
        for (; j >= 0; j--) {
          const sibling = at.kids[j]!;
          if (sibling.symmetric && inline(self, sibling)) return previousFromAssembly(sibling, sibling, 0);
        }
      }
      i--;
      if (i >= 0) j = grand.kids[i]!.kids.length - 1;
    }
    // An in-line pod part starting behind its host tube's fore end follows the tube itself.
    if (grand.symmetric && inline(self, grand)) {
      return offsetTop(parent) + offsetTop(self) > 0 ? grand : previous(grand);
    }
    return null;
  };

  const previousFromAssembly = (parent: Part | null, prev: Part | null, flush: number): Part | null => {
    if (!prev) return parent;
    if (!parent) return prev;
    let max = prev.aftAuto ? 0 : aftRadius(prev);
    let found: Part | null = prev;
    for (const asm of parent.kids.filter((k) => k.assembly)) {
      if (asm.kids.length === 0) continue;
      const last = asm.kids[asm.kids.length - 1]!;
      if (!(last.symmetric && inline(parent, last))) continue;
      const deviation = flush + offsetBottom(asm);
      if (isZero(deviation) && !last.aftAuto && aftRadius(last) > max) {
        found = last;
        max = aftRadius(found);
      }
      found = previousFromAssembly(last, found, deviation);
      if (found && !found.aftAuto) max = aftRadius(found);
    }
    return found;
  };

  const next = (self: Part): Part | null => {
    const place = placeOf(self, 1);
    if (!place) return null;
    const { parent, grand } = place;
    let { i, j } = place;
    for (; i < grand.kids.length; i++, j = 0) {
      const at = grand.kids[i]!;
      if (!at.assembly) continue;
      for (; j < at.kids.length; j++) {
        const sibling = at.kids[j]!;
        if (sibling.symmetric && inline(self, sibling)) return nextFromAssembly(sibling, sibling, 0);
      }
    }
    for (const child of self.kids) {
      if (!child.assembly) continue;
      for (const grandchild of child.kids) {
        if (grandchild.symmetric && inline(self, grandchild)) {
          return offsetBottom(parent) + offsetBottom(self) < 0 ? grandchild : next(grandchild);
        }
      }
    }
    return null;
  };

  const nextFromAssembly = (parent: Part | null, nxt: Part | null, flush: number): Part | null => {
    if (!nxt) return parent;
    if (!parent) return nxt;
    let max = nxt.foreAuto ? 0 : foreRadius(nxt);
    let found: Part | null = nxt;
    for (const asm of parent.kids.filter((k) => k.assembly)) {
      if (asm.kids.length === 0) continue;
      const first = asm.kids[0]!;
      if (!(first.symmetric && inline(parent, first))) continue;
      const deviation = flush + offsetTop(asm);
      if (isZero(deviation) && !first.foreAuto && foreRadius(first) > max) {
        found = first;
        max = foreRadius(found);
      }
      found = nextFromAssembly(first, found, deviation);
      if (found && !found.foreAuto) max = foreRadius(found);
    }
    return found;
  };

  const usesNext = (c: Part): boolean => (c.tube ? c.aftAuto && c.ref === next(c) : c.aftAuto);
  const usesPrevious = (c: Part): boolean => (c.tube ? c.foreAuto && c.ref === previous(c) : c.foreAuto);

  const frontAuto = (c: Part): number => {
    if (c.tube) {
      if (!c.aftAuto) return c.aft;
      const p = previous(c);
      return p ? frontAuto(p) : -1;
    }
    return c.aftAuto ? -1 : c.aft;
  };
  const rearAuto = (c: Part): number => {
    if (c.tube) {
      if (!c.foreAuto) return c.fore;
      const n = next(c);
      return n ? rearAuto(n) : -1;
    }
    return c.foreAuto ? -1 : c.fore;
  };

  /** `BodyTube.getAutoOuterRadius` (BodyTube.java:91-110). */
  const autoOuterRadius = (t: Part): number => {
    if (++depth > MAX_DEPTH) throw new TooDeep();
    try {
      const remember = (c: Part) => {
        if (t.ref !== c) changes++;
        t.ref = c;
      };
      let r = -1;
      let c = previous(t);
      if (c && !usesNext(c)) {
        r = frontAuto(c);
        remember(c);
      }
      if (r < 0) {
        c = next(t);
        if (c && !usesPrevious(c)) {
          r = rearAuto(c);
          remember(c);
        }
      }
      return r < 0 ? KERNEL_AUTO_RADIUS : r;
    } finally {
      depth--;
    }
  };
  const outerRadius = (t: Part): number => (t.foreAuto ? autoOuterRadius(t) : t.fore);
  const foreRadius = (c: Part): number => {
    if (c.tube) return outerRadius(c);
    if (!c.foreAuto) return c.fore;
    const p = previous(c);
    return p ? frontAuto(p) : KERNEL_AUTO_RADIUS;
  };
  const aftRadius = (c: Part): number => {
    if (c.tube) return outerRadius(c);
    if (!c.aftAuto) return c.aft;
    const n = next(c);
    return n ? rearAuto(n) : KERNEL_AUTO_RADIUS;
  };
  // Position along a transition decides which end the kernel reads, so both are read.
  const radiusAlong = (s: Part): void => {
    if (s.tube) outerRadius(s);
    else if (s.symmetric) {
      foreRadius(s);
      aftRadius(s);
    }
  };

  const nearest = (p: Part, test: (a: Part) => boolean): Part | null => {
    for (let a = p.parent; a; a = a.parent) if (test(a)) return a;
    return null;
  };
  const radiusIsAuto = (p: Part): boolean => {
    const node = must(p.node, 'part node');
    return node['outerRadiusAuto'] === true || !hasRadius(node, 'outerRadius');
  };
  const isAutoRing = (p: Part): boolean => (p.type === 'tubecoupler' || p.type === 'engineblock') && radiusIsAuto(p);
  const autoTubeFins = (p: Part): boolean => p.type === 'tubefinset' && radiusIsAuto(p);

  const locate = (p: Part): void => {
    if (located.has(p)) return;
    if (p.parent) locate(p.parent);
    if (p.ring) ringRadius(p, p);
    located.add(p);
  };
  const ringOuter = (ring: Part): void => {
    const host = ring.parent;
    if (!host) return;
    locate(host);
    locate(ring);
    for (let face = 0; face < 2; face++) {
      if (isAutoRing(host)) ringOuter(host);
      else radiusAlong(host);
    }
  };
  const tubeFinBody = (p: Part): void => {
    const body = nearest(p, (a) => a.symmetric);
    if (body) radiusAlong(body);
  };

  const attach = (parent: Part): void => {
    for (const p of parent.design) {
      parent.kids.push(p);
      const n = p.node;
      if (n) {
        if (isAutoRing(p)) ringOuter(p);
        if (autoTubeFins(p) && Number.isFinite(n['thickness'])) tubeFinBody(p);
        // setRadiusMethod reads through the default RELATIVE, which adds the parent tube's radius.
        if (p.ring) {
          p.x = n.position ? snap(asPosition(p.method, p.offset, 0, lengthOf(parent), frontOf(parent))) : 0;
          if (p.radiusMethod !== 'relative' && parent.tube) outerRadius(parent);
        }
        // FinSet.getMaxTabHeight reads the body four times.
        if (isPlanarFinSet(p.type) && num(n, 'tabHeight', 0) > 0 && num(n, 'tabLength', 0) > 0 && parent.symmetric) {
          for (let end = 0; end < 4; end++) radiusAlong(parent);
        }
      }
      attach(p);
    }
  };

  const instancePass = (): void => {
    const visit = (p: Part): void => {
      if (p.ring && (p.radiusMethod === 'relative' || p.radiusMethod === 'surface')) ringRadius(p, p);
      if (isPlanarFinSet(p.type) && p.parent?.symmetric) radiusAlong(p.parent);
      if (p.type === 'tubefinset') tubeFinBody(p);
      // A copy that changes no ref leaves state unchanged, so later copies are skipped.
      for (let copy = 0; copy < p.instances; copy++) {
        const before = changes;
        for (const k of p.kids) visit(k);
        if (changes === before) break;
      }
    };
    visit(rocket);
  };
  const instancePasses = (count: number): void => {
    for (let pass = 0; pass < count; pass++) {
      const before = changes;
      instancePass();
      if (changes === before) return;
    }
  };
  const setAfter = (p: Part): void => {
    const siblings = must(p.parent, 'part parent').kids;
    const i = siblings.indexOf(p);
    const before = i > 0 ? siblings[i - 1]! : null;
    p.x = before ? before.x + lengthOf(before) : 0;
  };
  const update = (p: Part): void => {
    if (p.type === 'rocket') return;
    if (p.assembly) {
      p.length = p.kids.filter((k) => k.method === 'after').reduce((s, k) => s + lengthOf(k), 0);
      if (p.method === 'after') setAfter(p);
      else p.x = snap(asPosition(p.method, p.offset, lengthOf(p), parentLength(p), parentFront(p)));
      for (const k of p.kids) if (k.method === 'after') setAfter(k);
    } else if (p.method === 'after') setAfter(p);
    else p.x = snap(asPosition(p.method, p.offset, lengthOf(p), parentLength(p), parentFront(p)));
  };
  const changed = (p: Part): void => {
    located.delete(p);
    update(p);
    if (p.type === 'launchlug') {
      const body = nearest(p, (a) => a.symmetric);
      if (body) {
        locate(body);
        locate(p);
        radiusAlong(body);
        radiusAlong(body);
      }
    }
    if (p.type === 'railbutton') {
      const body = nearest(p, (a) => a.tube);
      if (body) outerRadius(body);
    }
    for (const k of p.kids) changed(k);
  };

  const settle = (times: number, read: () => void): void => {
    for (let i = 0; i < times; i++) {
      const before = changes;
      read();
      if (changes === before) return;
    }
  };

  const settleAutoRadii = (p: Part): void => {
    if (p.tube) {
      outerRadius(p);
      outerRadius(p);
    } else if (p.symmetric) {
      foreRadius(p);
      aftRadius(p);
    }
    for (const k of p.kids) settleAutoRadii(k);
  };

  const reads = new Map<Part, { radius: number; fore: number; aft: number }>();
  const read = (p: Part): void => {
    const n = p.node;
    if (n && p.type !== 'stage') {
      if (p.tube) {
        if (p.foreAuto) {
          settle(24, () => outerRadius(p));
          const radius = outerRadius(p);
          reads.set(p, { radius, fore: radius, aft: radius });
          outerRadius(p);
        }
      } else if (p.symmetric) {
        const fore = foreRadius(p);
        const aft = aftRadius(p);
        reads.set(p, { radius: 0, fore, aft });
        settle(22, () => radiusAlong(p));
      } else if (isPlanarFinSet(p.type) && p.parent?.symmetric) {
        const parent = p.parent;
        settle(4, () => radiusAlong(parent));
      } else if (autoTubeFins(p)) {
        settle(2, () => tubeFinBody(p));
      } else if (RING_PARTS.has(p.type) && (n['outerRadiusAuto'] === true || isAutoRing(p))) {
        settle(4, () => ringOuter(p));
      } else if (MASS_OBJECTS.has(p.type) && n['radiusAuto'] === true && p.parent) {
        const parent = p.parent;
        settle(4, () => (isAutoRing(parent) ? ringOuter(parent) : radiusAlong(parent)));
      }
    }
    for (const k of p.kids) read(k);
  };

  try {
    // A stageless design attaches after the first passes, so those passes see nothing.
    if (staged) attach(rocket);
    else rocket.kids.push(rocket.design[0]!);
    instancePasses(3);
    if (!staged) attach(rocket.kids[0]!);
    located.delete(rocket);
    instancePasses(2);
    for (const k of rocket.kids) changed(k);
    instancePasses(4);
    const symmetric = (q: Part): number => (q.symmetric ? 1 : 0) + q.kids.reduce((n, k) => n + symmetric(k), 0);
    for (let pass = symmetric(rocket); pass >= 0; pass--) settleAutoRadii(rocket);
    read(rocket);
    if (neighbors) {
      const record = (p: Part): void => {
        if (p.symmetric && p.node) {
          const before = previous(p);
          const after = next(p);
          neighbors.set(p.node, {
            previous: before?.node ?? null,
            next: after?.node ?? null,
            previousOffers: before ? frontAuto(before) : -1,
            nextOffers: after ? rearAuto(after) : -1,
          });
        }
        for (const k of p.kids) record(k);
      };
      record(rocket);
    }
  } catch (e) {
    if (e instanceof TooDeep) return;
    throw e;
  }

  for (const [p, r] of reads) {
    const node = must(p.node, 'part node');
    const patch: Patch = {};
    if (p.tube) {
      patch['outerRadius'] = r.radius;
    } else {
      const fore = p.foreAuto ? r.fore : null;
      const aft = p.aftAuto ? r.aft : null;
      if (node.type === 'nosecone') {
        const base = node['flipped'] === true ? fore : aft;
        if (base !== null && base >= 0) patch['aftRadius'] = base;
      } else {
        if (fore !== null && fore >= 0) Object.assign(patch, { foreRadius: fore, foreRadiusAuto: true });
        if (aft !== null && aft >= 0) Object.assign(patch, { aftRadius: aft, aftRadiusAuto: true });
      }
    }
    if (Object.keys(patch).length) out.set(node, patch);
  }
}

export interface Neighbors {
  previous: ComponentNode | null;
  next: ComponentNode | null;
  /** -1 for no part or no fixed radius. */
  previousOffers: number;
  nextOffers: number;
}

export function symmetricNeighbors(components: readonly ComponentNode[]): Map<ComponentNode, Neighbors> {
  const neighbors = new Map<ComponentNode, Neighbors>();
  resolveAxial(components, new Map(), neighbors);
  return neighbors;
}

// The kernel conserves packed volume (radius^2 * length), so an auto radius changes the length too.
function packedAtRadius(node: ComponentNode, r: number): Patch {
  const stored = num(
    node,
    'radius',
    node.type === 'masscomponent' ? COMPONENT_DEFAULTS.masscomponent.radius : COMPONENT_DEFAULTS.recovery.packedRadius,
  );
  if (stored === r) return { radius: r };
  const length = num(node, 'length', kernelLength(node.type) ?? 0);
  return { radius: r, length: (stored * stored * length) / (r * r) };
}

/** A ring with no bore is automatic too: `new CenteringRing()` starts that way. */
const ringBoreAuto = (node: ComponentNode): boolean =>
  node.type === 'centeringring' && (node['innerRadiusAuto'] === true || typeof node['innerRadius'] !== 'number');

function parentDerived(node: ComponentNode, parent: ComponentNode | null, parentStart: number): void {
  if (!parent) return;
  if (node.type === 'tubefinset') {
    const body = parent.type === 'bodytube' ? bodyTubeRadius(parent) : num(parent, 'outerRadius', NaN);
    if (node['outerRadiusAuto'] === true) {
      // Drop the stale stored radius, or `tubeFinRadius` returns it as is.
      if (Number.isFinite(body) && body > 0)
        node['outerRadius'] = tubeFinRadius({ ...node, outerRadius: undefined }, body);
    }
    // A filled parent's wall is its radius (`SymmetricComponent.getThickness`).
    if (tubeFinWallFromParent(node)) {
      const wall = parent['filled'] === true ? body : num(parent, 'thickness', parentWallDefault(parent.type));
      const outer = num(node, 'outerRadius', NaN);
      if (Number.isFinite(wall)) node['thickness'] = Number.isFinite(outer) ? Math.min(wall, outer) : wall;
    }
    return;
  }
  if (node['radiusAuto'] === true) {
    const r =
      parent.type === 'nosecone'
        ? noseConeAftRadius(parent)
        : parent.type === 'transition'
          ? transitionOuterRadius(parent)
          : (tubeRadii(parent)?.innerR ?? 0);
    if (r > 0) Object.assign(node, packedAtRadius(node, r));
  }
  if (!DISC_TYPES.has(node.type)) return;
  if (node['outerRadiusAuto'] === true) {
    const outer = boreAround(node, parent, parentStart);
    // Zero where the parent has no bore matches the kernel; the pre-run check reports it.
    if (outer !== null) node['outerRadius'] = outer;
  }
  if (ringBoreAuto(node)) {
    node['innerRadius'] = ringBore(node, parent, num(node, 'outerRadius', 0), parentStart);
  }
}

const KEYLESS_AUTO_OUTER: ReadonlySet<string> = new Set([...DISC_TYPES, 'tubefinset']);

const tubeFinWallFromParent = (node: ComponentNode): boolean =>
  node.type === 'tubefinset' && !Number.isFinite(node['thickness']);

const parentWallDefault = (type: string): number =>
  (KERNEL_DEFAULTS as Record<string, { thickness?: number } | undefined>)[type]?.thickness ?? NaN;

export function syncAutoRadii(tree: RocketTree): RocketTree {
  const axial = new Map<ComponentNode, Patch>();
  resolveAxial(tree.components, axial);
  const frames = axialFrames(tree);
  const resolve = (n: ComponentNode, { parent }: MapContext): ComponentNode => {
    let node = n;
    // `ComponentFactory` builds a keyless ring part, tube fin set or ring bore as automatic.
    if (KEYLESS_AUTO_OUTER.has(node.type) && !hasRadius(node, 'outerRadius') && node['outerRadiusAuto'] !== true) {
      node = { ...node, outerRadiusAuto: true };
    }
    if (node.type === 'centeringring' && !hasRadius(node, 'innerRadius') && node['innerRadiusAuto'] !== true) {
      node = { ...node, innerRadiusAuto: true };
    }
    if (
      node['outerRadiusAuto'] === true ||
      ringBoreAuto(node) ||
      node['radiusAuto'] === true ||
      tubeFinWallFromParent(node)
    ) {
      const before = {
        outer: node['outerRadius'],
        inner: node['innerRadius'],
        r: node['radius'],
        wall: node['thickness'],
      };
      const draft = { ...node };
      parentDerived(draft, parent, (parent?.id ? frames.get(parent.id)?.start : undefined) ?? 0);
      if (
        draft['outerRadius'] !== before.outer ||
        draft['innerRadius'] !== before.inner ||
        draft['radius'] !== before.r ||
        draft['thickness'] !== before.wall
      ) {
        node = draft;
      }
    }
    const patch = axial.get(n);
    if (patch && Object.entries(patch).some(([k, v]) => node[k] !== v)) node = { ...node, ...patch };
    return node;
  };
  // Pre-order, so a disc inside an auto coupler sees the coupler's resolved bore.
  const components = mapTreePreserving(tree.components, resolve, 'pre');
  return components === tree.components ? tree : { ...tree, components };
}

function hasKeylessRadius(nodes: readonly ComponentNode[]): boolean {
  for (const n of walkNodes(nodes)) {
    if (n.type === 'transition' && !(hasRadius(n, 'foreRadius') && hasRadius(n, 'aftRadius'))) return true;
    if (KEYLESS_AUTO_OUTER.has(n.type) && !hasRadius(n, 'outerRadius')) return true;
    if (n.type === 'centeringring' && !hasRadius(n, 'innerRadius')) return true;
  }
  return false;
}

export function withKernelEnds(tree: RocketTree): RocketTree {
  return hasKeylessRadius(tree.components) ? syncAutoRadii(tree) : tree;
}

// The neighbor search crosses stages, so one stage holding the chain resolves the same.
export function chainWithKernelEnds(chain: ComponentNode[]): ComponentNode[] {
  if (!hasKeylessRadius(chain)) return chain;
  const stage = { type: 'stage', id: 'chain', children: chain } as ComponentNode;
  return syncAutoRadii({ name: '', components: [stage] }).components[0]?.children ?? chain;
}
