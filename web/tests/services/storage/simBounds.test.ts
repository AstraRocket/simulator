import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SIM_BOUNDS } from '../../../src/services/storage/settings';

describe('SIM_BOUNDS', () => {
  it('brackets every default it governs', () => {
    const s = DEFAULT_SETTINGS.simulation;
    for (const k of ['timeStep', 'maxTime', 'maxAngleStep'] as const) {
      expect(s[k], k).toBeGreaterThanOrEqual(SIM_BOUNDS[k].min);
      expect(s[k], k).toBeLessThanOrEqual(SIM_BOUNDS[k].max);
    }
  });

  it('keeps the iteration count finite at the worst legal combination', () => {
    expect(SIM_BOUNDS.maxTime.max / SIM_BOUNDS.timeStep.min).toBeLessThanOrEqual(10_000_000);
  });
});
