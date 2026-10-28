import { describe, expect, it, vi } from 'vitest';
import type { FlightResult, StaticInfo } from '../../../src/engine/openRocketEngine';
import { C6 } from '../../../src/engine/api';
import {
  SIMPLE_FIN_SHAPES,
  SIMPLE_MOUNT_ID,
  parabolicOutline,
  simpleFigures,
  simpleMinDiameter,
  simpleMountFit,
  simpleOptions,
  simpleProblem,
  simpleRocketTree,
  simpleChuteDiameter,
  SIMPLE_CHUTE_CD,
  type SimpleInputs,
} from '../../../src/services/flight/simpleRocket';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';
import { MAIN_BAND } from '../../../src/services/flight/recoverySizing';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/** A BT-50 sport model: 24.8 mm, 45 cm, 40 g, an 18 mm mount, balancing 25 cm back. */
const SPORT: SimpleInputs = { diameterM: 0.0248, lengthM: 0.45, dryMassKg: 0.04, mountDiameterM: 0.018, cgM: 0.25 };
const LAUNCH = { rodLengthM: 1, launchAltitudeM: 0, temperatureC: null };

async function fly(i: SimpleInputs): Promise<{ info: StaticInfo; result: FlightResult }> {
  const engine = await loadEngine();
  engine.reset();
  const h = engine.buildRocket(JSON.stringify(simpleRocketTree(i, C6)));
  const m = C6;
  engine.setMotorById(h, SIMPLE_MOUNT_ID, m.designation, m.diameter, m.length, m.times, m.thrusts, m.masses, m.cgX, 5);
  const info = JSON.parse(engine.getStaticInfo(h)) as StaticInfo;
  const result = JSON.parse(engine.simulateJson(h, JSON.stringify(simpleOptions(LAUNCH)))) as FlightResult;
  return { info, result };
}

describe('the simple rocket', () => {
  it('weighs what the user weighed, whatever its stand-in parts would', async () => {
    const { info } = await fly(SPORT);
    expect(info.massEmpty).toBeCloseTo(SPORT.dryMassKg, 6);
  });

  it('flies a C6 to a sport-model apogee, straight up', async () => {
    const { result } = await fly(SPORT);
    const f = simpleFigures(result);
    expect(f.apogee).toBeGreaterThan(100);
    expect(f.apogee).toBeLessThan(400);
    expect(f.railExit).toBeGreaterThan(5);
    expect(f.railTwr).not.toBeNull();
    expect(f.burnoutTime).toBeCloseTo(C6.times.at(-1)!, 1);
    expect(f.burnoutAltitude!).toBeGreaterThan(0);
    expect(f.optimumDelay).not.toBeNull();
    // Calm air off a vertical rod: nothing pushes it sideways on the way up.
    // The few centimeters left are the Earth turning under it. Past apogee the
    // chuteless rocket tumbles, which is why nothing after it is shown.
    const s = result.series as unknown as Record<string, number[]>;
    const climb = s.time!.filter((t) => t <= f.timeToApogee).length;
    expect(climb).toBeGreaterThan(0);
    for (let i = 0; i < climb; i++) expect(Math.hypot(s.Px![i]!, s.Py![i]!)).toBeLessThan(0.5);
  });

  it('raises no warning but the missing recovery device it is built without', async () => {
    const { result } = await fly(SPORT);
    expect((result.warnings ?? []).map((w) => w.key)).toEqual(['NO_RECOVERY_DEVICE']);
  });

  it('flies lower when heavier', async () => {
    const light = simpleFigures((await fly(SPORT)).result);
    const heavy = simpleFigures((await fly({ ...SPORT, dryMassKg: 0.08 })).result);
    expect(heavy.apogee).toBeLessThan(light.apogee);
  });

  it('builds and flies every fin shape, the user’s size in place of the stand-in', async () => {
    const plain = simpleFigures((await fly(SPORT)).result);
    for (const shape of SIMPLE_FIN_SHAPES) {
      const fins = { count: 4, shape, rootChordM: 0.06, spanM: 0.04 };
      const { info, result } = await fly({ ...SPORT, fins });
      expect(info.massEmpty, shape).toBeCloseTo(SPORT.dryMassKg, 6);
      const f = simpleFigures(result);
      expect(f.apogee, shape).toBeGreaterThan(100);
      // Four bigger fins than the stand-in's three drag more.
      expect(f.apogee, shape).toBeLessThan(plain.apogee);
    }
  });
});

describe('a minimum-diameter simple rocket', () => {
  it('seats the motor in the body tube when there is no room for a mount tube', async () => {
    // An 18 mm motor in a 19 mm body: half a millimeter of wall.
    const min = { ...SPORT, diameterM: 0.019, mountDiameterM: 0.018 };
    expect(simpleMinDiameter(min)).toBe(true);
    expect(simpleMinDiameter(SPORT)).toBe(false);
    const body = simpleRocketTree(min, C6).components[0]!.children![1]!;
    expect(body.id).toBe(SIMPLE_MOUNT_ID);
    expect(body.children).toHaveLength(1);
    const { info, result } = await fly(min);
    expect(info.massEmpty).toBeCloseTo(SPORT.dryMassKg, 6);
    expect(simpleFigures(result).apogee).toBeGreaterThan(100);
  });
});

describe('the simple rocket’s CG', () => {
  it('balances where the user said', async () => {
    const fwd = await fly(SPORT);
    expect(fwd.info.cgEmpty).toBeCloseTo(0.25, 6);
    expect(fwd.info.massEmpty).toBeCloseTo(SPORT.dryMassKg, 6);
    const aft = await fly({ ...SPORT, cgM: 0.3 });
    const f = simpleFigures(fwd.result);
    const a = simpleFigures(aft.result);
    expect(f.railStability).not.toBeNull();
    // A forward CG is a bigger margin. 5 cm on a 24.8 mm body is two calibers
    // of dry CG, but the motor's mass sits in the loaded CG too, so the margin
    // moves by the dry share of it: about 40 g of 64 g on a C6 at the rod.
    const shift = f.railStability! - a.railStability!;
    expect(shift).toBeGreaterThan(1);
    expect(shift).toBeLessThan(0.05 / 0.0248);
  });
});

describe('the simple rocket under a parachute', () => {
  it('lands at the rate the canopy was sized for, opened by the ejection charge', async () => {
    const launch = { launchAltitudeM: 0, temperatureC: null };
    const diameterM = simpleChuteDiameter(SPORT.dryMassKg, C6, launch, SIMPLE_CHUTE_CD);
    // A 40 g model on a C6 casing: a canopy of about 20 cm.
    expect(diameterM).toBeGreaterThan(0.15);
    expect(diameterM).toBeLessThan(0.3);
    // The motor's casing is part of what comes down, so it needs a bigger canopy than the airframe alone.
    expect(diameterM).toBeGreaterThan(simpleChuteDiameter(SPORT.dryMassKg, null, launch, SIMPLE_CHUTE_CD));

    const { info, result } = await fly({ ...SPORT, chute: { diameterM, cd: SIMPLE_CHUTE_CD } });
    expect(info.massEmpty).toBeCloseTo(SPORT.dryMassKg, 6);
    expect((result.warnings ?? []).map((w) => w.key)).not.toContain('NO_RECOVERY_DEVICE');
    const f = simpleFigures(result, true);
    expect(f.deployVelocity).not.toBeNull();
    expect(f.flightTime!).toBeGreaterThan(f.timeToApogee);
    expect(f.landingVelocity!).toBeCloseTo(MAIN_BAND.target, 0);
  });

  it('reads nothing past apogee without one', async () => {
    const f = simpleFigures((await fly(SPORT)).result);
    expect(f.deployVelocity).toBeNull();
    expect(f.landingVelocity).toBeNull();
    expect(f.flightTime).toBeNull();
  });
});

describe('the simple rocket inputs', () => {
  it('needs room for a 4:1 nose, and for the fin root behind it', () => {
    expect(simpleProblem({ ...SPORT, lengthM: 0.0248 * 4 })).toBe('tooShort');
    // The stand-in root is three diameters.
    expect(simpleProblem({ ...SPORT, lengthM: 0.0248 * 5, cgM: 0.06 })).toBe('finsTooLong');
    const fins = { count: 3, shape: 'trapezoid' as const, rootChordM: 0.02, spanM: null };
    expect(simpleProblem({ ...SPORT, lengthM: 0.0248 * 5, cgM: 0.06, fins })).toBeNull();
    expect(simpleProblem(SPORT)).toBeNull();
  });

  it('draws a parabolic fin from root leading edge round to root trailing edge', () => {
    const pts = parabolicOutline(0.06, 0.04);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.at(-2)).toEqual([0.06, 0.04]);
    expect(pts.at(-1)).toEqual([0.06, 0]);
    for (let i = 1; i < pts.length - 1; i++) expect(pts[i]![1]).toBeGreaterThanOrEqual(pts[i - 1]![1]);
  });

  it('needs the CG on the rocket', () => {
    expect(simpleProblem({ ...SPORT, cgM: 0 })).toBe('cgOutside');
    expect(simpleProblem({ ...SPORT, cgM: 0.45 })).toBe('cgOutside');
    expect(simpleProblem({ ...SPORT, cgM: 0.3 })).toBeNull();
  });

  it('needs the mount inside the body', () => {
    expect(simpleProblem({ ...SPORT, mountDiameterM: 0.0248 })).toBe('mountTooWide');
    // A hair narrower is a minimum-diameter rocket, not a mistake.
    expect(simpleProblem({ ...SPORT, mountDiameterM: 0.024 })).toBeNull();
  });

  it('takes motors no wider than the mount and no longer than the body tube', () => {
    const fit = simpleMountFit(SPORT);
    expect(fit.bore).toBeCloseTo(18, 6);
    expect(fit.maxLength).toBeCloseTo((0.45 - 0.0248 * 4) * 1000, 6);
  });
});
