import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { walkNodes } from '../../tree/treeWalk';
import { BAYS_KEY, baysOf, hasBayRecords, isTubeBays, type TubeBays } from '../flight/recoveryBays';
import { IndexedDbKeyValueStore } from './idbKeyValueStore';
import type { KeyValueStore } from './keyValueStore';

/**
 * The browser's copy of each design's recovery bay records, so a ground test
 * log survives the one thing the `.ork` cannot protect it from: desktop
 * OpenRocket saving the file, which drops the element it does not know.
 *
 * Kept per design name, each tube's records under the tube's place among the
 * design's body tubes and its name (`tubeKey`), since part ids are new on every
 * load. A design opened with no records anywhere, whose name has a copy here,
 * gets them back on the tubes that still match.
 */

const PREFIX = 'recoveryBays:';

type BayCopy = Record<string, TubeBays>;

/** A tube's key in the copy: its place among the design's body tubes, and its name. */
function tubeKey(index: number, tube: ComponentNode): string {
  return `${index}:${typeof tube.name === 'string' ? tube.name : ''}`;
}

const bodyTubes = (tree: RocketTree): ComponentNode[] =>
  [...walkNodes(tree.components)].filter((n) => n.type === 'bodytube');

/** The records of every tube that carries any, keyed for the copy. */
export function bayCopyOf(tree: RocketTree): BayCopy {
  const out: BayCopy = {};
  bodyTubes(tree).forEach((tube, i) => {
    const bays = baysOf(tube);
    if (Object.keys(bays).length) out[tubeKey(i, tube)] = bays;
  });
  return out;
}

/**
 * `tree` with the copy's records put back on the tubes they match, and how many
 * tubes took one. Only a tube with no records of its own takes one.
 */
export function restoreBays(tree: RocketTree, copy: BayCopy): { tree: RocketTree; restored: number } {
  const wanted = new Map<ComponentNode, TubeBays>();
  bodyTubes(tree).forEach((tube, i) => {
    const bays = copy[tubeKey(i, tube)];
    if (bays && !Object.keys(baysOf(tube)).length) wanted.set(tube, bays);
  });
  if (!wanted.size) return { tree, restored: 0 };
  const put = (nodes: ComponentNode[]): ComponentNode[] =>
    nodes.map((n) => {
      const bays = wanted.get(n);
      const children = n.children ? put(n.children) : undefined;
      if (!bays && children === n.children) return n;
      return { ...n, ...(children ? { children } : {}), ...(bays ? { [BAYS_KEY]: bays } : {}) };
    });
  return { tree: { ...tree, components: put(tree.components) }, restored: wanted.size };
}

let kv: KeyValueStore = new IndexedDbKeyValueStore();

/** Swaps the backing store, for tests. */
export function __setBayStoreForTests(store: KeyValueStore): void {
  kv = store;
}

/** Keeps the copy for `designName` up to date with `tree`. A design with no records keeps the copy it has. */
export async function rememberBays(designName: string, tree: RocketTree): Promise<void> {
  if (!designName || !hasBayRecords(tree)) return;
  await kv.set(PREFIX + designName, JSON.stringify(bayCopyOf(tree)));
}

/** The copy for `designName`, or null when there is none or it does not read. */
export async function savedBays(designName: string): Promise<BayCopy | null> {
  if (!designName) return null;
  const raw = await kv.get(PREFIX + designName);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed).filter((e): e is [string, TubeBays] => isTubeBays(e[1]));
    return entries.length ? Object.fromEntries(entries) : null;
  } catch {
    return null;
  }
}
