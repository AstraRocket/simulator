import { describe, it, expect } from 'vitest';
import { DEFAULT_HEADING_DEG, isUsableLevel, levelFromAverage } from '../../../src/services/flight/windLevels';

/**
 * The one level seeded from the single wind: what turning Multilevel on starts
 * from (the launch panel) and what a profile reset leaves (the wind profile
 * dialog). The two used `||` and `??`, so an unreadable speed seeded NaN in one.
 */
describe('levelFromAverage', () => {
  it('carries the single wind at altitude 0', () => {
    expect(levelFromAverage({ windAverage: 5, windStdDev: 1, windDirectionDeg: 270 })).toEqual({
      altitudeM: 0,
      speed: 5,
      directionDeg: 270,
      stddev: 1,
    });
  });

  it('reads a blank wind as calm air from the default heading', () => {
    expect(levelFromAverage({ windAverage: null, windStdDev: null })).toEqual({
      altitudeM: 0,
      speed: 0,
      directionDeg: DEFAULT_HEADING_DEG,
      stddev: 0,
    });
  });

  it('never seeds a level the level check would refuse', () => {
    const l = levelFromAverage({ windAverage: Number.NaN, windStdDev: Number.NaN });
    expect(l.speed).toBe(0);
    expect(l.stddev).toBe(0);
    expect(isUsableLevel(l)).toBe(true);
  });
});
