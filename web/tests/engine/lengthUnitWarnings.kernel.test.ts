import { describe, expect, it, vi } from 'vitest';
import { KERNEL_TEST_TIMEOUT_MS } from '../testing/kernelTimeout';
import { loadEngine } from '../testing/kernelGeometry';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

// Desktop BarrowmanStabilityCalculator compares diameters as text in the display unit.
describe('the airframe-step warning follows the length unit', () => {
  const design = {
    components: [
      {
        type: 'stage',
        id: 'st',
        children: [
          { type: 'nosecone', id: 'n', shape: 'ogive', length: 0.3, aftRadius: 0.0508, thickness: 0.002 },
          { type: 'bodytube', id: 'b', length: 0.8, outerRadius: 0.05085, thickness: 0.001 },
        ],
      },
    ],
  };

  const stepWarned = (engine: {
    reset: () => void;
    buildRocket: (s: string) => number;
    getStaticInfo: (h: number) => string;
  }) => {
    engine.reset();
    const info = JSON.parse(engine.getStaticInfo(engine.buildRocket(JSON.stringify(design)))) as {
      warningTexts: string[];
    };
    return info.warningTexts.some((w) => /discontinuity/i.test(w));
  };

  it('warns in inches and not in centimeters', async () => {
    const engine = await loadEngine();
    engine.setLengthUnit('cm');
    expect(stepWarned(engine)).toBe(false);
    engine.setLengthUnit('in');
    expect(stepWarned(engine)).toBe(true);
    engine.setLengthUnit('cm');
  });

  it('keeps the unit for a symbol it does not know', async () => {
    const engine = await loadEngine();
    engine.setLengthUnit('in');
    engine.setLengthUnit('furlong');
    expect(stepWarned(engine)).toBe(true);
    engine.setLengthUnit('cm');
  });
});
