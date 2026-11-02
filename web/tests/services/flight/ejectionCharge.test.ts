import { describe, it, expect } from 'vitest';
import {
  blackPowderMass,
  DEFAULT_BAY_PRESSURE_PA,
  pinShearPressure,
} from '../../../src/services/flight/ejectionCharge';
import { uiToSi } from '../../../src/prefs/units';

const IN = uiToSi('length', 'in', 1);
const PSI = uiToSi('pressure', 'psi', 1);
const LBF = uiToSi('force', 'lbf', 1);

describe('black powder charge', () => {
  it('fills a 4 in by 10 in bay to 15 psi with the gas law, near the 0.006 D^2 L rule', () => {
    // m = P V / (R T): 15 psi over 125.66 in^3, with R T = 22.16 x 3307 ft.lbf/lbm.
    const vIn3 = (Math.PI / 4) * 4 * 4 * 10;
    const grams = ((15 * vIn3) / (22.16 * 12 * 3307)) * 453.59237;
    const got = blackPowderMass(DEFAULT_BAY_PRESSURE_PA, 4 * IN, 10 * IN)! * 1000;
    expect(got).toBeCloseTo(grams, 6);
    expect(got).toBeCloseTo(0.006 * 4 * 4 * 10, 1);
  });

  it('is linear in pressure and length, and square in bore', () => {
    const base = blackPowderMass(DEFAULT_BAY_PRESSURE_PA, 0.1, 0.3)!;
    expect(blackPowderMass(DEFAULT_BAY_PRESSURE_PA * 2, 0.1, 0.3)! / base).toBeCloseTo(2, 9);
    expect(blackPowderMass(DEFAULT_BAY_PRESSURE_PA, 0.1, 0.6)! / base).toBeCloseTo(2, 9);
    expect(blackPowderMass(DEFAULT_BAY_PRESSURE_PA, 0.2, 0.3)! / base).toBeCloseTo(4, 9);
  });

  it('refuses a bay it cannot size', () => {
    expect(blackPowderMass(0, 0.1, 0.3)).toBeNull();
    expect(blackPowderMass(DEFAULT_BAY_PRESSURE_PA, 0, 0.3)).toBeNull();
    expect(blackPowderMass(DEFAULT_BAY_PRESSURE_PA, 0.1, 0)).toBeNull();
  });
});

describe('shear pin pressure', () => {
  it('spreads the pins over the bore', () => {
    // Three 35 lbf pins in a 4 in bore: 105 lbf over 12.57 in^2.
    const got = pinShearPressure(3, 35 * LBF, 4 * IN)! / PSI;
    // To 6 places: the lbf and psi factors are each rounded to 9 significant digits.
    expect(got).toBeCloseTo(105 / (Math.PI * 4), 6);
  });

  it('is null without pins', () => {
    expect(pinShearPressure(0, 35 * LBF, 4 * IN)).toBeNull();
    expect(pinShearPressure(3, 0, 4 * IN)).toBeNull();
  });
});
