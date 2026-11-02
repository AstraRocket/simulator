import { describe, it, expect } from 'vitest';
import {
  FIN_MATERIALS,
  finStockFor,
  flutterFin,
  flutterFindings,
  flutterSpeed,
  flutterVerdict,
  FLUTTER_MARGIN,
  worstFlutterPoint,
  type FlutterFin,
} from '../../../src/services/flight/finFlutter';
import { uiToSi } from '../../../src/prefs/units';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

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

describe('a design fin set, as the estimate takes it', () => {
  const trapezoid = {
    type: 'trapezoidfinset',
    rootChord: 6 * IN,
    tipChord: 2 * IN,
    sweep: 3 * IN,
    height: 4 * IN,
    thickness: 0.125 * IN,
  } as unknown as ComponentNode;

  it('is a trapezoidal fin itself, whatever its sweep', () => {
    const got = flutterFin(trapezoid)!;
    expect(got.rootChordM).toBeCloseTo(FIN.rootChordM, 12);
    expect(got.tipChordM).toBeCloseTo(FIN.tipChordM, 12);
    expect(got.spanM).toBeCloseTo(FIN.spanM, 12);
    expect(got.thicknessM).toBeCloseTo(FIN.thicknessM, 12);
  });

  it('gives an elliptical fin the tip chord of a trapezoid with its area', () => {
    const got = flutterFin({ ...trapezoid, type: 'ellipticalfinset' } as ComponentNode)!;
    // pi/4 root span = (root + tip)/2 span, within the outline's sampling.
    expect(got.tipChordM / got.rootChordM).toBeCloseTo(Math.PI / 2 - 1, 2);
  });

  it('is null for tube fins and for a fin with no thickness', () => {
    expect(flutterFin({ ...trapezoid, type: 'tubefinset' } as ComponentNode)).toBeNull();
    expect(flutterFin({ ...trapezoid, thickness: 0 } as ComponentNode)).toBeNull();
  });
});

describe('fin stock for a design material', () => {
  it('matches the catalog materials the table has a figure for, and nothing else', () => {
    expect(finStockFor('Fiberglass')).toBe('g10');
    expect(finStockFor('Plywood (birch)')).toBe('plywood');
    expect(finStockFor('PLA - 100% infill')).toBe('pla');
    expect(finStockFor('Birch')).toBeNull();
    expect(finStockFor('Carbon fiber')).toBeNull();
    expect(finStockFor('toString')).toBeNull();
    expect(finStockFor(undefined)).toBeNull();
  });
});

describe('the worst point of a flight', () => {
  it('can be a slower point lower down, where the air is thicker', () => {
    const flutterAt = (h: number) => flutterSpeed(FIN, G10, h)!.speedMs;
    // At 3,000 m a speed 5% under the low point's still has the larger margin.
    const series = { time: [0, 1, 2], altitude: [0, 100, 3000], velocity: [0, 150, 157] };
    const got = worstFlutterPoint(FIN, G10, series, 0)!;
    expect(got.time).toBe(1);
    expect(got.ratio).toBeCloseTo(flutterAt(100) / 150, 9);
  });

  it("reads the run's recorded air, and the airspeed from its Mach number", () => {
    // Air thinner than standard at the pad (a hot, high field typed into the
    // site), and a 10 m/s headwind: 150 m/s over the ground, 160 through the air.
    const p = 85000;
    const a = 350;
    const series = {
      time: [0, 1],
      altitude: [0, 0],
      velocity: [0, 150],
      mach: [0, 160 / a],
      P: [p, p],
      Vs: [a, a],
    };
    const got = worstFlutterPoint(FIN, G10, series, 0)!;
    expect(got.speedMs).toBeCloseTo(160, 9);
    // The note's speed goes as a / sqrt(P): the standard air at sea level, scaled.
    const sea = flutterSpeed(FIN, G10, 0)!;
    expect(got.flutterMs).toBeCloseTo(sea.mach * a * Math.sqrt(101325 / p), 6);
  });

  it('reads the altitude above the site', () => {
    const series = { time: [0, 1], altitude: [0, 0], velocity: [0, 150] };
    expect(worstFlutterPoint(FIN, G10, series, 1500)!.flutterMs).toBeCloseTo(flutterSpeed(FIN, G10, 1500)!.speedMs, 9);
  });

  it('is null for a flight that never moves', () => {
    expect(worstFlutterPoint(FIN, G10, { time: [0], altitude: [0], velocity: [0] }, 0)).toBeNull();
  });
});

describe('flutter findings over a design', () => {
  const tree = (fins: ComponentNode[]) =>
    ({
      components: [
        {
          id: 'st',
          type: 'stage',
          children: [{ id: 'tube', type: 'bodytube', length: 0.6, outerRadius: 0.04, children: fins }],
        },
      ],
    }) as unknown as RocketTree;
  const fin = (id: string, thicknessM: number, name = '') =>
    ({
      id,
      name,
      type: 'trapezoidfinset',
      rootChord: FIN.rootChordM,
      tipChord: FIN.tipChordM,
      height: FIN.spanM,
      thickness: thicknessM,
    }) as unknown as ComponentNode;
  const flight = (top: number) => ({ time: [0, 1], altitude: [0, 0], velocity: [0, top] });
  const vf = flutterSpeed(FIN, G10, 0)!.speedMs;

  it('lists each fin set under the margin, worst first, and leaves out a clear one', () => {
    const t = tree([
      fin('thin', FIN.thicknessM / 2, 'Canards'),
      fin('mid', FIN.thicknessM),
      fin('thick', FIN.thicknessM * 4),
    ]);
    const got = flutterFindings(t, flight(vf * 0.9), 0, () => G10);
    expect(got.map((f) => [f.nodeId, f.verdict])).toEqual([
      ['thin', 'over'],
      ['mid', 'marginal'],
    ]);
    expect(got[0]!.name).toBe('Canards');
  });

  it('skips a fin set with no modulus, and tube fins', () => {
    const t = tree([fin('a', FIN.thicknessM), { id: 'tf', type: 'tubefinset' } as unknown as ComponentNode]);
    expect(flutterFindings(t, flight(vf * 2), 0, () => null)).toEqual([]);
    expect(flutterFindings(t, flight(vf * 2), 0, () => G10).map((f) => f.nodeId)).toEqual(['a']);
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
