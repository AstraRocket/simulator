import { describe, it, expect } from 'vitest';
import {
  FIN_MATERIALS,
  flutterSpeed,
  flutterVerdict,
  FLUTTER_MARGIN,
  type FlutterFin,
} from '../../../src/services/flight/finFlutter';
import { uiToSi } from '../../../src/prefs/units';

const IN = uiToSi('length', 'in', 1);
const PSI = uiToSi('pressure', 'psi', 1);
const G10 = FIN_MATERIALS.find((m) => m.key === 'g10')!.shearModulusPa;

/** A 6 in root, 2 in tip, 4 in high fin of 1/8 in stock. */
const FIN: FlutterFin = { rootChordM: 6 * IN, tipChordM: 2 * IN, spanM: 4 * IN, thicknessM: 0.125 * IN };

describe('fin flutter speed', () => {
  it('matches the note worked in psi, the form hobby calculators print', () => {
    // Vf = a sqrt( G / (1.337 AR^3 P (lambda + 1) / ((AR + 2) (t/c)^3)) ), G and P in psi:
    // the note's 39.3 over the sea-level pressure in psi, with the (lambda + 1)/2 folded in.
    const ar = 4 ** 2 / (((6 + 2) / 2) * 4);
    const taper = 2 / 6;
    const tc = 0.125 / 6;
    const a = Math.sqrt(1.4 * 287.053 * 288.15);
    const p0Psi = 101325 / PSI;
    const gPsi = 425000;
    const expected =
      a * Math.sqrt(gPsi / (((39.3 / p0Psi) * ar ** 3 * p0Psi * (taper + 1)) / 2 / ((ar + 2) * tc ** 3)));
    const got = flutterSpeed(FIN, G10, 0)!;
    expect(got.speedMs).toBeCloseTo(expected, 6);
    expect(got.mach).toBeCloseTo(expected / a, 9);
  });

  it('goes as thickness to the 3/2 and as the root of the shear modulus', () => {
    const base = flutterSpeed(FIN, G10, 0)!.speedMs;
    expect(flutterSpeed({ ...FIN, thicknessM: FIN.thicknessM * 2 }, G10, 0)!.speedMs / base).toBeCloseTo(2 ** 1.5, 9);
    expect(flutterSpeed(FIN, G10 * 4, 0)!.speedMs / base).toBeCloseTo(2, 9);
  });

  it('rises with altitude, as the air thins faster than the speed of sound falls', () => {
    expect(flutterSpeed(FIN, G10, 3000)!.speedMs).toBeGreaterThan(flutterSpeed(FIN, G10, 0)!.speedMs);
  });

  it('flies a pointed fin, and refuses a fin it cannot size', () => {
    expect(flutterSpeed({ ...FIN, tipChordM: 0 }, G10, 0)!.speedMs).toBeGreaterThan(0);
    expect(flutterSpeed({ ...FIN, thicknessM: 0 }, G10, 0)).toBeNull();
    expect(flutterSpeed({ ...FIN, rootChordM: 0 }, G10, 0)).toBeNull();
    expect(flutterSpeed({ ...FIN, tipChordM: -1 }, G10, 0)).toBeNull();
    expect(flutterSpeed(FIN, 0, 0)).toBeNull();
  });
});

describe('flutter verdict', () => {
  it('is over below 1, marginal below the margin, and ok from it', () => {
    expect(flutterVerdict(0.99)).toBe('over');
    expect(flutterVerdict(1)).toBe('marginal');
    expect(flutterVerdict(FLUTTER_MARGIN - 0.01)).toBe('marginal');
    expect(flutterVerdict(FLUTTER_MARGIN)).toBe('ok');
  });
});
