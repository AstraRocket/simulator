import { describe, it, expect } from 'vitest';
import {
  compassPointIndex,
  leanAgainstWind,
  magneticToTrue,
  padWindFromDeg,
  rodLean,
  shownDeclination,
  trueToMagnetic,
} from '../../../src/services/flight/bearing';
import type { LaunchConditions } from '../../../src/services/design/orkTree';

const BASE: LaunchConditions = {
  launchRodLengthM: 1,
  launchRodAngleDeg: 5,
  windAverage: 4,
  windStdDev: 0,
  launchAltitudeM: 0,
  latitudeDeg: 40,
  longitudeDeg: -105,
  temperatureC: null,
  pressureHPa: null,
};

describe('compassPointIndex', () => {
  it('names the nearest of 16 points, wrapping at north', () => {
    expect(compassPointIndex(0)).toBe(0);
    expect(compassPointIndex(11)).toBe(0);
    expect(compassPointIndex(12)).toBe(1);
    expect(compassPointIndex(90)).toBe(4);
    expect(compassPointIndex(270)).toBe(12);
    expect(compassPointIndex(355)).toBe(0);
    expect(compassPointIndex(-90)).toBe(12);
  });
});

describe('true and magnetic bearings', () => {
  it('convert both ways, east declination subtracting from a magnetic reading', () => {
    expect(trueToMagnetic(90, 8)).toBe(82);
    expect(magneticToTrue(82, 8)).toBe(90);
    expect(trueToMagnetic(3, 8)).toBe(355);
    expect(magneticToTrue(355, 8)).toBe(3);
  });
});

describe('rodLean', () => {
  it('leans toward the typed direction', () => {
    expect(rodLean({ ...BASE, launchRodDirectionDeg: 200 })).toEqual({ headingDeg: 200, angleDeg: 5 });
  });

  it('leans toward where the wind comes from when launching into it', () => {
    expect(rodLean({ ...BASE, launchIntoWind: true, launchRodDirectionDeg: 0, windDirectionDeg: 250 })).toEqual({
      headingDeg: 250,
      angleDeg: 5,
    });
  });

  it('turns a negative angle into a lean the other way', () => {
    expect(rodLean({ ...BASE, launchIntoWind: true, launchRodAngleDeg: -4, windDirectionDeg: 250 })).toEqual({
      headingDeg: 70,
      angleDeg: 4,
    });
  });
});

describe('leanAgainstWind', () => {
  it('is all into the wind when the rod leans toward its source', () => {
    const s = leanAgainstWind({ headingDeg: 270, angleDeg: 5 }, 270);
    expect(s.intoDeg).toBeCloseTo(5, 9);
    expect(s.acrossDeg).toBeCloseTo(0, 9);
  });

  it('is with the wind when the rod leans downwind', () => {
    expect(leanAgainstWind({ headingDeg: 90, angleDeg: 5 }, 270).intoDeg).toBeCloseTo(-5, 9);
  });

  it('is all across at right angles', () => {
    const s = leanAgainstWind({ headingDeg: 0, angleDeg: 5 }, 270);
    expect(s.intoDeg).toBeCloseTo(0, 9);
    expect(Math.abs(s.acrossDeg)).toBeCloseTo(5, 9);
  });
});

describe('the pad rose inputs', () => {
  it('gives the pad wind a direction only when it blows', () => {
    expect(padWindFromDeg({ ...BASE, windDirectionDeg: 250 })).toBeCloseTo(250, 9);
    expect(padWindFromDeg({ ...BASE, windAverage: 0, windDirectionDeg: 250 })).toBeNull();
  });

  it('marks magnetic north only in magnetic mode, at a known site', () => {
    expect(shownDeclination('true', 40, -105)).toBeNull();
    expect(shownDeclination('magnetic', null, -105)).toBeNull();
    expect(shownDeclination('magnetic', 40, -105)).toBeTypeOf('number');
  });
});
