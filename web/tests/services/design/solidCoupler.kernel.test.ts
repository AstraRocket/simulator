// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogPatch, defaultNode } from '../../../src/services/design/treeEdit';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import type { Component, TubeComponent } from '../../../src/services/parts/componentDb';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

// `ThicknessRingComponent.loadFromPreset` sets the wall to (outer - inner) / 2, so an inner diameter of 0 is solid.
describe('a catalog coupler with an inner diameter of 0', () => {
  const rows = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/components.generated.json'), 'utf8'))
    .components as (Component & { partNo: string })[];
  const nb50 = rows.find((r) => r.type === 'tubecoupler' && r.partNo === 'NB-50, 70158') as TubeComponent;

  it(
    'is picked as a solid part and flies at the solid part mass',
    async () => {
      const node = {
        ...defaultNode('tubecoupler'),
        ...catalogPatch(nb50, defaultNode('tubecoupler')),
      } as ComponentNode;
      const r = nb50.outerDiameter / 2;
      expect(node['thickness']).toBeCloseTo(r, 12);

      const engine = await loadEngine();
      engine.reset();
      const handle = engine.buildRocket(
        JSON.stringify({
          components: [
            { type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.0125 },
            {
              type: 'bodytube',
              id: 'b',
              length: 0.3,
              outerRadius: 0.0125,
              thickness: 0.0003,
              children: [{ ...node, id: 'probe' }],
            },
          ],
        }),
      );
      const { mass } = JSON.parse(engine.getComponentInfo(handle, 'probe')) as { mass: number };
      expect(mass).toBeCloseTo(Math.PI * r * r * nb50.length * nb50.materialDensity!, 9);
    },
    KERNEL_TEST_TIMEOUT_MS,
  );
});
