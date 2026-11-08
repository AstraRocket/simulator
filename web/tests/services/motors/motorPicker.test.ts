import { describe, it, expect } from 'vitest';
import {
  STD_DIAMS,
  fitIdx,
  motorFitsMount,
  mountFit,
  offersPlugged,
  parseDelays,
  initialThrust,
} from '../../../src/services/motors/motorPicker';

describe('fitIdx', () => {
  it('picks the largest standard diameter that fits the bore (+1mm tolerance)', () => {
    expect(STD_DIAMS[fitIdx(17.6)]).toBe(18);
    expect(STD_DIAMS[fitIdx(24)]).toBe(24);
    expect(STD_DIAMS[fitIdx(5)]).toBe(6);
    expect(STD_DIAMS[fitIdx(999)]).toBe(150);
  });
});

describe('motorFitsMount', () => {
  // A 24 mm mount tube 70 mm long, with OpenRocket's default 6.35 mm overhang.
  const mount = { bore: 24, maxLength: 76.35 };

  it('keeps a motor that goes in the bore and refuses one that does not', () => {
    expect(motorFitsMount({ diameter: 24, length: 70 }, mount)).toBe(true);
    expect(motorFitsMount({ diameter: 18, length: 70 }, mount)).toBe(true);
    expect(motorFitsMount({ diameter: 29, length: 70 }, mount)).toBe(false);
  });

  it('allows a motor to reach into the overhang, which is what the overhang is', () => {
    expect(motorFitsMount({ diameter: 24, length: 75 }, mount)).toBe(true);
    expect(motorFitsMount({ diameter: 24, length: 90 }, mount)).toBe(false);
  });

  it('judges a motor of unknown length on its bore alone', () => {
    expect(motorFitsMount({ diameter: 24 }, mount)).toBe(true);
    expect(motorFitsMount({ diameter: 38 }, mount)).toBe(false);
  });

  it('takes the bore alone when the mount has no length either', () => {
    expect(motorFitsMount({ diameter: 24, length: 500 }, { bore: 24 })).toBe(true);
  });

  it('carries the rounding slack on both bounds', () => {
    expect(motorFitsMount({ diameter: 25, length: 70 }, mount)).toBe(true);
    expect(motorFitsMount({ diameter: 26, length: 70 }, mount)).toBe(false);
    expect(motorFitsMount({ diameter: 24, length: 77 }, mount)).toBe(true);
    expect(motorFitsMount({ diameter: 24, length: 78 }, mount)).toBe(false);
  });
});

describe('parseDelays', () => {
  it('parses comma and dash separated numeric delays', () => {
    expect(parseDelays('4,6,7,8,10')).toEqual({ delays: [4, 6, 7, 8, 10], plugged: false });
    expect(parseDelays('0-3-5-7')).toEqual({ delays: [0, 3, 5, 7], plugged: false });
  });

  it('detects a plugged option and separates it from numbers', () => {
    expect(parseDelays('0,3,P')).toEqual({ delays: [0, 3], plugged: true });
    expect(parseDelays('P')).toEqual({ delays: [], plugged: true });
  });

  it('de-dupes, sorts, and handles empty input', () => {
    expect(parseDelays('6,4,4')).toEqual({ delays: [4, 6], plugged: false });
    expect(parseDelays(undefined)).toEqual({ delays: [], plugged: false });
  });
});

describe('offersPlugged', () => {
  it('is what the manufacturer LISTS, not what is possible', () => {
    expect(offersPlugged({ delays: 'P' })).toBe(true);
    expect(offersPlugged({ delays: '0,3,5,7,P' })).toBe(true);
    expect(offersPlugged({ delays: '4,6,8' })).toBe(false);
    expect(offersPlugged({})).toBe(false);
  });
});

describe('initialThrust', () => {
  it('averages thrust over the first 0.5 s (trapezoid)', () => {
    expect(
      initialThrust([
        [0, 0],
        [0.5, 20],
        [1, 0],
      ]),
    ).toBeCloseTo(10, 9);
  });

  it('clips the window when a sample spans past it', () => {
    expect(
      initialThrust([
        [0, 0],
        [1, 20],
      ]),
    ).toBeCloseTo(5, 9);
  });

  it('returns null for fewer than two samples', () => {
    expect(initialThrust([[0, 5]])).toBeNull();
    expect(initialThrust([])).toBeNull();
  });
});

// A missing wall is the kernel default (0.5 mm for an inner tube), not zero.
describe('mountFit', () => {
  it('takes the kernel wall when the mount states none', () => {
    expect(mountFit({ type: 'innertube', outerRadius: 0.0095, length: 0.07 })!.bore).toBeCloseTo(18, 9);
  });

  it('does not let a NaN wall through', () => {
    const fit = mountFit({ type: 'innertube', outerRadius: 0.0095, thickness: Number.NaN, length: 0.07 })!;
    expect(fit.bore).toBeCloseTo(18, 9);
    expect(motorFitsMount({ diameter: 29, length: 70 }, fit)).toBe(false);
  });
  it('gives a filled body tube no bore', () => {
    expect(mountFit({ type: 'bodytube', outerRadius: 0.02, thickness: 0.001, filled: true })!.bore).toBe(0);
  });

  it('reads a keyless radius as the inner tube the bridge builds', () => {
    expect(mountFit({ type: 'innertube', length: 0.07 })!.bore).toBeCloseTo(18, 9);
  });

  it('never reports a negative bore', () => {
    expect(mountFit({ type: 'innertube', outerRadius: 0.01, thickness: 0.02 })!.bore).toBe(0);
  });
});
