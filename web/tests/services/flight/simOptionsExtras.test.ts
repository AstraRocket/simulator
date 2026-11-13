// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { simConditions, type SimPrefs } from '../../../src/services/flight/simulations';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { specToTree, type RocketSpec } from '../../testing/specTree';
import type { LaunchConditions } from '../../../src/services/design/orkTree';
import type { CompleteLaunch } from '../../../src/services/flight/requiredLaunch';

const deg2rad = (d: number) => (d * Math.PI) / 180;

const base: CompleteLaunch = {
  launchRodLengthM: 1,
  launchRodAngleDeg: 0,
  windAverage: 4,
  windStdDev: 0.4,
  launchAltitudeM: 0,
  latitudeDeg: 28.61,
  longitudeDeg: -80.6,
  temperatureC: null,
  pressureHPa: null,
};

const prefs: SimPrefs = {
  timeStep: 0.05,
  maxTime: 1200,
  maxAngleStep: deg2rad(3),
  stepper: 'rk4',
  randomSeed: 42,
  deploymentSpeedWarn: 20,
  mainHighSpeedWarn: 30.48,
  mainLowSpeedWarn: 15.24,
  drogueLowSpeedWarn: 3.048,
  guideAwareRodClearance: false,
  railExitVelocityMin: 15,
};

describe('simConditions carries humidity, gravity and the angle step', () => {
  it('omits humidity entirely when it is ISA', () => {
    // The bridge keeps ISA only when all three keys are absent; 0 would be a bone-dry launch.
    expect(simConditions(base, prefs).relativeHumidity).toBeUndefined();
  });

  it('sends humidity as the kernel fraction, not a percent', () => {
    expect(simConditions({ ...base, relativeHumidity: 0.65 }, prefs).relativeHumidity).toBe(0.65);
  });

  it('sends humidity even when temperature and pressure stay ISA', () => {
    const o = simConditions({ ...base, relativeHumidity: 0.8 }, prefs);
    expect(o.temperature).toBeUndefined();
    expect(o.pressure).toBeUndefined();
    expect(o.relativeHumidity).toBe(0.8);
  });

  it('passes the gravity model and its constant', () => {
    expect(simConditions(base, prefs).gravityModel).toBeUndefined(); // bridge defaults to WGS
    const o = simConditions({ ...base, gravityModel: 'constant', constantGravity: 9.81 }, prefs);
    expect(o.gravityModel).toBe('constant');
    expect(o.constantGravity).toBe(9.81);
  });

  it('passes the maximum angle step in radians', () => {
    expect(simConditions(base, prefs).maxAngleStep).toBeCloseTo(deg2rad(3), 12);
    expect(simConditions(base, { ...prefs, maxAngleStep: deg2rad(1) }).maxAngleStep).toBeCloseTo(deg2rad(1), 12);
  });

  it('leaves the angle step out when there are no prefs at all', () => {
    expect(simConditions(base).maxAngleStep).toBeUndefined();
  });

  it('passes the stepper, and leaves it to the kernel when there are no prefs', () => {
    expect(simConditions(base, prefs).stepper).toBe('rk4');
    expect(simConditions(base, { ...prefs, stepper: 'rk6' }).stepper).toBe('rk6');
    expect(simConditions(base).stepper).toBeUndefined();
  });
});

describe('humidity, gravity and the Earth model round-trip through .ork', () => {
  const spec = {
    noseCone: { length: 0.1, aftRadius: 0.013, thickness: 0.001 },
    bodyTube: { length: 0.2, outerRadius: 0.013, thickness: 0.0005 },
    fins: { count: 4, rootChord: 0.06, tipChord: 0.03, sweep: 0.03, height: 0.05, thickness: 0.003 },
    motorMount: { length: 0.07, outerRadius: 0.0092, thickness: 0.0004 },
    parachute: { diameter: 0.3 },
  } as unknown as RocketSpec;
  const { tree } = specToTree(spec);
  const roundTrip = (launch: LaunchConditions) => importOrk(exportOrk({ name: 'Opts', tree, launch })).launch;

  it('carries humidity, and leaves ISA alone without it', () => {
    expect(roundTrip({ ...base, relativeHumidity: 0.65 })?.relativeHumidity).toBeCloseTo(0.65, 12);
    expect(exportOrk({ name: 'Opts', tree, launch: base })).toContain('<atmosphere model="isa"/>');
  });

  it('leaves ISA once humidity alone is set', () => {
    const xml = exportOrk({ name: 'Opts', tree, launch: { ...base, relativeHumidity: 0.9 } });
    expect(xml).not.toContain('<atmosphere model="isa"/>');
    expect(xml).toContain('<baserelativehumidity>0.9</baserelativehumidity>');
  });

  it("reads desktop's humidity element, and the alternate spelling", () => {
    const xml = exportOrk({
      name: 'Opts',
      tree,
      launch: { ...base, temperatureC: 20, pressureHPa: 1000, relativeHumidity: 0.5 },
    });
    for (const [from, to] of [
      ['<baserelativehumidity>0.5</baserelativehumidity>', '<baserelativehumidity>0.3</baserelativehumidity>'],
      ['<baserelativehumidity>0.5</baserelativehumidity>', '<relativehumidity>0.3</relativehumidity>'],
    ]) {
      expect(importOrk(xml.replace(from!, to!)).launch?.relativeHumidity).toBeCloseTo(0.3, 12);
    }
  });

  it('carries a constant gravity model, and writes nothing for the default', () => {
    const back = roundTrip({ ...base, gravityModel: 'constant', constantGravity: 9.81 });
    expect(back?.gravityModel).toBe('constant');
    expect(back?.constantGravity).toBeCloseTo(9.81, 12);
    expect(exportOrk({ name: 'Opts', tree, launch: base })).not.toContain('<gravity');
  });

  // OpenRocketSaver.java:402-409 writes this element, and GravityHandler reads only it.
  it('writes constant gravity as the element desktop writes and reads', () => {
    const xml = exportOrk({ name: 'Opts', tree, launch: { ...base, gravityModel: 'constant', constantGravity: 9.81 } });
    expect(xml).toMatch(/<gravity model="constant">\s*<value>9\.81<\/value>\s*<\/gravity>/);
    expect(xml).not.toContain('<gravitymodel>');
    expect(xml).not.toContain('<constantgravity>');
  });

  it("reads a desktop file's gravity element (GravityHandler)", () => {
    const xml = exportOrk({ name: 'Opts', tree, launch: base }).replace(
      '</conditions>',
      '<gravity model="constant"><value>9.7</value></gravity></conditions>',
    );
    const launch = importOrk(xml).launch;
    expect(launch?.gravityModel).toBe('constant');
    expect(launch?.constantGravity).toBeCloseTo(9.7, 12);
    const wgs = exportOrk({ name: 'Opts', tree, launch: base }).replace(
      '</conditions>',
      '<gravity model="wgs"/></conditions>',
    );
    expect(importOrk(wgs).launch?.gravityModel).toBe('wgs');
  });

  it('still reads the bare gravitymodel pair', () => {
    const xml = exportOrk({ name: 'Opts', tree, launch: base }).replace(
      '</conditions>',
      '<gravitymodel>Constant</gravitymodel><constantgravity>9.6</constantgravity></conditions>',
    );
    expect(importOrk(xml).launch?.constantGravity).toBeCloseTo(9.6, 12);
  });

  it('keeps the Earth model that was chosen', () => {
    expect(roundTrip({ ...base, geodetic: 'wgs84' })?.geodetic).toBe('wgs84');
    expect(roundTrip({ ...base, geodetic: 'flat' })?.geodetic).toBe('flat');
  });
});
