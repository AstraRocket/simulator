import { describe, it, expect, vi } from 'vitest';
import { loadEngine } from '../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS });

// Only getRadius() settles an auto-radius pack's length (MassObject.getLength).
describe('componentInfo for an automatic-radius pack', () => {
  it('has the length and CG of the settled radius', async () => {
    const engine = await loadEngine();
    engine.reset();
    const tree = {
      components: [
        {
          id: 'st',
          type: 'stage',
          children: [
            { id: 'nose', type: 'nosecone', length: 0.1, aftRadius: 0.03, thickness: 0.001, shape: 'ogive' },
            {
              id: 'tube',
              type: 'bodytube',
              length: 0.4,
              outerRadius: 0.03,
              thickness: 0.001,
              children: [
                { id: 'chute', type: 'parachute', radiusAuto: true, radius: 0.02, length: 0.1, overrideMass: 0.05 },
              ],
            },
          ],
        },
      ],
    };
    const h = engine.buildRocket(JSON.stringify(tree));
    const info = JSON.parse(engine.getComponentInfo(h, 'chute')) as { length: number; cgX: number };
    const fields = JSON.parse(engine.getComponentFields(h, 'chute')) as { length: number; radius: number };
    // The bore, not the stored 20 mm.
    expect(fields.radius).toBeCloseTo(0.029, 9);
    expect(info.length).toBeCloseTo(fields.length, 12);
    expect(info.cgX).toBeCloseTo(fields.length / 2, 12);
  });
});
