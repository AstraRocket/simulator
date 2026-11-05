import { describe, it, expect } from 'vitest';
import { LAUNCH_SI, type LaunchUnitKind } from '../../src/prefs/launchUnits';
import { siToUi, uiToSi, METRIC_UNITS, IMPERIAL_UNITS } from '../../src/prefs/units';

const KINDS = Object.keys(LAUNCH_SI) as LaunchUnitKind[];

describe('launch-condition SI bridge', () => {
  it('round-trips every field, so nothing drifts on a re-render', () => {
    for (const kind of KINDS) {
      const { toSi, fromSi } = LAUNCH_SI[kind];
      expect(fromSi(toSi(12.5)), kind).toBeCloseTo(12.5, 9);
      expect(fromSi(toSi(-3)), kind).toBeCloseTo(-3, 9);
    }
  });

  it('converts each stored convention to real SI', () => {
    expect(LAUNCH_SI.deg.toSi(180)).toBeCloseTo(Math.PI, 12);
    expect(LAUNCH_SI.degC.toSi(0)).toBeCloseTo(273.15, 12);
    expect(LAUNCH_SI.hPa.toSi(1013.25)).toBeCloseTo(101325, 9);
    expect(LAUNCH_SI.length.toSi(1.5)).toBe(1.5);
    expect(LAUNCH_SI.distance.toSi(250)).toBe(250);
    expect(LAUNCH_SI.windspeed.toSi(4)).toBe(4);
  });

  it('reaches the right displayed number through the full stored → SI → unit path', () => {
    const shown = (kind: LaunchUnitKind, stored: number, units: typeof METRIC_UNITS) => {
      const c = LAUNCH_SI[kind];
      return siToUi(c.q, units[c.q], c.toSi(stored));
    };
    expect(shown('degC', 20, IMPERIAL_UNITS)).toBeCloseTo(68, 6);
    expect(shown('hPa', 1013.25, IMPERIAL_UNITS)).toBeCloseTo(14.6959, 3);
    expect(shown('windspeed', 5, IMPERIAL_UNITS)).toBeCloseTo(11.1847, 3);
    // The `length` group is cm under metric, so a 1 m rod shows as 100.
    expect(shown('length', 1, METRIC_UNITS)).toBeCloseTo(100, 9);
  });

  it('writes back what the user typed, through the full unit → SI → stored path', () => {
    const stored = (kind: LaunchUnitKind, typed: number, units: typeof METRIC_UNITS) => {
      const c = LAUNCH_SI[kind];
      return c.fromSi(uiToSi(c.q, units[c.q], typed));
    };
    expect(stored('degC', 68, IMPERIAL_UNITS)).toBeCloseTo(20, 6);
    expect(stored('hPa', 14.6959, IMPERIAL_UNITS)).toBeCloseTo(1013.25, 1);
    expect(stored('deg', 45, METRIC_UNITS)).toBeCloseTo(45, 9);
  });

  it('keeps the temperature offset out of the wind and angle fields', () => {
    expect(LAUNCH_SI.windspeed.toSi(0)).toBe(0);
    expect(LAUNCH_SI.deg.toSi(0)).toBe(0);
    expect(LAUNCH_SI.hPa.toSi(0)).toBe(0);
  });
});
