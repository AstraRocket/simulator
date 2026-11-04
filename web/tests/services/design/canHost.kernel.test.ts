import { describe, expect, it, vi } from 'vitest';
import { allowedChildren, canHost, defaultNode } from '../../../src/services/design/treeEdit';
import type { ComponentNode, ComponentType } from '../../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { loadEngine } from '../../testing/kernelGeometry';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

const TYPES: ComponentType[] = [
  'nosecone',
  'bodytube',
  'transition',
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
  'tubefinset',
  'launchlug',
  'railbutton',
  'innertube',
  'tubecoupler',
  'centeringring',
  'bulkhead',
  'engineblock',
  'parachute',
  'streamer',
  'shockcord',
  'masscomponent',
  'podset',
  'parallelstage',
];

const node = (type: ComponentType, id: string, children: ComponentNode[] = []): ComponentNode =>
  ({ ...defaultNode(type), id, children }) as ComponentNode;

function design(parent: ComponentType | 'stage', child: ComponentType): unknown {
  const kid = node(child, 'kid');
  if (parent === 'stage') return { components: [node('stage' as ComponentType, 'st', [kid])] };
  const host = node(parent, 'host', [kid]);
  const inStage = parent === 'nosecone' || parent === 'bodytube' || parent === 'transition';
  const chain = inStage ? [host] : [node('bodytube', 'tube', [host])];
  return { components: [node('stage' as ComponentType, 'st', chain)] };
}

describe('canHost', () => {
  it('matches the kernel for every parent and child', async () => {
    const engine = await loadEngine();
    const wrong: string[] = [];
    for (const parent of ['stage', ...TYPES] as const) {
      for (const child of TYPES) {
        engine.reset();
        let kernel = true;
        try {
          engine.buildRocket(JSON.stringify(design(parent, child)));
        } catch (e) {
          if (/not currently compatible/.test(String(e))) kernel = false;
        }
        if (kernel !== canHost(parent, child)) wrong.push(`${child} in ${parent}: kernel ${kernel}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('puts stages only in the design, and lists children in the Add menu order', () => {
    expect(canHost('rocket', 'stage')).toBe(true);
    expect(canHost('rocket', 'bodytube')).toBe(false);
    expect(allowedChildren(undefined)).toEqual(['nosecone', 'bodytube', 'transition']);
    expect(allowedChildren('parachute')).toEqual([]);
  });
});
