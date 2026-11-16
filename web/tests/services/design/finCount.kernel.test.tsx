// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { finCountOf } from '../../../src/tree/nodeProps';
import { splitCount } from '../../../src/services/design/componentActions';
import { ComponentTree } from '../../../src/components/design/ComponentTree';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// jsdom has no matchMedia.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
})) as unknown as typeof window.matchMedia;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});

const FIN_TYPES = ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset', 'tubefinset'] as const;

// A fin set that states no `finCount`, as a hand-written workspace can hold.
const design = (type: string): RocketTree =>
  ({
    name: 'R',
    components: [
      {
        id: 's',
        type: 'stage',
        children: [
          { id: 'n', type: 'nosecone', length: 0.1, aftRadius: 0.025, thickness: 0.002 },
          {
            id: 'b',
            type: 'bodytube',
            length: 0.4,
            outerRadius: 0.025,
            thickness: 0.001,
            motorMount: true,
            children: [{ id: 'f', type, name: 'Fins', thickness: 0.003 }],
          },
        ],
      },
    ],
  }) as unknown as RocketTree;

const kernelFinCount = (tree: RocketTree): number => {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const fields = JSON.parse(engine.getComponentFields(handle, 'f') as string) as { finCount: number };
  return fields.finCount;
};

describe('a fin set that states no fin count', () => {
  it.each(FIN_TYPES)('is read as the count the kernel flies (%s)', (type) => {
    const tree = design(type);
    const fins = tree.components[0]!.children![1]!.children![0] as ComponentNode;
    const kernel = kernelFinCount(tree);
    expect(finCountOf(fins)).toBe(kernel);
    // Split offers one part per fin the kernel flies.
    expect(splitCount(fins)).toBe(kernel);
  });

  it.each(FIN_TYPES)('shows that count in the design tree (%s)', (type) => {
    const tree = design(type);
    const kernel = kernelFinCount(tree);
    renderWithProviders(<ComponentTree tree={tree} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(`${kernel} fins`)).toBeTruthy();
  });
});
