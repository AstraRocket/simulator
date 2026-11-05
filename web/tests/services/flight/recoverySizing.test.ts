import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  airDensity,
  canopyDiameter,
  canopyRoundUp,
  classifyRate,
  descentMass,
  descentRate,
  DROGUE_BAND,
  MAIN_BAND,
  propellantMass,
  siteAirDensity,
} from '../../../src/services/flight/recoverySizing';

describe('recovery sizing physics', () => {
  it('descentRate and canopyDiameter are inverses', () => {
    const m = 0.5;
    const cd = 0.8;
    const rho = 1.225;
    const d = canopyDiameter(m, MAIN_BAND.target, cd, rho);
    expect(descentRate(m, d, cd, rho)).toBeCloseTo(MAIN_BAND.target, 6);
  });

  it('a bigger canopy descends slower (1/D law)', () => {
    const slow = descentRate(1, 0.6, 0.8, 1.225);
    const fast = descentRate(1, 0.3, 0.8, 1.225);
    expect(fast / slow).toBeCloseTo(2, 6);
  });

  it('returns Infinity (never NaN) for non-positive descent mass', () => {
    expect(descentRate(0, 0.6, 0.8, 1.225)).toBe(Infinity);
    expect(descentRate(-1, 0.6, 0.8, 1.225)).toBe(Infinity);
    expect(canopyDiameter(-1, MAIN_BAND.target, 0.8, 1.225)).toBe(Infinity);
  });

  it('descentMass is null when propellant meets or exceeds loaded mass', () => {
    expect(descentMass(0.5, [{ masses: [0.6, 0] }])).toBeNull();
    expect(descentMass(0.5, [{ masses: [0.5, 0] }])).toBeNull(); // exactly zero descent mass
    expect(descentMass(1.0, [{ masses: [0.3, 0.1] }])).toBeCloseTo(0.8, 6);
  });

  it('matches a hand-worked descent rate', () => {
    expect(descentRate(1, 1, 0.8, 1.225)).toBeCloseTo(5.048, 2);
  });

  it('thinner air (altitude) lands the same canopy faster', () => {
    const seaLevel = descentRate(1, 0.8, 0.8, airDensity({ launchAltitudeM: 0 }));
    const highField = descentRate(1, 0.8, 0.8, airDensity({ launchAltitudeM: 1500 }));
    expect(highField).toBeGreaterThan(seaLevel);
    expect(highField / seaLevel).toBeGreaterThan(1.05);
  });
});

describe('launch-site air density', () => {
  it('is ~1.225 at sea level and falls with altitude', () => {
    expect(airDensity({ launchAltitudeM: 0 })).toBeCloseTo(1.225, 2);
    expect(airDensity({ launchAltitudeM: 1524 })).toBeLessThan(airDensity({ launchAltitudeM: 0 }));
  });

  describe('with forecast levels', () => {
    const levels = [
      { altitudeM: 1000, temperatureC: 15, pressureHPa: 900, relativeHumidity: 0.5 },
      { altitudeM: 3000, temperatureC: 5, pressureHPa: 700, relativeHumidity: 0.3 },
    ];

    it('interpolates between levels: temperature linearly, pressure on a log scale', () => {
      expect(airDensity({ launchAltitudeM: 2000, atmosphereLevels: levels })).toBeCloseTo(0.976544, 5);
    });

    it('follows the standard atmosphere from the lowest level below it', () => {
      expect(airDensity({ launchAltitudeM: 500, atmosphereLevels: levels })).toBeCloseTo(1.14281, 5);
    });

    it('uses the site values when both are set, as the flight does', () => {
      const site = { launchAltitudeM: 2000, temperatureC: 20, pressureHPa: 800 };
      expect(airDensity({ ...site, atmosphereLevels: levels })).toBe(airDensity(site));
    });

    it('reads the levels when only one site value is set', () => {
      const one = airDensity({ launchAltitudeM: 2000, temperatureC: 20, atmosphereLevels: levels });
      expect(one).toBeCloseTo(0.976544, 5);
    });
  });

  it('honors explicit temperature / pressure overrides', () => {
    const hot = airDensity({ launchAltitudeM: 0, temperatureC: 40 });
    const cool = airDensity({ launchAltitudeM: 0, temperatureC: 0 });
    expect(hot).toBeLessThan(cool);
  });

  it('reads a standalone site at its own pressure, with or without a typed temperature', () => {
    const blank = siteAirDensity(2682, null);
    expect(blank).toBeCloseTo(airDensity({ launchAltitudeM: 2682 }), 9);
    expect(siteAirDensity(2682, -2.4)).toBeCloseTo(blank, 2);
    // Not the sea-level 1.225 a flight's blank pressure would give.
    expect(siteAirDensity(2682, 15)).toBeLessThan(blank);
    expect(siteAirDensity(null, null)).toBeCloseTo(1.225, 3);
  });

  it('defaults to sea-level density with no launch data', () => {
    expect(airDensity(null)).toBeCloseTo(1.225, 3);
    expect(airDensity(undefined)).toBeCloseTo(1.225, 3);
  });

  // Any of temperature, pressure or humidity set fills the blanks with sea-level constants, not site values.
  describe('fills a blank the way the flight does', () => {
    const HIGH = 2682; // m

    it('uses the site-altitude ISA when nothing at all is set', () => {
      // Within 0.1 %: the kernel interpolates ISA tabulated every 500 m.
      const tIsa = 288.15 - 0.0065 * HIGH;
      const pIsa = 101325 * Math.pow(tIsa / 288.15, 9.80665 / (287.053 * 0.0065));
      expect(airDensity({ launchAltitudeM: HIGH }) / (pIsa / (287.053 * tIsa))).toBeCloseTo(1, 3);
    });

    it('uses the sea-level standard pressure when only a temperature is typed', () => {
      // 101325 / (287.053 * 303.15), not the ~73 kPa of a 2,682 m field.
      expect(airDensity({ launchAltitudeM: HIGH, temperatureC: 30 })).toBeCloseTo(1.1644, 4);
    });

    it('uses the sea-level standard temperature when only a pressure is typed', () => {
      // 85000 / (287.053 * 288.15), not the ~271 K of a 2,682 m field.
      expect(airDensity({ launchAltitudeM: HIGH, pressureHPa: 850 })).toBeCloseTo(1.0276, 4);
    });

    it('switches branch on humidity alone, which sets neither value', () => {
      expect(airDensity({ launchAltitudeM: HIGH, relativeHumidity: 0.8 })).toBeCloseTo(1.225, 3);
      expect(airDensity({ launchAltitudeM: HIGH, relativeHumidity: 0.8 })).not.toBeCloseTo(
        airDensity({ launchAltitudeM: HIGH }),
        3,
      );
    });

    it('agrees with the no-override case at sea level, where the branches meet', () => {
      expect(airDensity({ launchAltitudeM: 0, temperatureC: 15 })).toBeCloseTo(airDensity({ launchAltitudeM: 0 }), 6);
    });
  });

  it('still matches the rule the bridge hands the kernel', () => {
    const bridge = readFileSync(
      resolve(process.cwd(), '../engine-java/src/api/java/api/OpenRocketEngine.java'),
      'utf8',
    );
    expect(bridge).toMatch(
      /if \(!Double\.isNaN\(temperature\) \|\| !Double\.isNaN\(pressure\) \|\| !Double\.isNaN\(humidity\)\)/,
    );
    expect(bridge).toContain('Double.isNaN(temperature) ? ExtendedISAModel.STANDARD_TEMPERATURE : temperature');
    expect(bridge).toContain('Double.isNaN(pressure) ? ExtendedISAModel.STANDARD_PRESSURE : pressure');

    const model = readFileSync(
      resolve(process.cwd(), '../engine-java/src/java/info/openrocket/core/models/atmosphere/ExtendedISAModel.java'),
      'utf8',
    );
    expect(model).toContain('STANDARD_TEMPERATURE = 288.15');
    expect(model).toContain('STANDARD_PRESSURE = 101325');
  });
});

describe('descent mass', () => {
  const motor = { masses: [0.02, 0.015, 0.006] };

  it('is loaded mass minus expelled propellant', () => {
    expect(propellantMass(motor)).toBeCloseTo(0.014, 6);
    expect(descentMass(0.5, [motor])).toBeCloseTo(0.486, 6);
  });

  it('sums propellant across multiple motors', () => {
    expect(descentMass(0.5, [motor, motor])).toBeCloseTo(0.472, 6);
  });

  it('is null with no motor (nothing burns off) or unknown mass', () => {
    expect(descentMass(0.5, [])).toBeNull();
    expect(descentMass(0.5, [null, undefined, { masses: [] }])).toBeNull();
    expect(descentMass(null, [motor])).toBeNull();
  });
});

describe('rate classification', () => {
  it('places rates in the right band', () => {
    expect(classifyRate(10 * 0.3048)).toBe('slow');
    expect(classifyRate(MAIN_BAND.target)).toBe('main');
    expect(classifyRate(35 * 0.3048)).toBe('between');
    expect(classifyRate(DROGUE_BAND.target)).toBe('drogue');
    expect(classifyRate(100 * 0.3048)).toBe('fast');
  });
});

describe('canopy round-up', () => {
  it('rounds a sized canopy up to the next whole centimeter or inch', () => {
    expect(canopyRoundUp(0.15936414, 'cm')).toBeCloseTo(0.16, 9);
    expect(canopyRoundUp(0.15936414, 'in')).toBeCloseTo(7 * 0.0254, 9);
    expect(canopyRoundUp(0.15936414, 'mm')).toBeCloseTo(0.16, 9);
  });

  it('leaves a size already on a step, and one that cannot be sized, alone', () => {
    expect(canopyRoundUp(0.3, 'cm')).toBeCloseTo(0.3, 9);
    expect(canopyRoundUp(Infinity, 'cm')).toBe(Infinity);
  });
});
