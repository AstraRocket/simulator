import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { bodyTubeRadius, noseConeAftRadius, transitionRadii } from '../../tree/nodeProps';

/** On a part: left out of every build the engine sees. The part and its contents stay in the design and the file. */
export const IGNORED_KEY = 'ignored';

export const BASE_DRAG_HACK_ID = 'base-drag-hack';

/** The cone's name in a build: kernel ids are its own, so per-part rows are matched on this to drop the cone. */
export const BASE_DRAG_HACK_ENGINE_NAME = '__base_drag_hack__';

/** Calibers: openrocket.info's "Implementing Base Drag CP Correction" makes the cone π diameters long. */
const BASE_DRAG_HACK_CALIBERS = Math.PI;

export const isIgnored = (n: ComponentNode): boolean => n[IGNORED_KEY] === true;

/** Stages are never ignored: a design always flies at least one, and configurations address them by id. */
export const canIgnore = (n: ComponentNode): boolean => n.type !== 'stage';

const ignoredMemo = new WeakMap<readonly ComponentNode[], ComponentNode[]>();

/** The same array when nothing is ignored, so identity-keyed caches still hit. */
export function withoutIgnored(nodes: ComponentNode[]): ComponentNode[] {
  const hit = ignoredMemo.get(nodes);
  if (hit) return hit;
  let changed = false;
  const out: ComponentNode[] = [];
  for (const n of nodes) {
    if (canIgnore(n) && isIgnored(n)) {
      changed = true;
      continue;
    }
    const kids = n.children ? withoutIgnored(n.children) : undefined;
    if (kids !== n.children) {
      changed = true;
      out.push({ ...n, children: kids });
    } else out.push(n);
  }
  const result = changed ? out : nodes;
  ignoredMemo.set(nodes, result);
  return result;
}

/** The aft end's radius: the last body part of the last stage. */
function aftBodyRadius(parts: readonly ComponentNode[]): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    const n = parts[i]!;
    if (n.type === 'bodytube') return bodyTubeRadius(n);
    if (n.type === 'transition') return transitionRadii(n).aft;
    if (n.type === 'nosecone') return n['flipped'] === true ? noseConeAftRadius(n) : 0;
  }
  return 0;
}

/** Parts of the aft-most stage, where the cone goes; a stageless tree is one stage. */
function aftParts(tree: RocketTree): ComponentNode[] {
  const allStages = tree.components.every((c) => c.type === 'stage');
  return allStages ? (tree.components.at(-1)?.children ?? []) : tree.components;
}

/**
 * openrocket.info's "Implementing Base Drag CP Correction": a cone π diameters long behind the tail, tip forward and
 * base as wide as the aft end, weighing nothing and with no drag. Its lift pulls the CP aft the way base drag does on
 * a short, wide rocket, which Barrowman leaves out. Tip aft would taper, and a taper pushes the CP forward instead.
 * Null when the aft end has no width.
 *
 * `rocksim` writes it as a transition from a point: RockSim puts a nose cone only at the front, and it has no drag
 * override, so the cone has no mass there but does have drag.
 */
function baseDragHackCone(
  tree: RocketTree,
  name: string,
  comment?: string,
  form: HackForm = 'openrocket',
): ComponentNode | null {
  const r = aftBodyRadius(withoutIgnored(aftParts(tree)));
  if (!(r > 0)) return null;
  const common = {
    id: BASE_DRAG_HACK_ID,
    name,
    ...(comment ? { comment } : {}),
    shape: 'conical',
    length: 2 * r * BASE_DRAG_HACK_CALIBERS,
    aftRadius: r,
    filled: true,
    overrideMass: 0,
    position: { method: 'after' as const, offset: 0 },
  };
  if (form === 'rocksim') return { type: 'transition', ...common, foreRadius: 0, overrideCGX: 0 };
  // Zero drag, as the tutorial sets it: the cone corrects the CP and nothing else.
  return { type: 'nosecone', ...common, overrideCD: 0 };
}

export type HackForm = 'openrocket' | 'rocksim';

/** The tree with the cone after its last part, when the design asks for the hack. */
export function withBaseDragHack(
  tree: RocketTree,
  name: string,
  comment?: string,
  form: HackForm = 'openrocket',
): RocketTree {
  if (tree.baseDragHack !== true) return tree;
  const cone = baseDragHackCone(tree, name, comment, form);
  if (!cone) return tree;
  const allStages = tree.components.every((c) => c.type === 'stage');
  if (!allStages) return { ...tree, components: [...tree.components, cone] };
  const last = tree.components.length - 1;
  return {
    ...tree,
    components: tree.components.map((st, i) => (i === last ? { ...st, children: [...(st.children ?? []), cone] } : st)),
  };
}

/**
 * Static readouts (stability, CP, CG) see the hack cone; a flight never does, and no view draws or lists it. Neither sees an ignored part.
 * Only the engine's copy changes: the design keeps both.
 */
export type BuildPurpose = 'static' | 'flight';

export function engineTree(tree: RocketTree, purpose: BuildPurpose): RocketTree {
  const components = withoutIgnored(tree.components);
  const stripped = components === tree.components ? tree : { ...tree, components };
  return purpose === 'static' ? withBaseDragHack(stripped, BASE_DRAG_HACK_ENGINE_NAME) : stripped;
}

const value = (n: ComponentNode, key: string): number => (typeof n[key] === 'number' ? n[key] : NaN);

/** Hand-typed figures: 9.42" for a 3" tube is within this of π × 3". */
const TOLERANCE = 0.02;

const near = (v: number, target: number): boolean => Math.abs(v - target) <= target * TOLERANCE;

/** The cone's two end radii: a nose cone's tip is 0 and its base is `aftRadius`, whichever way it points. */
const endRadii = (n: ComponentNode): [number, number] | null => {
  if (n.type === 'nosecone') return [0, value(n, 'aftRadius')];
  if (n.type === 'transition') return [value(n, 'foreRadius'), value(n, 'aftRadius')];
  return null;
};

/**
 * A loaded design's hack cone, the one this app writes or a hand-made one: one end at 0, the other as wide as the body
 * of `bodyRadius` in front of it, and π diameters long. Mass, wall, drag and name are not asked about. No tag marks
 * it, so a file from this app, desktop or RockSim reads the same.
 */
function isBaseDragHackCone(n: ComponentNode, bodyRadius: number): boolean {
  const ends = endRadii(n);
  if (!ends || !(bodyRadius > 0)) return false;
  const [small, wide] = [Math.min(...ends), Math.max(...ends)];
  return (
    small <= bodyRadius * TOLERANCE && near(wide, bodyRadius) && near(value(n, 'length'), 2 * Math.PI * bodyRadius)
  );
}

/** Takes the hack cone off the end of a loaded tree and sets the flag in its place. */
export function liftBaseDragHack(tree: RocketTree): RocketTree {
  const parts = aftParts(tree);
  const last = parts.at(-1);
  const trimmed = parts.slice(0, -1);
  // Behind another part: a design that is only a nose cone has no tail to correct.
  if (!last || !trimmed.length || !isBaseDragHackCone(last, aftBodyRadius(trimmed))) return tree;
  const allStages = tree.components.every((c) => c.type === 'stage');
  const components = allStages
    ? tree.components.map((st, i) => (i === tree.components.length - 1 ? { ...st, children: trimmed } : st))
    : trimmed;
  return { ...tree, components, baseDragHack: true };
}
