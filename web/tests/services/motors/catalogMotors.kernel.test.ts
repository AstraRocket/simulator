import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { samplesToMotorSpec } from '../../../src/services/motors/motorSpec';
import { defaultNode } from '../../../src/services/design/treeEdit';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';
import type { ComponentType } from '../../../src/engine/openRocketEngine';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { loadEngine } from '../../testing/kernelGeometry';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// The kernel refuses a curve not starting at t = 0 or with two thrusts at one time.

const catalog = JSON.parse(
  readFileSync(join(__dirname, '../../../public/data/motors.generated.json'), 'utf8'),
) as CatalogMotor[];

const node = (type: string, id: string, extra: object = {}, children: object[] = []) => ({
  ...defaultNode(type as ComponentType),
  id,
  ...extra,
  children,
});
const TREE = JSON.stringify({
  components: [
    node('stage', 'st', {}, [
      node('nosecone', 'n'),
      node('bodytube', 'b', { outerRadius: 0.1, length: 2 }, [
        node('innertube', 'mm', { motorMount: true, outerRadius: 0.08, length: 1.5 }),
      ]),
    ]),
  ],
});

describe('the shipped motor catalog', () => {
  it('builds every curve in the kernel', async () => {
    const engine = await loadEngine();
    const failed: string[] = [];
    let built = 0;
    for (const m of catalog) {
      if (m.length == null || m.propWeightG == null) continue;
      for (const curve of m.curves ?? []) {
        let spec;
        try {
          spec = samplesToMotorSpec(
            {
              designation: m.designation,
              manufacturerAbbrev: m.manufacturer,
              diameter: m.diameter,
              length: m.length,
              totalWeightG: m.mass,
              propWeightG: m.propWeightG,
            },
            curve.samples.map(([time, thrust]) => ({ time, thrust })),
            6,
          );
        } catch {
          continue;
        }
        engine.reset();
        const h = engine.buildRocket(TREE);
        try {
          engine.setMotorById(
            h,
            'mm',
            spec.designation,
            spec.diameter,
            spec.length,
            spec.times,
            spec.thrusts,
            spec.masses,
            spec.cgX,
            6,
          );
          built++;
        } catch (e) {
          failed.push(`${m.manufacturer} ${m.designation} (${curve.src}): ${String(e).slice(0, 80)}`);
        }
      }
    }
    expect(built).toBeGreaterThan(1500);
    expect(failed).toEqual([]);
  });
});
