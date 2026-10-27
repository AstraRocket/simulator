import { describe, it, expect, vi } from 'vitest';
import { activePerfCount, liftoffTwr, passesPerf, twrField, PERF_FIELDS } from '../../../src/services/motors/motorPerf';
import { filterMotors, type CatalogMotor } from '../../../src/services/motors/motorDb';

vi.mock('../../../src/services/app/remoteData', () => ({ fetchCatalog: vi.fn() }));
vi.mock('../../../src/services/motors/motorStore', () => ({
  getMotorStore: () => ({ listCustomMotors: async () => [] }),
}));

const motor = (p: Partial<CatalogMotor>): CatalogMotor =>
  ({
    designation: 'F67W',
    manufacturer: 'AeroTech',
    class: 'F',
    diameter: 29,
    impulse: 70,
    burn: 1.1,
    mass: 80,
    ...p,
  }) as CatalogMotor;

/**
 * thrustcurve.org's advanced search, as filter bounds: average and peak thrust,
 * burn time, weights and length, each held in SI.
 */
describe('performance filter bounds', () => {
  it('passes a motor with no bounds set', () => {
    expect(passesPerf(motor({}), {})).toBe(true);
    expect(passesPerf(motor({}), { burn: [null, null] })).toBe(true);
  });

  it('bounds the figure inclusively at both ends', () => {
    const m = motor({ maxThrust: 100 });
    expect(passesPerf(m, { maxThrust: [100, 100] })).toBe(true);
    expect(passesPerf(m, { maxThrust: [101, null] })).toBe(false);
    expect(passesPerf(m, { maxThrust: [null, 99] })).toBe(false);
  });

  /** The catalog states grams and millimeters; a bound is typed and held in SI. */
  it('compares weights and length in SI', () => {
    const m = motor({ mass: 80, propWeightG: 40, length: 114 });
    expect(passesPerf(m, { mass: [0.079, 0.081] })).toBe(true);
    expect(passesPerf(m, { propWeight: [0.05, null] })).toBe(false);
    expect(passesPerf(m, { length: [null, 0.1] })).toBe(false);
  });

  /** The dashboard column falls back to impulse over burn; so does the filter. */
  it('reads average thrust the way the column does', () => {
    expect(passesPerf(motor({ impulse: 70, burn: 1, avgThrust: undefined }), { avgThrust: [69, 71] })).toBe(true);
    expect(passesPerf(motor({ avgThrust: 50 }), { avgThrust: [69, 71] })).toBe(false);
  });

  /** A motor the filter could not check is not shown as though it had been. */
  it('leaves out a motor that does not state the bounded figure', () => {
    const m = motor({ maxThrust: undefined });
    expect(passesPerf(m, { maxThrust: [0, null] })).toBe(false);
    expect(passesPerf(m, { burn: [0, null] })).toBe(true);
  });

  /** Estimated, as the dashboard column is: total impulse over propellant weight. */
  it('bounds the estimated specific impulse, leaving out a motor with no propellant weight', () => {
    // 70 N·s from 40 g of propellant: about 178 s.
    const m = motor({ impulse: 70, propWeightG: 40 });
    expect(passesPerf(m, { isp: [170, 190] })).toBe(true);
    expect(passesPerf(m, { isp: [200, null] })).toBe(false);
    expect(passesPerf(motor({ propWeightG: undefined }), { isp: [0, null] })).toBe(false);
  });

  /**
   * Average thrust over liftoff weight, the figure the usual 5 : 1 rule is
   * stated in. Offered only where there is a rocket to lift.
   */
  it('works out thrust-to-weight from what the motor lifts', () => {
    // 63.6 N average, 80 g motor, 0.5 kg of airframe and 0.1 kg of other motors.
    const m = motor({ avgThrust: 63.6, mass: 80 });
    const twr = liftoffTwr(m, { dryKg: 0.5, otherMotorsKg: 0.1, count: 1 })!;
    expect(twr).toBeCloseTo(63.6 / (0.68 * 9.80665), 9);
    // A cluster of three: three times the thrust, three motors of weight.
    const three = liftoffTwr(m, { dryKg: 0.5, otherMotorsKg: 0.1, count: 3 })!;
    expect(three).toBeCloseTo((3 * 63.6) / (0.84 * 9.80665), 9);
  });

  it('filters on thrust-to-weight only when the field is offered', () => {
    const m = motor({ avgThrust: 63.6, mass: 80 });
    const fields = [...PERF_FIELDS, twrField({ dryKg: 0.5, otherMotorsKg: 0, count: 1 })];
    // About 11 : 1.
    expect(passesPerf(m, { twr: [5, null] }, fields)).toBe(true);
    expect(passesPerf(m, { twr: [20, null] }, fields)).toBe(false);
    // Without the field there is nothing to read the bound against.
    expect(passesPerf(m, { twr: [20, null] })).toBe(true);
  });

  it('counts the fields that carry a bound', () => {
    expect(activePerfCount({ burn: [1, null], mass: [null, null], length: [null, 0.2] })).toBe(2);
  });

  it('is applied by filterMotors', () => {
    const short = motor({ designation: 'A', burn: 0.5 });
    const long = motor({ designation: 'B', burn: 3 });
    const out = filterMotors([short, long], {
      classes: new Set(),
      manufacturers: new Set(),
      text: '',
      perf: { burn: [1, null] },
    });
    expect(out.map((m) => m.designation)).toEqual(['B']);
  });
});
