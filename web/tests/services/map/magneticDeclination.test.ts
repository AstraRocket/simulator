import { describe, it, expect } from 'vitest';
import { decimalYear, magneticDeclinationDeg } from '../../../src/services/map/magneticDeclination';

const atYear = (y: number): Date => {
  const whole = Math.floor(y);
  const start = Date.UTC(whole, 0, 1);
  return new Date(start + (y - whole) * (Date.UTC(whole + 1, 0, 1) - start));
};

// From NOAA's WMM2025_TestValues.txt: decimal year, altitude km, latitude, longitude, declination.
const NOAA: readonly (readonly [number, number, number, number, number])[] = [
  [2025.0, 28, 89, -121, -99.77],
  [2025.0, 48, 80, -96, -29.91],
  [2025.0, 65, 43, 93, 0.5],
  [2025.0, 51, -33, 109, -5.49],
  [2025.0, 3, -50, -103, 27.96],
  [2025.0, 18, 0, 21, 1.29],
  [2025.5, 69, 38, -144, 12.93],
  [2025.5, 44, 33, -118, 11.1],
  [2025.5, 8, -66, 17, -33.14],
  [2026.0, 46, -24, -122, 14.01],
];

describe('magneticDeclinationDeg', () => {
  it.each(NOAA)('matches NOAA at %s, %s km, %s, %s', (year, alt, lat, lon, want) => {
    const got = magneticDeclinationDeg(lat, lon, alt, atYear(year));
    expect(got).not.toBeNull();
    expect(Math.abs(got! - want)).toBeLessThan(0.011);
  });

  it('has no declination at a pole or without a position', () => {
    expect(magneticDeclinationDeg(90, 0)).toBeNull();
    expect(magneticDeclinationDeg(-90, 0)).toBeNull();
    expect(magneticDeclinationDeg(Number.NaN, 0)).toBeNull();
  });
});

describe('decimalYear', () => {
  it('counts the year from its first instant', () => {
    expect(decimalYear(new Date(Date.UTC(2026, 0, 1)))).toBe(2026);
    expect(decimalYear(atYear(2025.5))).toBeCloseTo(2025.5, 9);
  });
});
