import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { walkNodes } from '../../tree/treeWalk';
import { BAYS_KEY, baysOf, hasBayRecords, isTubeBays, type TubeBays } from '../flight/recoveryBays';
import { IndexedDbKeyValueStore } from './idbKeyValueStore';
import type { KeyValueStore } from './keyValueStore';
import { nsKey } from './storageKeys';
import { bodyTubeRadius, str } from '../../tree/nodeProps';
import { partLength } from '../../tree/position';
import { isRecord } from '../app/numbers';

// Desktop drops the unknown bay element when it saves the .ork, so the browser keeps a copy.

const PREFIX = nsKey('recoveryBays:');

/** A tube's records with the size they were kept for. */
interface KeptBays {
  size: string;
  bays: TubeBays;
}
type BayCopy = Record<string, KeptBays>;

// Default names repeat across designs, so a tube takes records only at the size they were kept for;
// charges sized for one bay are wrong for another anyway.
const sizeOf = (tube: ComponentNode): string =>
  `${(bodyTubeRadius(tube) * 2000).toFixed(1)}x${(partLength(tube) * 1000).toFixed(1)}`;

// Not the part id: ids are new on every load.
function tubeKey(index: number, tube: ComponentNode): string {
  return `${index}:${str(tube, 'name')}`;
}

const bodyTubes = (tree: RocketTree): ComponentNode[] =>
  [...walkNodes(tree.components)].filter((n) => n.type === 'bodytube');

export function bayCopyOf(tree: RocketTree): BayCopy {
  const out: BayCopy = {};
  bodyTubes(tree).forEach((tube, i) => {
    const bays = baysOf(tube);
    if (Object.keys(bays).length) out[tubeKey(i, tube)] = { size: sizeOf(tube), bays };
  });
  return out;
}

export function restoreBays(tree: RocketTree, copy: BayCopy): { tree: RocketTree; restored: number } {
  const wanted = new Map<ComponentNode, TubeBays>();
  bodyTubes(tree).forEach((tube, i) => {
    const kept = copy[tubeKey(i, tube)];
    if (kept && kept.size === sizeOf(tube) && !Object.keys(baysOf(tube)).length) wanted.set(tube, kept.bays);
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

const isKept = (v: unknown): v is KeptBays => isRecord(v) && typeof v['size'] === 'string' && isTubeBays(v['bays']);

let kv: KeyValueStore = new IndexedDbKeyValueStore();

export function __setBayStoreForTests(store: KeyValueStore): void {
  kv = store;
}

export async function rememberBays(designName: string, tree: RocketTree): Promise<void> {
  if (!designName || !hasBayRecords(tree)) return;
  await kv.set(PREFIX + designName, JSON.stringify(bayCopyOf(tree)));
}

export async function savedBays(designName: string): Promise<BayCopy | null> {
  if (!designName) return null;
  const raw = await kv.get(PREFIX + designName);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const entries = Object.entries(parsed).filter((e): e is [string, KeptBays] => isKept(e[1]));
    return entries.length ? Object.fromEntries(entries) : null;
  } catch {
    return null;
  }
}
